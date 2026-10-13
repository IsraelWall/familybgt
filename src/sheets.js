// Data layer: one Google Sheet per budget, in the owner's Drive (scope drive.file).
// Rules: read UNFORMATTED_VALUE, write RAW (no locale parsing, no formulas), ids are UUIDs,
// rows are never deleted (soft delete), transactions and savings entries are append-only.
import { gfetch, DRIVE, SHEETS } from './google/api.js'

export const SCHEMA_VERSION = 1
export const APP_TAG = { key: 'budgetApp', value: 'v1' }

export const TABS = {
  BudgetConfig: ['key', 'value'],
  FixedExpenses: ['id', 'name', 'amount', 'currency', 'previous_amount', 'is_active', 'sort_order', 'deleted'],
  IncomeSources: ['id', 'name', 'amount', 'currency', 'previous_amount', 'sort_order', 'deleted'],
  VariableCategories: ['id', 'name', 'budget', 'sort_order', 'deleted'],
  Savings: ['id', 'name', 'currency', 'sort_order', 'deleted'],
  SavingsEntries: ['id', 'saving_id', 'amount', 'kind', 'added_at'],
  OneTimeIncome: ['id', 'description', 'amount', 'currency', 'added_at', 'deleted'],
  VariableTransactions: ['id', 'category_id', 'amount', 'added_at'],
  MonthlyReports: ['id', 'month', 'year', 'rate_snapshot', 'report_json', 'score'],
}
const TAB_NAMES = Object.keys(TABS)

// ---------- pure helpers (unit tested) ----------

export function colLetter(i) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function rowsToObjects(values = []) {
  const [header = [], ...rows] = values
  return rows
    .filter(r => r.some(c => c !== '' && c != null))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i] === '' ? null : r[i] ?? null])))
    .filter(o => o.deleted !== true && o.deleted !== 'TRUE')
}

export function objectToRow(tab, obj) {
  return TABS[tab].map(h => {
    const v = obj[h]
    return v === undefined || v === null ? '' : v
  })
}

export const newId = () => crypto.randomUUID()

// ---------- discovery and creation ----------

const q = s => encodeURIComponent(s)

export async function findBudgets() {
  const query = `appProperties has { key='${APP_TAG.key}' and value='${APP_TAG.value}' } and trashed=false`
  const r = await gfetch(`${DRIVE}/files?q=${q(query)}&fields=files(id,name,owners(emailAddress,displayName),ownedByMe,modifiedTime)&orderBy=modifiedTime desc`)
  return r.files || []
}

export async function getFileMeta(id) {
  return gfetch(`${DRIVE}/files/${id}?fields=id,name,appProperties,trashed,ownedByMe,owners(emailAddress)`)
}

export async function whoAmI() {
  const r = await gfetch(`${DRIVE}/about?fields=user(emailAddress,displayName)`)
  return r.user
}

export async function createBudget({ name = 'FamilyBGT', main_currency, second_currency = '', cycle_start_day = 1, language_default = 'en' }) {
  // Tag in the same call that creates the file, so a later failure never leaves an untagged orphan
  const file = await gfetch(`${DRIVE}/files?fields=id,name`, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.spreadsheet', appProperties: { [APP_TAG.key]: APP_TAG.value } }),
  })
  await ensureSchema(file.id)
  await writeConfig(file.id, {
    schema_version: SCHEMA_VERSION, main_currency, second_currency, exchange_rate: '',
    rate_updated_at: '', language_default, cycle_start_day,
  })
  return file
}

