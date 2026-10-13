import { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'
import * as db from './sheets.js'
import { signIn } from './google/auth.js'
import { AuthNeeded } from './google/api.js'
import { diffFixed, budgetScore } from './report/score.js'
import { useI18n } from './i18n.js'
import LanguageSwitch from './LanguageSwitch.jsx'
import {
  cycleOf, previousCycle, cycleForReport, inCycle, toMain, roundMoney, formatMoney, currencySymbol,
  actualsByCategory, savingBalance, clampStartDay,
} from './budget.js'

function parseReportJson(r) {
  try { return r.report_json ? JSON.parse(r.report_json) : null } catch { return null }
}
const byMonthDesc = (a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month)
const scoreOf = r => { const j = parseReportJson(r); return j ? budgetScore(j.categories).score : Number(r.score) || null }
const nowIso = () => new Date().toISOString()
const num = v => Number(v) || 0

async function fetchLiveRate(main, second) {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${main}`)
    const data = await res.json()
    const live = Number(data.rates?.[second]) || 0
    return live > 0 ? live : null
  } catch { return null }
}

export default function App({ budgetId, user, onSignOut, onSwitchBudget }) {
  const { t, lang, locale } = useI18n()
  const [now] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeSection, setActiveSection] = useState('dashboard')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [authRetry, setAuthRetry] = useState(null)

  const [config, setConfig] = useState({})
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [incomeSources, setIncomeSources] = useState([])
  const [variableCategories, setVariableCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [savings, setSavings] = useState([])
  const [savingsEntries, setSavingsEntries] = useState([])
  const [oneTimeIncome, setOneTimeIncome] = useState([])
  const [monthlyReports, setMonthlyReports] = useState([])

  const [editingRate, setEditingRate] = useState(false)
  const [rateIsLive, setRateIsLive] = useState(false)
  const [editingFixed, setEditingFixed] = useState(null)
  const [editFixedData, setEditFixedData] = useState({})
  const [editingIncome, setEditingIncome] = useState(null)
  const [editIncomeData, setEditIncomeData] = useState({})
  const [addIncomeSourceForm, setAddIncomeSourceForm] = useState(false)
  const [newIncomeSource, setNewIncomeSource] = useState({ name: '', amount: '', currency: '' })
  const [addFixedForm, setAddFixedForm] = useState(false)
  const [newFixed, setNewFixed] = useState({ name: '', amount: '', currency: '' })
  const [addCategoryForm, setAddCategoryForm] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', budget: '' })
  const [varInputs, setVarInputs] = useState({})
  const [addSavingForm, setAddSavingForm] = useState(false)
  const [newSaving, setNewSaving] = useState({ name: '', amount: '', currency: '' })
  const [savingInputs, setSavingInputs] = useState({})
  const [newIncomeForm, setNewIncomeForm] = useState({ description: '', amount: '', currency: '' })
  const [closeTarget, setCloseTarget] = useState(null)
  const [endMonthResult, setEndMonthResult] = useState(null)
  const [expandedReport, setExpandedReport] = useState(null)
  const [historyFilter, setHistoryFilter] = useState('last3')
  const [showFixedItems, setShowFixedItems] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const main = config.main_currency || 'EUR'
  const second = config.second_currency || ''
  const rate = num(config.exchange_rate) || null
  const startDay = clampStartDay(config.cycle_start_day)
  const cur = useMemo(() => ({ main, second, rate }), [main, second, rate])
  const currencies = [main, second].filter(Boolean)

  const m = (n, c = main, digits = 0) => formatMoney(n, c, { digits, locale })
  const ms = (n, c = main) => formatMoney(n, c, { locale, sign: 'always' })
  const inSecond = n => (second && rate ? formatMoney(n * rate, second, { locale }) : null)
  const tm = useCallback((amount, currency) => toMain(amount, currency, cur), [cur])
  const sym = currencySymbol(main, locale)
  const arrow = lang === 'he' ? '←' : '→'
  const reasonLine = r => r.code === 'total_over' ? t('reasonTotalOver', { pct: r.pct }) : t('reasonCategoryOver', { name: r.name, pct: r.pct })

  // ---------- load ----------
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setLoadError('')
      try {
        let data
        try {
          data = await db.loadAll(budgetId)
          if (!data.config.schema_version) throw new Error('schema missing')
        } catch (e) {
          if (e instanceof AuthNeeded) throw e
          await db.ensureSchema(budgetId) // repairs a half-created or older budget
          data = await db.loadAll(budgetId)
        }
        if (cancelled) return
        setConfig(data.config)
        setFixedExpenses(data.FixedExpenses.sort((a, b) => num(a.sort_order) - num(b.sort_order)))
        setIncomeSources(data.IncomeSources.sort((a, b) => num(a.sort_order) - num(b.sort_order)))
        setVariableCategories(data.VariableCategories.sort((a, b) => num(a.sort_order) - num(b.sort_order)))
        setTransactions(data.VariableTransactions)
        setSavings(data.Savings.sort((a, b) => num(a.sort_order) - num(b.sort_order)))
        setSavingsEntries(data.SavingsEntries)
        setOneTimeIncome(data.OneTimeIncome)
        setMonthlyReports(data.MonthlyReports.sort(byMonthDesc))
        if (data.config.second_currency) {
          const live = await fetchLiveRate(data.config.main_currency, data.config.second_currency)
          if (live && !cancelled) {
            setConfig(c => ({ ...c, exchange_rate: live }))
            setRateIsLive(true)
            // Stored in the sheet at most every 12 hours, as the fallback when the rate service is down
            const age = Date.now() - (Date.parse(data.config.rate_updated_at) || 0)
            if (age > 12 * 3600 * 1000) db.writeConfig(budgetId, { exchange_rate: live, rate_updated_at: nowIso() }).catch(() => {})
          }
        }
      } catch (e) {
        if (cancelled) return
        if (e instanceof AuthNeeded) setAuthRetry(() => () => window.location.reload())
        setLoadError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [budgetId])

  // ---------- write wrapper: busy state, auth retry, visible errors; inputs are cleared only on success ----------
  async function run(fn) {
    if (busy) return
    setBusy(true)
    try { await fn() }
    catch (e) {
      if (e instanceof AuthNeeded) setAuthRetry(() => fn)
      else { console.warn(e); setToast(e.message || t('saveFailed')) }
    } finally { setBusy(false) }
  }

  async function continueAfterAuth() {
    const retry = authRetry
    try {
      await signIn()
      setAuthRetry(null)
      if (retry) await run(retry)
    } catch (e) { setToast(e.message) }
  }

  // ---------- derived ----------
  const cycle = cycleOf(now, startDay)
  const actuals = actualsByCategory(transactions, cycle)
  const activeFixed = fixedExpenses.filter(e => e.is_active !== false)
  const totalFixed = activeFixed.reduce((s, e) => s + tm(e.amount, e.currency), 0)
  const totalVariableBudget = variableCategories.reduce((s, c) => s + num(c.budget), 0)
  const totalVariableActual = variableCategories.reduce((s, c) => s + (actuals[c.id] || 0), 0)
  const regularIncome = incomeSources.reduce((s, i) => s + tm(i.amount, i.currency), 0)
  const cycleOneTime = oneTimeIncome.filter(i => inCycle(i.added_at, cycle))
  const oneTimeTotal = cycleOneTime.reduce((s, i) => s + tm(i.amount, i.currency), 0)
  const totalIncome = regularIncome + oneTimeTotal
  const monthlyBalance = totalIncome - totalFixed - totalVariableBudget
  const balances = Object.fromEntries(savings.map(s => [s.id, savingBalance(savingsEntries, s.id)]))
  const totalSavings = savings.reduce((s, sv) => s + tm(balances[sv.id].balance, sv.currency), 0)

  const sortedTransactions = [...transactions].sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
  const lastTransaction = catId => sortedTransactions.find(t => t.category_id === catId)

  function timeAgo(iso) {
    const diff = Math.floor((now.getTime() - Date.parse(iso)) / 86400000)
    if (diff === 0) return t('today')
    if (diff === 1) return t('yesterday')
    return t('daysAgo', { n: diff })
  }

  const fmtDay = d => d.toLocaleString(locale, { month: 'short', day: 'numeric' })
  const cycleLabel = (r, fmt = 'short') => new Date(r.year, r.month - 1).toLocaleString(locale, { month: fmt, year: 'numeric' })
  const cycleRange = r => { const c = cycleForReport(r.month, r.year, startDay); return `${fmtDay(c.start)} – ${fmtDay(new Date(c.end.getTime() - 86400000))}` }

  // ---------- handlers ----------
  function handleRateUpdate(val) {
    const n = num(val)
    setEditingRate(false)
    if (n <= 0) return
    setConfig(c => ({ ...c, exchange_rate: n }))
    run(() => db.writeConfig(budgetId, { exchange_rate: n, rate_updated_at: nowIso() }))
  }

  const handleDeleteFixed = id => run(async () => {
    await db.softDelete(budgetId, 'FixedExpenses', id)
    setFixedExpenses(prev => prev.filter(e => e.id !== id))
  })

  const handleSaveFixed = id => run(async () => {
    const existing = fixedExpenses.find(e => e.id === id)
    const currency = editFixedData.currency || main
    const amount = roundMoney(editFixedData.amount, currency)
    const changed = existing && (num(existing.amount) !== amount || existing.currency !== currency)
    const data = { name: editFixedData.name, amount, currency, previous_amount: changed ? num(existing.amount) : existing?.previous_amount ?? '' }
    await db.update(budgetId, 'FixedExpenses', id, data)
    setFixedExpenses(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))
    setEditingFixed(null)
  })

  function startEditFixed(exp) {
    setEditingFixed(exp.id)
    setEditFixedData({ name: exp.name, amount: exp.amount ?? '', currency: exp.currency || main })
  }

  const handleAddFixed = () => run(async () => {
    if (!newFixed.name || !newFixed.amount) return
    const currency = newFixed.currency || main
    const row = await db.append(budgetId, 'FixedExpenses', {
      name: newFixed.name, amount: roundMoney(newFixed.amount, currency), currency, is_active: true, sort_order: fixedExpenses.length + 1,
    })
    setFixedExpenses(prev => [...prev, row])
    setNewFixed({ name: '', amount: '', currency: '' })
    setAddFixedForm(false)
  })

  const handleToggleFixed = exp => run(async () => {
    const is_active = exp.is_active === false
    await db.update(budgetId, 'FixedExpenses', exp.id, { is_active })
    setFixedExpenses(prev => prev.map(e => e.id === exp.id ? { ...e, is_active } : e))
  })

  const handleSaveIncomeSource = id => run(async () => {
    const existing = incomeSources.find(s => s.id === id)
    const currency = editIncomeData.currency || main
    const amount = roundMoney(editIncomeData.amount, currency)
    const changed = existing && (num(existing.amount) !== amount || existing.currency !== currency)
    const data = { name: editIncomeData.name, amount, currency, previous_amount: changed ? num(existing.amount) : existing?.previous_amount ?? '' }
    await db.update(budgetId, 'IncomeSources', id, data)
    setIncomeSources(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    setEditingIncome(null)
  })

  const handleAddIncomeSource = () => run(async () => {
    if (!newIncomeSource.name || !newIncomeSource.amount) return
    const currency = newIncomeSource.currency || main
    const row = await db.append(budgetId, 'IncomeSources', {
      name: newIncomeSource.name, amount: roundMoney(newIncomeSource.amount, currency), currency, sort_order: incomeSources.length + 1,
    })
    setIncomeSources(prev => [...prev, row])
    setNewIncomeSource({ name: '', amount: '', currency: '' })
    setAddIncomeSourceForm(false)
  })

  const handleDeleteIncomeSource = id => run(async () => {
    await db.softDelete(budgetId, 'IncomeSources', id)
    setIncomeSources(prev => prev.filter(s => s.id !== id))
  })

  const handleAddCategory = () => run(async () => {
    if (!newCategory.name || !newCategory.budget) return
    const row = await db.append(budgetId, 'VariableCategories', {
      name: newCategory.name, budget: roundMoney(newCategory.budget, main), sort_order: variableCategories.length + 1,
    })
    setVariableCategories(prev => [...prev, row])
    setNewCategory({ name: '', budget: '' })
    setAddCategoryForm(false)
  })

  function handleUpdateBudget(cat) {
    const val = prompt(t('promptBudget', { name: cat.name, currency: main }), cat.budget)
    if (val == null) return
    const n = Number(val)
    if (Number.isNaN(n) || n < 0) return
    run(async () => {
      await db.update(budgetId, 'VariableCategories', cat.id, { budget: roundMoney(n, main) })
      setVariableCategories(prev => prev.map(c => c.id === cat.id ? { ...c, budget: roundMoney(n, main) } : c))
    })
  }

  function handleRenameCategory(cat) {
    const name = prompt(t('newName'), cat.name)
    if (!name || !name.trim() || name.trim() === cat.name) return
    run(async () => {
      await db.update(budgetId, 'VariableCategories', cat.id, { name: name.trim() })
      setVariableCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: name.trim() } : c))
    })
  }

  function handleDeleteCategory(cat) {
    if (!confirm(t('confirmDeleteCategory', { name: cat.name }))) return
    run(async () => {
      await db.softDelete(budgetId, 'VariableCategories', cat.id)
      setVariableCategories(prev => prev.filter(c => c.id !== cat.id))
    })
  }

  // Each expense or return is its own row, so two partners adding at the same time never overwrite each other
  const handleSpend = (cat, sign) => run(async () => {
    const input = num(varInputs[cat.id])
    if (input <= 0) return
    const amount = sign > 0 ? roundMoney(input, main) : -roundMoney(Math.min(input, actuals[cat.id] || 0), main)
    if (amount === 0) return
    const row = await db.append(budgetId, 'VariableTransactions', { category_id: cat.id, amount, added_at: nowIso() })
    setTransactions(prev => [...prev, row])
    setVarInputs(prev => ({ ...prev, [cat.id]: '' }))
  })

  const handleAddSaving = () => run(async () => {
    if (!newSaving.name) return
    const currency = newSaving.currency || main
    const row = await db.append(budgetId, 'Savings', { name: newSaving.name, currency, sort_order: savings.length + 1 })
    const opening = roundMoney(newSaving.amount, currency)
    if (opening > 0) {
      const entry = await db.append(budgetId, 'SavingsEntries', { saving_id: row.id, amount: opening, kind: 'opening', added_at: nowIso() })
      setSavingsEntries(prev => [...prev, entry])
    }
    setSavings(prev => [...prev, row])
    setNewSaving({ name: '', amount: '', currency: '' })
    setAddSavingForm(false)
  })

  // Deposits count toward the report's savings bonus; withdrawals are adjustments
  const handleSavingTransaction = (sv, type) => run(async () => {
    const input = roundMoney(savingInputs[sv.id], sv.currency)
    if (input <= 0) return
    const balance = balances[sv.id].balance
    const amount = type === 'add' ? input : -Math.min(input, balance)
    if (amount === 0) return
    const entry = await db.append(budgetId, 'SavingsEntries', {
      saving_id: sv.id, amount, kind: type === 'add' ? 'deposit' : 'adjust', added_at: nowIso(),
    })
    setSavingsEntries(prev => [...prev, entry])
    setSavingInputs(p => ({ ...p, [sv.id]: '' }))
  })

  function handleDeleteSaving(sv) {
    if (!confirm(t('confirmDeleteSaving', { name: sv.name }))) return
    run(async () => {
      await db.softDelete(budgetId, 'Savings', sv.id)
      setSavings(prev => prev.filter(s => s.id !== sv.id))
    })
  }

  function handleRenameSaving(sv) {
    const name = prompt(t('newName'), sv.name)
    if (!name || !name.trim()) return
    run(async () => {
      await db.update(budgetId, 'Savings', sv.id, { name: name.trim() })
      setSavings(prev => prev.map(s => s.id === sv.id ? { ...s, name: name.trim() } : s))
    })
  }

  const handleAddIncome = () => run(async () => {
    if (!newIncomeForm.description || !newIncomeForm.amount) return
    const currency = newIncomeForm.currency || main
    const row = await db.append(budgetId, 'OneTimeIncome', {
      description: newIncomeForm.description, amount: roundMoney(newIncomeForm.amount, currency), currency, added_at: nowIso(),
    })
    setOneTimeIncome(prev => [...prev, row])
    setNewIncomeForm({ description: '', amount: '', currency: '' })
  })

  const handleDeleteIncome = id => run(async () => {
    await db.softDelete(budgetId, 'OneTimeIncome', id)
    setOneTimeIncome(prev => prev.filter(i => i.id !== id))
  })

  const handleInvite = () => run(async () => {
    const email = inviteEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setToast(t('invalidEmail')); return }
    await db.shareWith(budgetId, email)
    setInviteEmail('')
    setToast(t('inviteSent', { email }))
  })

  function handleStartDay(val) {
    const d = clampStartDay(val)
    setConfig(c => ({ ...c, cycle_start_day: d }))
    run(() => db.writeConfig(budgetId, { cycle_start_day: d }))
  }

  // ---------- reports ----------
  function prevReportOf(r) {
    return monthlyReports.filter(x => x.year * 12 + x.month < r.year * 12 + r.month).sort(byMonthDesc)[0]
  }
  function fixedChangesFor(r) {
    const prev = prevReportOf(r)
    return prev ? diffFixed(parseReportJson(prev)?.fixedItems, parseReportJson(r)?.fixedItems) || [] : []
  }
  // +1 for any deposit in the cycle, +2 when deposits reach 10% of income
  function depositsOf(j) {
    const items = j?.deposits || []
    const total = items.reduce((a, d) => a + d.amount, 0)
    return { items, total, bonus: total <= 0 ? 0 : total >= 0.1 * (j?.income || 0) ? 2 : 1 }
  }

  // Report snapshot of any period, from the rows in the sheet. Budgets, fixed costs and regular
  // income are today's values; expenses, one-time income and deposits are those dated in the period.
  function buildSnapshot(c) {
    const cycleActuals = actualsByCategory(transactions, c)
    const categories = variableCategories.map(cat => ({ name: cat.name, budget: num(cat.budget), actual: cycleActuals[cat.id] || 0 }))
    const fixedItems = activeFixed.map(e => ({ name: e.name, amount: roundMoney(tm(e.amount, e.currency), main) }))
    const prevReport = monthlyReports.filter(r => r.year * 12 + r.month < c.year * 12 + c.month).sort(byMonthDesc)[0]
    const fixedChanges = diffFixed(parseReportJson(prevReport || {})?.fixedItems, fixedItems)
    const depositMap = {}
    savingsEntries
      .filter(e => e.kind === 'deposit' && inCycle(e.added_at, c))
      .forEach(e => {
        const sv = savings.find(s => s.id === e.saving_id)
        const name = sv?.name || 'Savings'
        depositMap[name] = (depositMap[name] || 0) + tm(e.amount, sv?.currency || main)
      })
    const deposits = Object.entries(depositMap).map(([name, amount]) => ({ name, amount: roundMoney(amount, main) }))
    const oneTime = oneTimeIncome.filter(i => inCycle(i.added_at, c))
    const income = regularIncome + oneTime.reduce((s, i) => s + tm(i.amount, i.currency), 0)
    const { score, reasons } = budgetScore(categories)
    const reportJson = {
      main, second, rate, deposits, income, fixedTotal: totalFixed, fixedItems, fixedChanges, categories,
      savings: savings.map(s => ({ name: s.name, amount: balances[s.id].balance, currency: s.currency })),
      oneTimeIncome: oneTime.map(i => ({ description: i.description, amount: i.amount, currency: i.currency })),
    }
    return { reportJson, score, reasons }
  }

  // Closing a finished period saves its report. Nothing is reset: each period starts empty by date.
  const closingCycle = previousCycle(now, startDay)
  const reportKeys = new Set(monthlyReports.map(r => r.id))
  const hasActivity = c => transactions.some(t => inCycle(t.added_at, c)) || oneTimeIncome.some(i => inCycle(i.added_at, c))
    || savingsEntries.some(e => e.kind === 'deposit' && inCycle(e.added_at, c))
  // Offered on the Overview only when the finished period had activity, or to update its report
  const canCloseLast = hasActivity(closingCycle) || reportKeys.has(closingCycle.key)
  // Older finished periods that have activity but no report yet
  const unclosedCycles = (() => {
    const keys = new Map()
    const add = iso => {
      const c = cycleOf(new Date(iso), startDay)
      if (c.start < cycle.start && c.key !== closingCycle.key && !reportKeys.has(c.key)) keys.set(c.key, c)
    }
    transactions.forEach(t => add(t.added_at))
    oneTimeIncome.forEach(i => add(i.added_at))
    savingsEntries.filter(e => e.kind === 'deposit').forEach(e => add(e.added_at))
    return [...keys.values()].sort((a, b) => b.start - a.start)
  })()

  const handleCloseCycle = c => run(async () => {
    const { reportJson, score, reasons } = buildSnapshot(c)
    const row = { id: c.key, month: c.month, year: c.year, rate_snapshot: rate ?? '', report_json: JSON.stringify(reportJson), score }
    await db.upsert(budgetId, 'MonthlyReports', c.key, row)
    setMonthlyReports(prev => [...prev.filter(r => r.id !== c.key), row].sort(byMonthDesc))
    setCloseTarget(null)
    setEndMonthResult({ score, reasons, label: cycleLabel(c, 'long') })
  })

  function reportBody(j, changes, dep, score) {
    const cats = j.categories || []
    const varTotal = cats.reduce((a, c) => a + (c.actual || 0), 0)
    const varBudget = cats.reduce((a, c) => a + (c.budget || 0), 0)
    return (
      <>
        <table className="report-numbers" onClick={e => e.stopPropagation()}>
          <thead><tr><th>{t('category')}</th><th>{t('actual')}</th><th>{t('budget')}</th><th>{t('diff')}</th></tr></thead>
          <tbody>
            {cats.filter(c => c.budget || c.actual).map(c => (
              <tr key={c.name}>
                <td>{c.name}</td><td>{m(c.actual)}</td><td>{m(c.budget)}</td>
                <td className={c.actual > c.budget ? 'num-over' : 'num-under'}>{m(c.budget - c.actual)}</td>
              </tr>
            ))}
            <tr className="num-total"><td>{t('variableTotal')}</td><td>{m(varTotal)}</td><td>{m(varBudget)}</td>
              <td className={varTotal > varBudget ? 'num-over' : 'num-under'}>{m(varBudget - varTotal)}</td></tr>
            <tr><td>{t('fixedTotal')}</td><td>{m(j.fixedTotal)}</td><td></td><td></td></tr>
            {(j.fixedItems || []).map(it => {
              const ch = changes.find(f => f.name === it.name)
              const note = ch ? (ch.kind === 'new' ? t('isNew') : `${m(ch.from)} ${arrow} ${m(ch.to)}`) : ''
              return (
                <tr key={it.name} className="fixed-change"><td>↳ {it.name}</td><td>{m(it.amount)}</td><td>{note}</td>
                  <td className={ch ? (ch.diff > 0 ? 'num-over' : 'num-under') : ''}>{ch ? ms(ch.diff) : ''}</td></tr>
              )
            })}
            {changes.filter(f => f.kind === 'removed').map(f => (
              <tr key={f.name} className="fixed-change"><td>↳ {f.name}</td><td>{m(0)}</td><td>{t('removedPaused')}</td>
                <td className="num-under">{m(-Math.abs(f.diff))}</td></tr>
            ))}
            <tr><td>{t('income')}</td><td>{m(j.income)}</td><td></td><td></td></tr>
            <tr className="num-total"><td>{t('leftOver')}</td><td className={(j.income - j.fixedTotal - varTotal) < 0 ? 'num-over' : 'num-under'}>{m(j.income - j.fixedTotal - varTotal)}</td><td></td><td></td></tr>
          </tbody>
        </table>
        {dep.bonus > 0 && (
          <p className="savings-note">{t('deposited', { items: dep.items.map(d => `${d.name} ${m(d.amount)}`).join(', ') })}</p>
        )}
        <div className="score-reasons">
          <strong>{t('scoreLabel', { score })}</strong>{' '}
          {budgetScore(j.categories).reasons.map(x => `−${x.pts} ${reasonLine(x)}`).join(' · ') || t('noPointsLost')}
        </div>
      </>
    )
  }

  const navItems = [
    { id: 'dashboard', label: t('navOverview'), icon: '◈' },
    { id: 'fixed', label: t('navFixed'), icon: '⬛' },
    { id: 'variable', label: t('navVariable'), icon: '◎' },
    { id: 'income', label: t('navIncome'), icon: '▲' },
    { id: 'savings', label: t('navSavings'), icon: '◆' },
    { id: 'reports', label: t('navReports'), icon: '📊' },
  ]

  const currencyPicker = (value, onChange, className = 'currency-select') => currencies.length > 1 ? (
    <select className={className} value={value || main} onChange={e => onChange(e.target.value)}>
      {currencies.map(c => <option key={c} value={c}>{currencySymbol(c)} {c}</option>)}
    </select>
  ) : null

  const authBanner = authRetry && (
    <div className="auth-banner">
      <span>{t('authExpired')}</span>
      <button className="btn-primary" onClick={continueAfterAuth}>{t('continue')}</button>
    </div>
  )

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner">{t('loadingBudget')}</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="pw-screen">
        <div className="pw-card">
          <h1 className="pw-title">FamilyBGT</h1>
          {authBanner || <p className="pw-error">{t('loadFailed', { error: loadError })}</p>}
          <button className="pw-btn" onClick={() => window.location.reload()}>{t('tryAgain')}</button>
          <button className="pw-link" onClick={onSwitchBudget}>{t('chooseAnother')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {authBanner}
      {toast && <div className="toast" onClick={() => setToast('')}>{toast} <span className="toast-x">✕</span></div>}

      <header className="header">
        <div className="header-title">
          <span className="header-icon">💰</span>
          <h1>FamilyBGT</h1>
        </div>
        <div className="header-right">
          {second && (
            <div className="rate-widget">
              {editingRate ? (
                <div className="rate-edit">
                  <span className="rate-label">1 {main} =</span>
                  <input type="number" step="0.0001" min="0.0001" defaultValue={rate || ''} autoFocus className="rate-input"
                    onBlur={e => handleRateUpdate(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRateUpdate(e.target.value); if (e.key === 'Escape') setEditingRate(false) }} />
                  <span className="rate-label">{second}</span>
                </div>
              ) : (
                <button className="rate-btn" onClick={() => setEditingRate(true)}>
                  <span dir="ltr">{rate ? `1 ${main} = ${rate.toFixed(rate < 10 ? 3 : 2)} ${second}` : t('setRate', { main, second })}</span>
                  {rateIsLive && <span className="rate-live-dot" title={t('liveRate')}>●</span>}<span className="edit-icon">✎</span>
                </button>
              )}
            </div>
          )}
          <button className="icon-btn settings-btn" onClick={() => setSettingsOpen(true)} title={t('settings')}>⚙</button>
        </div>
      </header>

      <nav className="nav">
        {navItems.map(item => (
          <button key={item.id} className={`nav-btn ${activeSection === item.id ? 'active' : ''}`} onClick={() => setActiveSection(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <main className="main">

        {activeSection === 'dashboard' && (
          <section className="section">
            {(() => {
              const varPct = totalVariableBudget > 0 ? Math.min(100, (totalVariableActual / totalVariableBudget) * 100) : 0
              const varRemaining = totalVariableBudget - totalVariableActual
              const recentReports = monthlyReports.slice(0, 3)
              const isEmpty = !fixedExpenses.length && !incomeSources.length && totalVariableBudget === 0
              return (
                <>
                  <div className="dash-period">
                    <span className="dash-period-label">{t('currentPeriod')}</span>
                    <span className="dash-period-range">{fmtDay(cycle.start)} — {fmtDay(new Date(cycle.end.getTime() - 86400000))}</span>
                  </div>

                  {isEmpty && (
                    <div className="empty-state">
                      {t('emptyStart')}
                    </div>
                  )}

                  <div className="dash-kpi-grid">
                    <div className="kpi-card kpi-income">
                      <div className="kpi-label">{t('income')}</div>
                      <div className="kpi-value">{m(totalIncome)}</div>
                      {inSecond(totalIncome) && <div className="kpi-sub">{inSecond(totalIncome)}</div>}
                    </div>
                    <div className="kpi-card kpi-fixed">
                      <div className="kpi-label">{t('fixed')}</div>
                      <div className="kpi-value">{m(totalFixed)}</div>
                      {inSecond(totalFixed) && <div className="kpi-sub">{inSecond(totalFixed)}</div>}
                    </div>
                    <div className={`kpi-card ${monthlyBalance >= 0 ? 'kpi-balance-ok' : 'kpi-balance-low'}`}>
                      <div className="kpi-label">{t('balance')}</div>
                      <div className="kpi-value">{ms(monthlyBalance)}</div>
                      <div className="kpi-sub">{t('afterBudgets')}</div>
                    </div>
                  </div>

                  <div className="variable-status-card">
                    <div className="variable-status-top">
                      <div>
                        <div className="variable-status-label">{t('variableSpending')}</div>
                        <div className="variable-status-amounts">
                          <span className="variable-spent">{m(totalVariableActual)}</span>
                          <span className="variable-of"> {t('ofBudget', { amount: m(totalVariableBudget) })}</span>
                        </div>
                      </div>
                      <div className={`variable-pct-badge ${varPct >= 90 ? 'pct-danger' : varPct >= 70 ? 'pct-warn' : 'pct-ok'}`}>
                        {varPct.toFixed(0)}%
                      </div>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className={`progress-bar-fill ${totalVariableActual > totalVariableBudget ? 'progress-over' : 'progress-ok'}`}
                        style={{ width: `${varPct.toFixed(1)}%` }}
                      />
                    </div>
                    <div className="variable-status-bottom">
                      {varRemaining >= 0
                        ? <span className="var-remaining-ok">{t('remaining', { amount: m(varRemaining) })}</span>
                        : <span className="var-remaining-over">{t('overBudget', { amount: m(Math.abs(varRemaining)) })}</span>}
                    </div>
                  </div>

                  <div className="summary-box">
                    <div className="summary-row"><span>{t('income')}</span><span className="amount-positive">{ms(totalIncome)}</span></div>
                    <div className="summary-row"><span>{t('fixedExpenses')}</span><span className="amount-negative">{m(-totalFixed)}</span></div>
                    <div className="summary-row"><span>{t('variableBudget')}</span><span className="amount-negative">{m(-totalVariableBudget)}</span></div>
                    <div className="summary-divider" />
                    <div className="summary-row summary-total-row">
                      <span>{t('monthlyBalance')}</span>
                      <span className={monthlyBalance >= 0 ? 'amount-positive' : 'amount-negative'}>
                        {ms(monthlyBalance)}
                      </span>
                    </div>
                  </div>

                  <div className="savings-card-full">
                    <div className="savings-card-label">{t('totalSavings')}</div>
                    <div className="savings-card-value">{m(totalSavings)}</div>
                    {inSecond(totalSavings) && <div className="savings-card-sub">{inSecond(totalSavings)}</div>}
                  </div>

                  {recentReports.length > 0 && (
                    <div className="comparison-panel">
                      <div className="comparison-title">{t('recentPerformance')}</div>
                      <div className="comparison-rows">
                        {recentReports.map(r => {
                          const mName = new Date(r.year, r.month - 1).toLocaleString(locale, { month: 'short', year: '2-digit' })
                          const score = scoreOf(r)
                          return (
                            <div className="comparison-row" key={r.id}>
                              <span className="comparison-month">{mName}</span>
                              <div className="comparison-bar-wrap">
                                <div className="comparison-bar" style={{ width: `${(score || 0) * 10}%`, background: score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--orange)' : 'var(--red)' }} />
                              </div>
                              <span className={`comparison-score ${score >= 8 ? 'score-high' : score >= 5 ? 'score-mid' : 'score-low'}`}>
                                {score != null ? `${score}/10` : '—'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {canCloseLast && (
              <button className="end-month-btn" onClick={() => setCloseTarget(closingCycle)}>
                📅 {t('closePeriod', { label: cycleLabel(closingCycle, 'long') })}
              </button>
            )}
          </section>
        )}

        {activeSection === 'fixed' && (
          <section className="section">
            <h2 className="section-title">{t('fixedTitle')}</h2>
            {!fixedExpenses.length && <div className="empty-state">{t('fixedEmpty')}</div>}
            <div className="list">
              {fixedExpenses.map(exp => {
                const mainVal = tm(exp.amount, exp.currency)
                const isEditing = editingFixed === exp.id
                return (
                  <div className="list-row" key={exp.id}>
                    {isEditing ? (
                      <div className="edit-row-form">
                        <input className="edit-input" placeholder={t('name')} value={editFixedData.name}
                          onChange={e => setEditFixedData(p => ({ ...p, name: e.target.value }))} />
                        <div className="add-form-row">
                          {currencyPicker(editFixedData.currency, v => setEditFixedData(p => ({ ...p, currency: v })))}
                          <input className="edit-input" type="number" inputMode="decimal" placeholder={t('amount')} value={editFixedData.amount}
                            onChange={e => setEditFixedData(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="edit-actions">
                          <button className="btn-save" disabled={busy} onClick={() => handleSaveFixed(exp.id)}>{t('save')}</button>
                          <button className="btn-cancel" onClick={() => setEditingFixed(null)}>{t('cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="list-name">
                          {exp.name}
                          {exp.is_active === false && <span className="badge-paused">{t('paused')}</span>}
                        </div>
                        <div className="list-right">
                          <div className="list-amounts-col">
                            {exp.is_active !== false && <>
                              <span className="amount-eur">{m(exp.amount, exp.currency || main)}</span>
                              {(exp.currency || main) !== main
                                ? <span className="amount-ils">≈ {m(mainVal)}</span>
                                : inSecond(mainVal) && <span className="amount-ils">{inSecond(mainVal)}</span>}
                              {exp.previous_amount != null && exp.previous_amount !== '' && num(exp.previous_amount) !== num(exp.amount) && (
                                <span className="saving-prev">{t('previous', { amount: m(exp.previous_amount, exp.currency || main) })}</span>
                              )}
                            </>}
                          </div>
                          <div className="list-actions">
                            <button className="icon-btn" onClick={() => startEditFixed(exp)} title={t('edit')}>✎</button>
                            <button className={`icon-btn ${exp.is_active === false ? 'icon-btn-resume' : 'icon-btn-pause'}`}
                              onClick={() => handleToggleFixed(exp)} title={exp.is_active === false ? t('resume') : t('pause')}>
                              {exp.is_active === false ? '▶' : '⏸'}
                            </button>
                            <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteFixed(exp.id)} title={t('del')}>✕</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="list-total-row">
              <span>{t('total')}</span>
              <span>{m(totalFixed)}{inSecond(totalFixed) ? ` · ${inSecond(totalFixed)}` : ''}</span>
            </div>
            {addFixedForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder={t('expenseName')} value={newFixed.name}
                  onChange={e => setNewFixed(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  {currencyPicker(newFixed.currency, v => setNewFixed(p => ({ ...p, currency: v })))}
                  <input className="edit-input" type="number" inputMode="decimal" placeholder={t('amount')} value={newFixed.amount}
                    onChange={e => setNewFixed(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="edit-actions">
                  <button className="btn-save" disabled={busy} onClick={handleAddFixed}>{busy ? t('saving') : t('add')}</button>
                  <button className="btn-cancel" onClick={() => setAddFixedForm(false)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddFixedForm(true)}>{t('addFixed')}</button>
            )}
          </section>
        )}

        {activeSection === 'variable' && (
          <section className="section">
            <h2 className="section-title">{t('variableTitle')}</h2>
            {!variableCategories.length && <div className="empty-state">{t('variableEmpty')}</div>}
            <div className="var-list">
              {variableCategories.map(cat => {
                const actualAmt = actuals[cat.id] || 0
                const budget = num(cat.budget)
                const diff = budget - actualAmt
                const over = diff < 0
                const last = lastTransaction(cat.id)
                return (
                  <div className="var-card" key={cat.id}>
                    <div className="var-header">
                      <span className="var-name">{cat.name}</span>
                      <div className="var-header-right">
                        {budget > 0
                          ? <span className="var-budget-label">{t('budgetLabel', { amount: m(budget) })}</span>
                          : <button className="set-budget-btn" onClick={() => handleUpdateBudget(cat)}>{t('setBudget')}</button>}
                        <button className="icon-btn-sm" onClick={() => handleRenameCategory(cat)} title={t('rename')}>✎</button>
                        <button className="icon-btn-sm" onClick={() => handleUpdateBudget(cat)} title={t('editBudget')}>⇄</button>
                        <button className="icon-btn-sm" onClick={() => handleDeleteCategory(cat)} title={t('deleteCategory')}>✕</button>
                      </div>
                    </div>
                    <div className="var-actual-row">
                      <span className="var-actual-amount">{m(actualAmt)}</span>
                      <span className={`diff-pill ${over ? 'diff-over' : 'diff-under'}`}>
                        {over ? t('over', { amount: m(Math.abs(diff)) }) : t('left', { amount: m(diff) })}
                      </span>
                    </div>
                    <div className="var-actions">
                      <div className="var-input-wrap">
                        <span className="var-input-prefix">{sym}</span>
                        <input type="number" inputMode="decimal" placeholder={t('amount')} min="0" className="actual-input"
                          value={varInputs[cat.id] || ''}
                          onChange={e => setVarInputs(p => ({ ...p, [cat.id]: e.target.value }))} />
                      </div>
                      <button className="btn-add" disabled={busy} onClick={() => handleSpend(cat, 1)}>{t('addSpend')}</button>
                      <button className="btn-return" disabled={busy} onClick={() => handleSpend(cat, -1)}>{t('returnSpend')}</button>
                    </div>
                    {last && (
                      <span className="var-last-added">
                        {t('last', { amount: m(num(last.amount), main, 2), when: timeAgo(last.added_at) })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {addCategoryForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder={t('categoryName')} value={newCategory.name}
                  onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))} />
                <input className="edit-input" type="number" inputMode="decimal" placeholder={t('monthlyBudgetIn', { currency: main })} value={newCategory.budget}
                  onChange={e => setNewCategory(p => ({ ...p, budget: e.target.value }))} />
                <div className="edit-actions">
                  <button className="btn-save" disabled={busy} onClick={handleAddCategory}>{busy ? t('saving') : t('add')}</button>
                  <button className="btn-cancel" onClick={() => setAddCategoryForm(false)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddCategoryForm(true)}>{t('addCategory')}</button>
            )}
            <div className="list-total-row">
              <div>
                <div>{t('budgetTotal', { amount: m(totalVariableBudget) })}</div>
                {totalVariableActual > 0 && (
                  <div className={totalVariableActual > totalVariableBudget ? 'amount-negative' : 'amount-positive'}>
                    {t('actualTotal', { amount: m(totalVariableActual) })}
                  </div>
                )}
              </div>
              {totalVariableActual > 0 && (
                <div className={totalVariableActual > totalVariableBudget ? 'amount-negative' : 'amount-positive'}>
                  {totalVariableActual > totalVariableBudget
                    ? t('over', { amount: m(totalVariableActual - totalVariableBudget) })
                    : t('left', { amount: m(totalVariableBudget - totalVariableActual) })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeSection === 'income' && (
          <section className="section">
            <h2 className="section-title">{t('incomeTitle')}</h2>
            <h3 className="subsection-title">{t('regularIncome')}</h3>
            {!incomeSources.length && <div className="empty-state">{t('incomeEmpty')}</div>}
            <div className="list">
              {incomeSources.map(src => {
                const c = src.currency || main
                const mainVal = tm(src.amount, c)
                const isEditing = editingIncome === src.id
                return (
                  <div className="list-row" key={src.id}>
                    {isEditing ? (
                      <div className="edit-row-form">
                        <input className="edit-input" placeholder={t('name')} value={editIncomeData.name}
                          onChange={e => setEditIncomeData(p => ({ ...p, name: e.target.value }))} />
                        <div className="add-form-row">
                          {currencyPicker(editIncomeData.currency, v => setEditIncomeData(p => ({ ...p, currency: v })))}
                          <input className="edit-input" type="number" inputMode="decimal" placeholder={t('amount')} value={editIncomeData.amount}
                            onChange={e => setEditIncomeData(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="edit-actions">
                          <button className="btn-save" disabled={busy} onClick={() => handleSaveIncomeSource(src.id)}>{t('save')}</button>
                          <button className="btn-cancel" onClick={() => setEditingIncome(null)}>{t('cancel')}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="list-name">{src.name}</div>
                        <div className="list-right">
                          <div className="list-amounts-col">
                            <span className="amount-eur">{m(src.amount, c)}</span>
                            {c !== main && <span className="amount-ils">≈ {m(mainVal)}</span>}
                            {src.previous_amount != null && src.previous_amount !== '' && num(src.previous_amount) !== num(src.amount) && (
                              <span className="saving-prev">{t('previous', { amount: m(src.previous_amount, c) })}</span>
                            )}
                          </div>
                          <div className="list-actions">
                            <button className="icon-btn" onClick={() => { setEditingIncome(src.id); setEditIncomeData({ name: src.name, amount: src.amount, currency: c }) }} title={t('edit')}>✎</button>
                            <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteIncomeSource(src.id)} title={t('del')}>✕</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {addIncomeSourceForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder={t('incomeName')} value={newIncomeSource.name}
                  onChange={e => setNewIncomeSource(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  {currencyPicker(newIncomeSource.currency, v => setNewIncomeSource(p => ({ ...p, currency: v })))}
                  <input className="edit-input" type="number" inputMode="decimal" placeholder={t('amount')} value={newIncomeSource.amount}
                    onChange={e => setNewIncomeSource(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="edit-actions">
                  <button className="btn-save" disabled={busy} onClick={handleAddIncomeSource}>{busy ? t('saving') : t('add')}</button>
                  <button className="btn-cancel" onClick={() => setAddIncomeSourceForm(false)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddIncomeSourceForm(true)}>{t('addIncomeSource')}</button>
            )}
            <h3 className="subsection-title">{t('oneTimeTitle')}</h3>
            <div className="list">
              {cycleOneTime.map(inc => {
                const c = inc.currency || main
                return (
                  <div className="list-row" key={inc.id}>
                    <div className="list-name">{inc.description}</div>
                    <div className="list-right">
                      <div className="list-amounts-col">
                        <span className="amount-eur">{m(inc.amount, c)}</span>
                        {c !== main && <span className="amount-ils">≈ {m(tm(inc.amount, c))}</span>}
                      </div>
                      <div className="list-actions">
                        <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteIncome(inc.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="add-form">
              <p className="add-form-title">{t('addOneTime')}</p>
              <input className="edit-input" placeholder={t('oneTimePlaceholder')} value={newIncomeForm.description}
                onChange={e => setNewIncomeForm(p => ({ ...p, description: e.target.value }))} />
              <div className="add-form-row">
                <div className="var-input-wrap" style={{ flex: 1 }}>
                  <span className="var-input-prefix">{currencySymbol(newIncomeForm.currency || main)}</span>
                  <input type="number" inputMode="decimal" placeholder={t('amount')} className="actual-input" value={newIncomeForm.amount}
                    onChange={e => setNewIncomeForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                {currencyPicker(newIncomeForm.currency, v => setNewIncomeForm(p => ({ ...p, currency: v })))}
              </div>
              <button className="btn-primary-full" disabled={busy} onClick={handleAddIncome}>{busy ? t('saving') : t('addPlain')}</button>
            </div>
            <div className="list-total-row">
              <span>{t('totalIncome')}</span>
              <span>{m(totalIncome)}{inSecond(totalIncome) ? ` · ${inSecond(totalIncome)}` : ''}</span>
            </div>
            <p className="note">{t('oneTimeNote')}{second && rate ? ` ${t('convertedNote', { second, main, rate: rate.toFixed(3) })}` : ''}</p>
          </section>
        )}

        {activeSection === 'savings' && (
          <section className="section">
            <h2 className="section-title">{t('savingsTitle')}</h2>
            {!savings.length && <div className="empty-state">{t('savingsEmpty')}</div>}
            <div className="savings-list">
              {savings.map(sv => {
                const c = sv.currency || main
                const { balance, previous, lastChange } = balances[sv.id]
                return (
                  <div className="saving-card" key={sv.id}>
                    <div className="saving-card-header">
                      <span className="saving-name">{sv.name}</span>
                      <div className="saving-header-actions">
                        <span className="currency-badge">{c}</span>
                        <button className="icon-btn" onClick={() => handleRenameSaving(sv)} title={t('rename')}>✎</button>
                        <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteSaving(sv)} title={t('del')}>✕</button>
                      </div>
                    </div>
                    <div className="saving-amount-row">
                      <span className="saving-amount">{m(balance, c, 2)}</span>
                      {c !== main ? <span className="saving-converted">≈ {m(tm(balance, c))}</span>
                        : inSecond(balance) && <span className="saving-converted">≈ {inSecond(balance)}</span>}
                      {lastChange !== 0 && previous !== 0 && (
                        <span className={`delta-badge ${lastChange < 0 ? 'delta-down' : 'delta-up'}`}>
                          {t('vsPrev', { arrow: lastChange < 0 ? '▼' : '▲', amount: m(Math.abs(lastChange), c, 2) })}
                        </span>
                      )}
                    </div>
                    {previous > 0 && previous !== balance && (
                      <div className="saving-prev">{t('previous', { amount: m(previous, c, 2) })}</div>
                    )}
                    <div className="saving-actions">
                      <div className="var-input-wrap" style={{ flex: 1 }}>
                        <span className="var-input-prefix">{currencySymbol(c)}</span>
                        <input type="number" inputMode="decimal" placeholder={t('amount')} min="0" className="actual-input"
                          value={savingInputs[sv.id] || ''}
                          onChange={e => setSavingInputs(p => ({ ...p, [sv.id]: e.target.value }))} />
                      </div>
                      <button className="btn-add" disabled={busy} onClick={() => handleSavingTransaction(sv, 'add')}>{t('deposit')}</button>
                      <button className="btn-return" disabled={busy} onClick={() => handleSavingTransaction(sv, 'withdraw')}>{t('withdraw')}</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {addSavingForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder={t('accountName')} value={newSaving.name}
                  onChange={e => setNewSaving(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  <input className="edit-input" type="number" inputMode="decimal" placeholder={t('startingAmount')} value={newSaving.amount}
                    onChange={e => setNewSaving(p => ({ ...p, amount: e.target.value }))} style={{ flex: 1 }} />
                  {currencyPicker(newSaving.currency, v => setNewSaving(p => ({ ...p, currency: v })))}
                </div>
                <div className="edit-actions">
                  <button className="btn-save" disabled={busy} onClick={handleAddSaving}>{busy ? t('saving') : t('add')}</button>
                  <button className="btn-cancel" onClick={() => setAddSavingForm(false)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddSavingForm(true)}>{t('addSaving')}</button>
            )}
            <div className="list-total-row">
              <span>{t('totalSavingsRow')}</span>
              <span>{m(totalSavings)}{inSecond(totalSavings) ? ` · ${inSecond(totalSavings)}` : ''}</span>
            </div>
          </section>
        )}

        {activeSection === 'reports' && (
          <section className="section">
            <h2 className="section-title">{t('reportsTitle')}</h2>
            {(() => {
              const live = buildSnapshot(cycle)
              const j = live.reportJson
              return (
                <div className="report-card report-live" onClick={() => setExpandedReport(expandedReport === 'live' ? null : 'live')}>
                  <div className="report-card-header">
                    <span className="report-month">{t('thisPeriod')} <span className="report-range">{fmtDay(cycle.start)} – {fmtDay(new Date(cycle.end.getTime() - 86400000))}</span></span>
                    <div className="report-meta">
                      <span className={`score-badge score-${live.score >= 8 ? 'high' : live.score >= 5 ? 'mid' : 'low'}`}>{live.score}/10</span>
                      <span className="report-chevron">{expandedReport === 'live' ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {expandedReport === 'live' && (
                    <div className="report-expanded">
                      {reportBody(j, j.fixedChanges || [], depositsOf(j), live.score)}
                      <p className="history-note">{t('liveNote')}</p>
                    </div>
                  )}
                </div>
              )
            })()}
            {unclosedCycles.length > 0 && (
              <div className="unclosed-list">
                <p className="history-note">{t('unclosed')}</p>
                {unclosedCycles.map(c => (
                  <button key={c.key} className="add-category-btn" onClick={() => setCloseTarget(c)}>{t('closePeriod', { label: cycleLabel(c, 'long') })}</button>
                ))}
              </div>
            )}
            {monthlyReports.length === 0 ? (
              <div className="empty-state">{t('noReports')}</div>
            ) : (
              <>
              {(() => {
                const allMonths = [...monthlyReports]
                  .sort((a, b) => a.year - b.year || a.month - b.month)
                  .map(r => ({ r, j: parseReportJson(r) })).filter(x => x.j)
                if (allMonths.length === 0) return null
                const q = mo => Math.ceil(mo / 3)
                const quarters = [...new Set(allMonths.map(x => `${x.r.year}-Q${q(x.r.month)}`))]
                const picked = allMonths.filter(x => {
                  if (historyFilter === 'all') return true
                  if (historyFilter === 'last3') return allMonths.indexOf(x) >= allMonths.length - 3
                  if (historyFilter.includes('-Q')) return `${x.r.year}-Q${q(x.r.month)}` === historyFilter
                  return x.r.id === historyFilter
                })
                const months = picked.length ? picked : allMonths.slice(-3)
                const names = []
                months.forEach(x => (x.j.categories || []).forEach(c => { if (!names.includes(c.name)) names.push(c.name) }))
                const cat = (x, n) => (x.j.categories || []).find(c => c.name === n)
                const varTot = x => (x.j.categories || []).reduce((a, c) => a + (c.actual || 0), 0)
                const avg = f => months.reduce((a, x) => a + f(x), 0) / months.length
                const rows = names.filter(n => months.some(x => cat(x, n)?.actual || cat(x, n)?.budget))
                return (
                  <div className="history-section">
                    <div className="history-header">
                      <h3 className="subsection-title">{t('history', { currency: main })}</h3>
                      <select className="history-filter" value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>
                        <option value="last3">{t('last3')}</option>
                        <option value="all">{t('allMonths')}</option>
                        <optgroup label={t('quarter')}>
                          {quarters.map(k => <option key={k} value={k}>{k.replace('-', ' ')}</option>)}
                        </optgroup>
                        <optgroup label={t('singleMonth')}>
                          {[...allMonths].reverse().map(x => <option key={x.r.id} value={x.r.id}>{cycleLabel(x.r, 'long')}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div className="history-scroll">
                      <table className="report-numbers history-table">
                        <thead><tr><th>{t('category')}</th>{months.map(x => <th key={x.r.id}>{cycleLabel(x.r).replace(/ \d{4}$/, '')}</th>)}<th>{t('avg')}</th></tr></thead>
                        <tbody>
                          {rows.map(n => (
                            <tr key={n}>
                              <td>{n}</td>
                              {months.map(x => {
                                const c = cat(x, n)
                                return <td key={x.r.id} className={c && c.actual > c.budget ? 'num-over' : ''}
                                  title={c ? t('budgetLabel', { amount: m(c.budget) }) : ''}>{c ? m(c.actual) : '–'}</td>
                              })}
                              <td>{m(avg(x => cat(x, n)?.actual || 0))}</td>
                            </tr>
                          ))}
                          <tr className="num-total"><td>{t('variableTotal')}</td>{months.map(x => <td key={x.r.id}>{m(varTot(x))}</td>)}<td>{m(avg(varTot))}</td></tr>
                          <tr className="fixed-toggle" onClick={() => setShowFixedItems(v => !v)}>
                            <td>{showFixedItems ? '▾' : (lang === 'he' ? '◂' : '▸')} {t('fixedTotal')}</td>{months.map(x => <td key={x.r.id}>{m(x.j.fixedTotal)}</td>)}<td>{m(avg(x => x.j.fixedTotal || 0))}</td></tr>
                          {showFixedItems && [...new Set(months.flatMap(x => (x.j.fixedItems || []).map(i => i.name)))].map(name => (
                            <tr key={name} className="fixed-change"><td>↳ {name}</td>
                              {months.map(x => { const it = x.j.fixedItems?.find(i => i.name === name)
                                return <td key={x.r.id}>{x.j.fixedItems ? m(it ? it.amount : 0) : '–'}</td> })}
                              <td></td></tr>
                          ))}
                          <tr><td>{t('income')}</td>{months.map(x => <td key={x.r.id}>{m(x.j.income)}</td>)}<td>{m(avg(x => x.j.income || 0))}</td></tr>
                          <tr className="num-total"><td>{t('leftOver')}</td>{months.map(x => { const l = (x.j.income || 0) - (x.j.fixedTotal || 0) - varTot(x)
                            return <td key={x.r.id} className={l < 0 ? 'num-over' : 'num-under'}>{m(l)}</td> })}
                            <td>{m(avg(x => (x.j.income || 0) - (x.j.fixedTotal || 0) - varTot(x)))}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="history-note">{t('historyNote', { day: startDay })}</p>
                  </div>
                )
              })()}
              <div className="reports-list">
                {monthlyReports.map(r => {
                  const isExpanded = expandedReport === r.id
                  const j = parseReportJson(r)
                  const score = scoreOf(r)
                  const dep = depositsOf(j)
                  return (
                    <div className="report-card" key={r.id} onClick={() => setExpandedReport(isExpanded ? null : r.id)}>
                      <div className="report-card-header">
                        <span className="report-month">{cycleLabel(r, 'long')} <span className="report-range">{cycleRange(r)}</span></span>
                        <div className="report-meta">
                          {score != null && (
                            <span className={`score-badge score-${score >= 8 ? 'high' : score >= 5 ? 'mid' : 'low'}`}>{score}/10</span>
                          )}
                          {dep.bonus > 0 && (
                            <span className="bonus-badge" title={t('bonusTitle')}>💰 +{dep.bonus}</span>
                          )}
                          <span className="report-chevron">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {isExpanded && j && (
                        <div className="report-expanded">{reportBody(j, fixedChangesFor(r), dep, score)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
              </>
            )}
            {monthlyReports.length > 1 && (
              <div className="trend-section">
                <h3 className="subsection-title">{t('trendTitle')}</h3>
                <div className="trend-bars">
                  {[...monthlyReports].reverse().map(r => {
                    const mName = new Date(r.year, r.month - 1).toLocaleString(locale, { month: 'short' })
                    const score = scoreOf(r) || 0
                    return (
                      <div className="trend-bar-item" key={r.id}>
                        <div className="trend-bar-track">
                          <div className={`trend-bar-fill score-bar-${score >= 8 ? 'high' : score >= 5 ? 'mid' : 'low'}`}
                            style={{ height: `${score * 10}%` }} />
                        </div>
                        <span className="trend-bar-label">{mName}</span>
                        <span className="trend-bar-score">{score || '–'}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {closeTarget && (
        <div className="modal-overlay" onClick={() => !busy && setCloseTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{t('closeConfirmTitle', { label: cycleLabel(closeTarget, 'long') })}</h3>
            <p>
              {t('closeConfirmText', { from: fmtDay(closeTarget.start), to: fmtDay(new Date(closeTarget.end.getTime() - 86400000)) })}
              {reportKeys.has(closeTarget.key) && ` ${t('closeExists')}`}
            </p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setCloseTarget(null)} disabled={busy}>{t('cancel')}</button>
              <button className="btn-primary" onClick={() => handleCloseCycle(closeTarget)} disabled={busy}>{busy ? t('saving') : t('saveReport')}</button>
            </div>
          </div>
        </div>
      )}

      {endMonthResult && (
        <div className="modal-overlay" onClick={() => setEndMonthResult(null)}>
          <div className="modal modal-report" onClick={e => e.stopPropagation()}>
            <h3>{t('reportTitle', { label: endMonthResult.label })}</h3>
            <div className={`score-display score-${endMonthResult.score >= 8 ? 'high' : endMonthResult.score >= 5 ? 'mid' : 'low'}`}>
              {endMonthResult.score}/10
            </div>
            <p className="report-summary">
              {endMonthResult.reasons.length ? endMonthResult.reasons.map(x => `−${x.pts} ${reasonLine(x)}`).join(' · ') : t('allWithinBudget')}
            </p>
            <button className="btn-primary" onClick={() => { setEndMonthResult(null); setActiveSection('reports') }}>{t('seeReport')}</button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
            <h3>{t('settings')}</h3>
            <LanguageSwitch className="lang-switch-light" />
            <p className="setup-hint">{t('signedInAs', { email: user?.emailAddress })}</p>

            <div className="settings-group">
              <label className="setup-label">{t('invitePartner')}
                <input className="edit-input" type="email" placeholder="partner@gmail.com" value={inviteEmail} dir="ltr"
                  onChange={e => setInviteEmail(e.target.value)} />
              </label>
              <button className="btn-primary-full" disabled={busy} onClick={handleInvite}>{busy ? t('sending') : t('sendInvite')}</button>
              <p className="setup-hint">{t('inviteHint')}</p>
            </div>

            <div className="settings-group">
              <label className="setup-label">{t('periodStartDay')}
                <select className="currency-select" value={startDay} onChange={e => handleStartDay(e.target.value)}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <p className="setup-hint">{t('currenciesLine', { main })}{second ? t('secondLine', { second }) : ''}</p>
            </div>

            <div className="settings-group">
              <a className="settings-link" href={`https://docs.google.com/spreadsheets/d/${budgetId}`} target="_blank" rel="noreferrer">{t('openSheet')}</a>
              <button className="settings-link" onClick={onSwitchBudget}>{t('switchBudget')}</button>
              <button className="settings-link" onClick={onSignOut}>{t('signOut')}</button>
            </div>

            <button className="btn-cancel" onClick={() => setSettingsOpen(false)}>{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
