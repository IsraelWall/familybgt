// Temporary in-memory data layer (Phase 2 scaffold). Replaced by the Google Sheets layer in Phase 4.
const store = {}
let nextId = 1
const tbl = name => (store[name] ||= [])
const add = (name, data) => { const row = { Id: nextId++, ...data }; tbl(name).push(row); return row }
const upd = (name, id, data) => { const row = tbl(name).find(r => r.Id === id); if (row) Object.assign(row, data); return row }
const del = (name, id) => { store[name] = tbl(name).filter(r => r.Id !== id) }
const list = name => [...tbl(name)]

export async function getConfig() { return list('Config')[0] || { Id: null, exchange_rate: 3.9 } }
export async function saveConfig(id, exchange_rate) { return id ? upd('Config', id, { exchange_rate }) : add('Config', { exchange_rate }) }

export async function getFixedExpenses() { return list('FixedExpenses') }
export async function addFixedExpense(data) { return add('FixedExpenses', data) }
export async function updateFixedExpense(id, data) { return upd('FixedExpenses', id, data) }
export async function deleteFixedExpense(id) { return del('FixedExpenses', id) }
export async function toggleFixedExpense(id, is_active) { return upd('FixedExpenses', id, { is_active }) }

export async function getIncomeSources() { return list('IncomeSources') }
export async function addIncomeSource(data) { return add('IncomeSources', data) }
export async function updateIncomeSource(id, data) { return upd('IncomeSources', id, data) }
export async function deleteIncomeSource(id) { return del('IncomeSources', id) }

export async function getVariableCategories() { return list('VariableCategories') }
export async function addVariableCategory(data) { return add('VariableCategories', data) }
export async function updateVariableCategory(id, data) { return upd('VariableCategories', id, data) }

export async function getVariableActuals() { return list('VariableActuals') }
export async function post_actual(category_name) { return add('VariableActuals', { category_name, actual_eur: 0 }) }
export async function updateActual(id, actual_eur) { return upd('VariableActuals', id, { actual_eur }) }
export async function resetAllActuals(actuals) { for (const a of actuals) upd('VariableActuals', a.Id, { actual_eur: 0 }) }

export async function getSavings() { return list('Savings') }
export async function addSaving(data) { return add('Savings', data) }
export async function updateSaving(id, data) { return upd('Savings', id, data) }
export async function deleteSaving(id) { return del('Savings', id) }

export async function getOneTimeIncome() { return list('OneTimeIncome') }
export async function addOneTimeIncome(data) { return add('OneTimeIncome', data) }
export async function deleteOneTimeIncome(id) { return del('OneTimeIncome', id) }

export async function logTransaction(category_name, amount_eur) { return add('VariableTransactions', { category_name, amount_eur, added_at: new Date().toISOString() }) }
export async function getRecentTransactions() { return list('VariableTransactions') }

export async function getMonthlyReports() { return list('MonthlyReports') }
export async function upsertMonthlyReport(month, year, data) {
  const existing = tbl('MonthlyReports').find(r => r.month === month && r.year === year)
  return existing ? upd('MonthlyReports', existing.Id, data) : add('MonthlyReports', { month, year, ...data })
}
export async function updateMonthlyReport(id, data) { return upd('MonthlyReports', id, data) }