// Adds missing tabs and header rows. Safe to run on every load (repairs a half-created budget).
export async function ensureSchema(id) {
  const meta = await gfetch(`${SHEETS}/${id}?fields=sheets(properties(sheetId,title))`)
  const existing = meta.sheets.map(s => s.properties)
  const missing = TAB_NAMES.filter(t => !existing.some(s => s.title === t))
  if (missing.length) {
    const requests = missing.map(title => ({ addSheet: { properties: { title } } }))
    // The default first sheet ("Sheet1", or a localized name) is removed once our tabs exist
    const stray = existing.filter(s => !TAB_NAMES.includes(s.title))
    if (existing.length && stray.length === existing.length) requests.push(...stray.map(s => ({ deleteSheet: { sheetId: s.sheetId } })))
    await gfetch(`${SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) })
  }
  const heads = await gfetch(`${SHEETS}/${id}/values:batchGet?${TAB_NAMES.map(t => `ranges=${q(`${t}!1:1`)}`).join('&')}`)
  const data = []
  heads.valueRanges.forEach((vr, i) => {
    const tab = TAB_NAMES[i]
    const have = vr.values?.[0] || []
    if (TABS[tab].some((h, j) => have[j] !== h)) data.push({ range: `${tab}!A1`, values: [TABS[tab]] })
  })
  if (data.length) {
    await gfetch(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) })
  }
}

// ---------- reads ----------

export async function loadAll(id) {
  const ranges = TAB_NAMES.map(t => `ranges=${q(`${t}!A1:Z`)}`).join('&')
  const r = await gfetch(`${SHEETS}/${id}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`)
  const out = {}
  r.valueRanges.forEach((vr, i) => { out[TAB_NAMES[i]] = rowsToObjects(vr.values) })
  out.config = Object.fromEntries(out.BudgetConfig.map(row => [row.key, row.value]))
  return out
}

// ---------- writes ----------

export async function append(id, tab, obj) {
  const row = { ...obj, id: obj.id || newId() }
  await gfetch(`${SHEETS}/${id}/values/${q(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({ values: [objectToRow(tab, row)] }),
  })
  return row
}

async function rowNumberOf(id, tab, keyValue) {
  const r = await gfetch(`${SHEETS}/${id}/values/${q(`${tab}!A:A`)}?valueRenderOption=UNFORMATTED_VALUE`)
  const idx = (r.values || []).findIndex((v, i) => i > 0 && String(v[0]) === String(keyValue))
  return idx < 0 ? null : idx + 1
}

// Writes only the changed cells, found by id right before writing, so concurrent edits of
// other fields or other rows by a partner are never overwritten.
export async function update(id, tab, rowId, patch) {
  const rowNum = await rowNumberOf(id, tab, rowId)
  if (!rowNum) throw new Error(`Row not found in ${tab}`)
  const data = Object.entries(patch)
    .filter(([k]) => TABS[tab].includes(k) && k !== 'id')
    .map(([k, v]) => ({ range: `${tab}!${colLetter(TABS[tab].indexOf(k))}${rowNum}`, values: [[v ?? '']] }))
  if (data.length) await gfetch(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) })
}

export const softDelete = (id, tab, rowId) => update(id, tab, rowId, { deleted: true })

// Upsert by key: used for BudgetConfig (key) and MonthlyReports (id = YYYY-MM)
export async function upsert(id, tab, keyValue, obj) {
  const rowNum = await rowNumberOf(id, tab, keyValue)
  if (!rowNum) return append(id, tab, { ...obj, [TABS[tab][0]]: keyValue })
  const row = objectToRow(tab, { ...obj, [TABS[tab][0]]: keyValue })
  await gfetch(`${SHEETS}/${id}/values/${q(`${tab}!A${rowNum}`)}?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values: [row] }),
  })
  return obj
}

// Two calls at most: one batch update for existing keys, one append for new keys
export async function writeConfig(id, entries) {
  const r = await gfetch(`${SHEETS}/${id}/values/${q('BudgetConfig!A:A')}?valueRenderOption=UNFORMATTED_VALUE`)
  const keys = (r.values || []).map(v => String(v[0] ?? ''))
  const updates = [], fresh = []
  for (const [key, value] of Object.entries(entries)) {
    const idx = keys.indexOf(key)
    if (idx > 0) updates.push({ range: `BudgetConfig!B${idx + 1}`, values: [[value ?? '']] })
    else fresh.push([key, value ?? ''])
  }
  if (updates.length) await gfetch(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: updates }) })
  if (fresh.length) {
    await gfetch(`${SHEETS}/${id}/values/${q('BudgetConfig!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', body: JSON.stringify({ values: fresh }),
    })
  }
}

export async function shareWith(id, email) {
  const msg = 'You were invited to a shared family budget on FamilyBGT. Open https://israelwall.github.io/familybgt/ , sign in with this Google account and choose "Join a budget shared with me".'
  return gfetch(`${DRIVE}/files/${id}/permissions?sendNotificationEmail=true&emailMessage=${q(msg)}`, {
    method: 'POST', body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  })
}
