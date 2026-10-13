// Pure budget math: cycles, currency conversion, derived balances. No I/O (unit tested).

// Budget cycle: from cycle_start_day of one month to the day before it in the next month.
export function clampStartDay(d) {
  const n = Math.round(Number(d) || 1)
  return Math.min(28, Math.max(1, n))
}

export function cycleOf(date, startDay = 1) {
  const sd = clampStartDay(startDay)
  const y = date.getFullYear(), m = date.getMonth()
  const start = date.getDate() >= sd ? new Date(y, m, sd) : new Date(y, m - 1, sd)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, sd) // exclusive
  return { start, end, month: start.getMonth() + 1, year: start.getFullYear(), key: cycleKey(start) }
}

export function previousCycle(date, startDay = 1) {
  const cur = cycleOf(date, startDay)
  return cycleOf(new Date(cur.start.getFullYear(), cur.start.getMonth() - 1, clampStartDay(startDay)), startDay)
}

export function cycleForReport(month, year, startDay = 1) {
  return cycleOf(new Date(year, month - 1, clampStartDay(startDay)), startDay)
}

export function cycleKey(start) {
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
}

export function inCycle(iso, cycle) {
  const t = Date.parse(iso)
  return !Number.isNaN(t) && t >= cycle.start.getTime() && t < cycle.end.getTime()
}

// rate = units of the second currency per 1 unit of the main currency
export function toMain(amount, currency, { main, second, rate }) {
  const a = Number(amount) || 0
  if (!currency || currency === main) return a
  if (currency === second && rate > 0) return a / rate
  return a
}

const DIGITS = {}
export function fractionDigits(currency) {
  if (!(currency in DIGITS)) {
    try { DIGITS[currency] = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits }
    catch { DIGITS[currency] = 2 }
  }
  return DIGITS[currency]
}

export function roundMoney(amount, currency) {
  const f = 10 ** fractionDigits(currency)
  return Math.round((Number(amount) || 0) * f) / f
}

// sign: 'auto' (minus only) or 'always' (+/-). The sign is placed by Intl, so it sits correctly in RTL too.
export function formatMoney(amount, currency, { locale = 'en', digits = 0, sign = 'auto' } = {}) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: 0, signDisplay: sign === 'always' ? 'exceptZero' : 'auto' }).format(Number(amount) || 0)
  } catch {
    return `${Math.round(Number(amount) || 0)} ${currency}`
  }
}

export function currencySymbol(currency, locale = 'en') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(p => p.type === 'currency')?.value || currency
  } catch { return currency }
}

// Actual spend per category in a cycle = sum of its transactions (signed)
export function actualsByCategory(transactions, cycle) {
  const out = {}
  for (const t of transactions) {
    if (!inCycle(t.added_at, cycle)) continue
    out[t.category_id] = (out[t.category_id] || 0) + (Number(t.amount) || 0)
  }
  return out
}

// Savings balance = sum of all its entries; previous = balance before the latest entry
export function savingBalance(entries, savingId) {
  const mine = entries.filter(e => e.saving_id === savingId).sort((a, b) => Date.parse(a.added_at) - Date.parse(b.added_at))
  const balance = mine.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const last = mine[mine.length - 1]
  return { balance, previous: last ? balance - (Number(last.amount) || 0) : 0, lastChange: last ? Number(last.amount) || 0 : 0 }
}

export const COMMON_CURRENCIES = ['ILS', 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'RON', 'TRY', 'BRL', 'MXN', 'ZAR', 'INR']
