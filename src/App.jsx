import { useState, useEffect, useCallback } from 'react'
import './App.css'
import * as db from './db.js'
import { diffFixed, budgetScore } from './report/score.js'

function cycleLabel(r, fmt = 'short') {
  return new Date(r.year, r.month - 1).toLocaleString('en', { month: fmt, year: 'numeric' })
}
function cycleRange(r) {
  const m = d => d.toLocaleString('en', { month: 'short' })
  return `5 ${m(new Date(r.year, r.month - 1))} – 4 ${m(new Date(r.year, r.month))}`
}
function parseReportJson(r) {
  try { return r.report_json ? JSON.parse(r.report_json) : null } catch { return null }
}
const eur0 = n => `€${Math.round(n || 0).toLocaleString('en')}`
// Savings deposits made with the + Deposit button are logged in VariableTransactions under this prefix.
// Only these count toward the savings bonus; editing a balance by hand never does.
const DEPOSIT_PREFIX = 'Savings deposit: '
// Score is always derived from the report snapshot, so every month follows the same formula
const scoreOf = r => { const j = parseReportJson(r); return j ? budgetScore(j.categories).score : r.score }

export default function App() {
  const [authed] = useState(true) // Phase 3: Google sign-in
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')

  const [config, setConfig] = useState({ Id: null, exchange_rate: 3.9 })
  const [fixedExpenses, setFixedExpenses] = useState([])
  const [incomeSources, setIncomeSources] = useState([])
  const [variableCategories, setVariableCategories] = useState([])
  const [variableActuals, setVariableActuals] = useState([])
  const [variableTransactions, setVariableTransactions] = useState([])
  const [savings, setSavings] = useState([])
  const [oneTimeIncome, setOneTimeIncome] = useState([])
  const [monthlyReports, setMonthlyReports] = useState([])

  const [editingRate, setEditingRate] = useState(false)
  const [rateIsLive, setRateIsLive] = useState(false)
  const [editingFixed, setEditingFixed] = useState(null)
  const [editFixedData, setEditFixedData] = useState({})
  const [editingIncome, setEditingIncome] = useState(null)
  const [editIncomeData, setEditIncomeData] = useState({})
  const [addIncomeSourceForm, setAddIncomeSourceForm] = useState(false)
  const [newIncomeSource, setNewIncomeSource] = useState({ name: '', amount_ils: '' })
  const [addFixedForm, setAddFixedForm] = useState(false)
  const [newFixed, setNewFixed] = useState({ name: '', amount: '', currency: 'EUR' })
  const [addCategoryForm, setAddCategoryForm] = useState(false)
  const [newCategory, setNewCategory] = useState({ name: '', budget_eur: '' })
  const [varInputs, setVarInputs] = useState({})
  const [addSavingForm, setAddSavingForm] = useState(false)
  const [newSaving, setNewSaving] = useState({ name: '', amount: '', currency: 'EUR' })
  const [savingInputs, setSavingInputs] = useState({})
  const [newIncomeForm, setNewIncomeForm] = useState({ description: '', amount: '', currency: 'ILS' })
  const [endMonthModal, setEndMonthModal] = useState(false)
  const [endMonthLoading, setEndMonthLoading] = useState(false)
  const [endMonthResult, setEndMonthResult] = useState(null)
  const [expandedReport, setExpandedReport] = useState(null)
  const [historyFilter, setHistoryFilter] = useState('last3')
  const [showFixedItems, setShowFixedItems] = useState(false)

  const rate = parseFloat(config.exchange_rate) || 3.9

  useEffect(() => {
    if (!authed) return
    async function load() {
      const safe = async (fn, fallback) => { try { return await fn() } catch (e) { console.warn('Fetch error:', e); return fallback } }
      try {
        const cfg = await safe(db.getConfig, { Id: null, exchange_rate: 3.6 })
        setFixedExpenses(await safe(db.getFixedExpenses, []))
        setIncomeSources(await safe(db.getIncomeSources, []))
        setVariableCategories(await safe(db.getVariableCategories, []))
        setVariableActuals(await safe(db.getVariableActuals, []))
        setVariableTransactions(await safe(db.getRecentTransactions, []))
        setSavings(await safe(db.getSavings, []))
        setOneTimeIncome(await safe(db.getOneTimeIncome, []))
        setMonthlyReports(await safe(db.getMonthlyReports, []))
        try {
          const res = await fetch('https://open.er-api.com/v6/latest/EUR')
          const data = await res.json()
          const live = parseFloat(data.rates?.ILS)
          if (live > 0) {
            cfg.exchange_rate = live
            setRateIsLive(true)
            db.saveConfig(cfg.Id, live).catch(() => {})
          }
        } catch {}
        setConfig(cfg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authed])

  const toEur = useCallback((exp) => {
    if (exp.amount_eur) return parseFloat(exp.amount_eur)
    if (exp.amount_ils) return parseFloat(exp.amount_ils) / rate
    return 0
  }, [rate])

  const totalFixedEur = fixedExpenses.filter(e => e.is_active !== false).reduce((s, e) => s + toEur(e), 0)
  const totalVariableBudget = variableCategories.reduce((s, c) => s + (parseFloat(c.budget_eur) || 0), 0)
  const totalVariableActual = variableActuals.reduce((s, a) => s + (parseFloat(a.actual_eur) || 0), 0)
  const regularIncomeEur = incomeSources.reduce((s, i) => s + (parseFloat(i.amount_ils) || 0) / rate, 0)
  const oneTimeIncomeEur = oneTimeIncome.reduce((s, i) => {
    const amt = parseFloat(i.amount) || 0
    return s + (i.currency === 'ILS' ? amt / rate : amt)
  }, 0)
  const totalIncomeEur = regularIncomeEur + oneTimeIncomeEur
  const monthlyBalance = totalIncomeEur - totalFixedEur - totalVariableBudget
  const totalSavingsEur = savings.reduce((s, sv) => {
    const amt = parseFloat(sv.amount) || 0
    return s + (sv.currency === 'ILS' ? amt / rate : amt)
  }, 0)

  function getActual(categoryName) {
    return variableActuals.find(a => a.category_name === categoryName)
  }

  function timeAgo(iso) {
    const diff = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    return `${diff} days ago`
  }

  const sortedTransactions = [...variableTransactions].sort(
    (a, b) => Date.parse(b.added_at) - Date.parse(a.added_at)
  )
  function lastTransaction(categoryName) {
    return sortedTransactions.find(t => t.category_name === categoryName)
  }

  async function handleRateUpdate(val) {
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) {
      setConfig(c => ({ ...c, exchange_rate: n }))
      db.saveConfig(config.Id, n).catch(() => {})
    }
    setEditingRate(false)
  }

  async function handleDeleteFixed(id) {
    await db.deleteFixedExpense(id)
    setFixedExpenses(prev => prev.filter(e => e.Id !== id))
  }

  async function handleSaveFixed(id) {
    const existing = fixedExpenses.find(e => e.Id === id)
    const previousAmount = existing ? (existing.amount_eur ?? existing.amount_ils ?? null) : null
    const data = {
      name: editFixedData.name,
      amount_eur: editFixedData.currency === 'EUR' ? parseFloat(editFixedData.amount) || null : null,
      amount_ils: editFixedData.currency === 'ILS' ? parseFloat(editFixedData.amount) || null : null,
      previous_amount: previousAmount,
    }
    await db.updateFixedExpense(id, data)
    setFixedExpenses(prev => prev.map(e => e.Id === id ? { ...e, ...data } : e))
    setEditingFixed(null)
  }

  function startEditFixed(exp) {
    setEditingFixed(exp.Id)
    setEditFixedData({
      name: exp.name,
      amount: exp.amount_eur || exp.amount_ils || '',
      currency: exp.amount_eur ? 'EUR' : 'ILS',
    })
  }

  async function handleAddFixed() {
    if (!newFixed.name || !newFixed.amount) return
    const data = {
      name: newFixed.name,
      amount_eur: newFixed.currency === 'EUR' ? parseFloat(newFixed.amount) : null,
      amount_ils: newFixed.currency === 'ILS' ? parseFloat(newFixed.amount) : null,
      badge_text: null,
      sort_order: fixedExpenses.length + 1,
    }
    const row = await db.addFixedExpense(data)
    setFixedExpenses(prev => [...prev, row])
    setNewFixed({ name: '', amount: '', currency: 'EUR' })
    setAddFixedForm(false)
  }

  async function handleToggleFixed(exp) {
    const newActive = exp.is_active === false ? true : false
    await db.toggleFixedExpense(exp.Id, newActive)
    setFixedExpenses(prev => prev.map(e => e.Id === exp.Id ? { ...e, is_active: newActive } : e))
  }

  // Income sources
  async function handleSaveIncomeSource(id) {
    const existing = incomeSources.find(s => s.Id === id)
    const data = {
      name: editIncomeData.name,
      amount_ils: parseFloat(editIncomeData.amount_ils) || 0,
      previous_amount_ils: existing ? existing.amount_ils : null,
    }
    await db.updateIncomeSource(id, data)
    setIncomeSources(prev => prev.map(s => s.Id === id ? { ...s, ...data } : s))
    setEditingIncome(null)
  }

  async function handleAddIncomeSource() {
    if (!newIncomeSource.name || !newIncomeSource.amount_ils) return
    const data = { name: newIncomeSource.name, amount_ils: parseFloat(newIncomeSource.amount_ils), sort_order: incomeSources.length + 1 }
    const row = await db.addIncomeSource(data)
    setIncomeSources(prev => [...prev, row])
    setNewIncomeSource({ name: '', amount_ils: '' })
    setAddIncomeSourceForm(false)
  }

  async function handleDeleteIncomeSource(id) {
    await db.deleteIncomeSource(id)
    setIncomeSources(prev => prev.filter(s => s.Id !== id))
  }

  async function handleAddCategory() {
    if (!newCategory.name || !newCategory.budget_eur) return
    const data = { name: newCategory.name, budget_eur: parseFloat(newCategory.budget_eur) || 0, sort_order: variableCategories.length + 1 }
    const catRow = await db.addVariableCategory(data)
    const actualRow = await db.post_actual(newCategory.name)
    setVariableCategories(prev => [...prev, catRow])
    if (actualRow?.Id) setVariableActuals(prev => [...prev, actualRow])
    setNewCategory({ name: '', budget_eur: '' })
    setAddCategoryForm(false)
  }

  async function handleUpdateBudget(cat) {
    const val = prompt(`New budget for ${cat.name} (€)?`, cat.budget_eur)
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) {
      await db.updateVariableCategory(cat.Id, { budget_eur: n })
      setVariableCategories(prev => prev.map(c => c.Id === cat.Id ? { ...c, budget_eur: n } : c))
    }
  }

  async function handleAddActual(categoryName, actualRow) {
    const input = parseFloat(varInputs[categoryName]) || 0
    if (input <= 0) return
    const oldVal = parseFloat(actualRow?.actual_eur) || 0
    const newVal = oldVal + input
    await db.updateActual(actualRow.Id, newVal)
    const delta = newVal - oldVal
    const ts = new Date().toISOString()
    db.logTransaction(categoryName, delta).catch(console.warn)
    const txn = { category_name: categoryName, amount_eur: delta, added_at: ts }
    setVariableTransactions(prev => [txn, ...prev])
    setVariableActuals(prev => prev.map(a => a.category_name === categoryName ? { ...a, actual_eur: newVal } : a))
    setVarInputs(prev => ({ ...prev, [categoryName]: '' }))
  }

  async function handleReturnActual(categoryName, actualRow) {
    const input = parseFloat(varInputs[categoryName]) || 0
    if (input <= 0) return
    const oldVal = parseFloat(actualRow?.actual_eur) || 0
    const newVal = Math.max(0, oldVal - input)
    await db.updateActual(actualRow.Id, newVal)
    const delta = newVal - oldVal
    const ts = new Date().toISOString()
    db.logTransaction(categoryName, delta).catch(console.warn)
    const txn = { category_name: categoryName, amount_eur: delta, added_at: ts }
    setVariableTransactions(prev => [txn, ...prev])
    setVariableActuals(prev => prev.map(a => a.category_name === categoryName ? { ...a, actual_eur: newVal } : a))
    setVarInputs(prev => ({ ...prev, [categoryName]: '' }))
  }

  async function handleAddSaving() {
    if (!newSaving.name) return
    const data = { name: newSaving.name, amount: parseFloat(newSaving.amount) || 0, currency: newSaving.currency, previous_amount: 0, sort_order: savings.length + 1 }
    const row = await db.addSaving(data)
    setSavings(prev => [...prev, row])
    setNewSaving({ name: '', amount: '', currency: 'EUR' })
    setAddSavingForm(false)
  }

  async function handleSavingTransaction(sv, type) {
    const input = parseFloat(savingInputs[sv.Id]) || 0
    if (input <= 0) return
    const prev = parseFloat(sv.amount) || 0
    const newAmt = type === 'add' ? prev + input : Math.max(0, prev - input)
    await db.updateSaving(sv.Id, { amount: newAmt, previous_amount: prev })
    if (type === 'add') {
      const eur = sv.currency === 'ILS' ? input / rate : input
      db.logTransaction(DEPOSIT_PREFIX + sv.name, Math.round(eur * 100) / 100).catch(console.warn)
    }
    setSavings(s => s.map(x => x.Id === sv.Id ? { ...x, amount: newAmt, previous_amount: prev } : x))
    setSavingInputs(p => ({ ...p, [sv.Id]: '' }))
  }

  async function handleDeleteSaving(id) {
    await db.deleteSaving(id)
    setSavings(prev => prev.filter(s => s.Id !== id))
  }

  async function handleRenameSaving(sv) {
    const name = prompt('New name:', sv.name)
    if (name && name.trim()) {
      await db.updateSaving(sv.Id, { name: name.trim() })
      setSavings(prev => prev.map(s => s.Id === sv.Id ? { ...s, name: name.trim() } : s))
    }
  }

  async function handleAddIncome() {
    if (!newIncomeForm.description || !newIncomeForm.amount) return
    const row = await db.addOneTimeIncome({ description: newIncomeForm.description, amount: parseFloat(newIncomeForm.amount), currency: newIncomeForm.currency })
    setOneTimeIncome(prev => [...prev, row])
    setNewIncomeForm({ description: '', amount: '', currency: 'ILS' })
  }

  async function handleDeleteIncome(id) {
    await db.deleteOneTimeIncome(id)
    setOneTimeIncome(prev => prev.filter(i => i.Id !== id))
  }

  function prevReportOf(r) {
    return monthlyReports
      .filter(x => x.year * 12 + x.month < r.year * 12 + r.month)
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0]
  }
  function fixedChangesFor(r) {
    const prev = prevReportOf(r)
    return prev ? diffFixed(parseReportJson(prev)?.fixedItems, parseReportJson(r)?.fixedItems) || [] : []
  }
  // +1 for any logged deposit in the cycle, +2 when deposits reach 10% of income
  function depositsFor(r) {
    const j = parseReportJson(r)
    const items = j?.deposits || []
    const eur = items.reduce((a, d) => a + d.eur, 0)
    return { items, eur, bonus: eur <= 0 ? 0 : eur >= 0.1 * (j.income || 0) ? 2 : 1 }
  }

  async function handleEndMonth() {
    setEndMonthLoading(true)
    // Cycle runs 5th to 4th; End Month is pressed early in the next month,
    // so the report belongs to the previous calendar month (Oct press = September)
    const now = new Date()
    const closed = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const month = closed.getMonth() + 1
    const year = closed.getFullYear()

    const categorySnapshot = variableCategories.map(c => {
      const act = getActual(c.name)
      return { name: c.name, budget: parseFloat(c.budget_eur) || 0, actual: parseFloat(act?.actual_eur) || 0 }
    })

    const fixedItems = fixedExpenses
      .filter(e => e.is_active !== false)
      .map(e => ({ name: e.name, eur: Math.round(toEur(e) * 100) / 100 }))
    const prevReport = monthlyReports
      .filter(r => r.year * 12 + r.month < year * 12 + month)
      .sort((a, b) => (b.year * 12 + b.month) - (a.year * 12 + a.month))[0]
    const fixedChanges = diffFixed(parseReportJson(prevReport || {})?.fixedItems, fixedItems)

    // Deposits logged with + Deposit during the closed cycle (5th of that month to 4th of the next)
    const cycleStart = new Date(year, month - 1, 5), cycleEnd = new Date(year, month, 5)
    const depositMap = {}
    ;(await db.getRecentTransactions().catch(() => []))
      .filter(t => t.category_name?.startsWith(DEPOSIT_PREFIX))
      .filter(t => { const d = new Date(t.added_at); return d >= cycleStart && d < cycleEnd })
      .forEach(t => { const n = t.category_name.slice(DEPOSIT_PREFIX.length); depositMap[n] = (depositMap[n] || 0) + (parseFloat(t.amount_eur) || 0) })
    const deposits = Object.entries(depositMap).map(([name, eur]) => ({ name, eur }))

    const reportJson = {
      rate, // exchange_rate_snapshot column rounds to a whole number; this keeps the exact rate
      deposits,
      income: totalIncomeEur, fixedTotal: totalFixedEur, fixedItems,
      categories: categorySnapshot,
      savings: savings.map(s => ({ name: s.name, amount: s.amount, currency: s.currency })),
      oneTimeIncome,
    }
    const reportData = {
      month, year,
      exchange_rate_snapshot: rate,
      report_json: JSON.stringify(reportJson),
      reset_pending: true,
    }

    // Step 1: Save report row first
    let reportRow
    try {
      reportRow = await db.upsertMonthlyReport(month, year, reportData)
    } catch (e) {
      setEndMonthLoading(false)
      alert('Failed to save report to database. Please try again.')
      return
    }

    // Step 2: formula report (Phase 7)
    const aiResult = null

    // Step 3: Reset actuals — always happens regardless of Claude
    try {
      await db.resetAllActuals(variableActuals)
      setVariableActuals(prev => prev.map(a => ({ ...a, actual_eur: 0 })))
      await db.updateMonthlyReport(reportRow.Id, { reset_pending: false })
    } catch (e) {
      console.error('Reset failed:', e)
      alert('Report saved but actuals could not be reset. Refresh the page and clear them manually.')
    }

    const reports = await db.getMonthlyReports()
    setMonthlyReports(reports)
    setEndMonthLoading(false)
    setEndMonthModal(false)
    if (aiResult) setEndMonthResult({ ...aiResult, score: budgetScore(categorySnapshot).score })
  }

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: '◈' },
    { id: 'fixed', label: 'Fixed', icon: '⬛' },
    { id: 'variable', label: 'Variable', icon: '◎' },
    { id: 'income', label: 'Income', icon: '▲' },
    { id: 'savings', label: 'Savings', icon: '◆' },
    { id: 'reports', label: 'Reports', icon: '📊' },
  ]

  const monthName = new Date().toLocaleString('en', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-spinner">Loading your budget…<span style={{fontSize:11,opacity:0.4,marginTop:8,display:'block'}}>v7</span></div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <span className="header-icon">💰</span>
          <h1>FamilyBGT</h1>
        </div>
        <div className="rate-widget">
          {editingRate ? (
            <div className="rate-edit">
              <span className="rate-label">€1 =</span>
              <input type="number" step="0.01" min="0.01" defaultValue={rate} autoFocus className="rate-input"
                onBlur={e => handleRateUpdate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRateUpdate(e.target.value); if (e.key === 'Escape') setEditingRate(false) }} />
              <span className="rate-label">₪</span>
            </div>
          ) : (
            <button className="rate-btn" onClick={() => setEditingRate(true)}>
              €1 = ₪{rate.toFixed(2)} {rateIsLive && <span className="rate-live-dot" title="Live rate">●</span>}<span className="edit-icon">✎</span>
            </button>
          )}
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
              const now = new Date()
              const d = now.getDate()
              const periodStart = d >= 5
                ? new Date(now.getFullYear(), now.getMonth(), 5)
                : new Date(now.getFullYear(), now.getMonth() - 1, 5)
              const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 4)
              const fmtShort = dt => dt.toLocaleString('en', { month: 'short', day: 'numeric' })
              const varPct = totalVariableBudget > 0 ? Math.min(100, (totalVariableActual / totalVariableBudget) * 100) : 0
              const varRemaining = totalVariableBudget - totalVariableActual
              const recentReports = monthlyReports.slice(0, 3)
              return (
                <>
                  <div className="dash-period">
                    <span className="dash-period-label">Current period</span>
                    <span className="dash-period-range">{fmtShort(periodStart)} — {fmtShort(periodEnd)}</span>
                  </div>

                  <div className="dash-kpi-grid">
                    <div className="kpi-card kpi-income">
                      <div className="kpi-label">Income</div>
                      <div className="kpi-value">€{totalIncomeEur.toFixed(0)}</div>
                      <div className="kpi-sub">₪{(totalIncomeEur * rate).toLocaleString('en', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className="kpi-card kpi-fixed">
                      <div className="kpi-label">Fixed</div>
                      <div className="kpi-value">€{totalFixedEur.toFixed(0)}</div>
                      <div className="kpi-sub">₪{(totalFixedEur * rate).toLocaleString('en', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div className={`kpi-card ${monthlyBalance >= 0 ? 'kpi-balance-ok' : 'kpi-balance-low'}`}>
                      <div className="kpi-label">Balance</div>
                      <div className="kpi-value">{monthlyBalance >= 0 ? '+' : ''}€{monthlyBalance.toFixed(0)}</div>
                      <div className="kpi-sub">after all budgets</div>
                    </div>
                  </div>

                  <div className="variable-status-card">
                    <div className="variable-status-top">
                      <div>
                        <div className="variable-status-label">Variable spending</div>
                        <div className="variable-status-amounts">
                          <span className="variable-spent">€{totalVariableActual.toFixed(0)}</span>
                          <span className="variable-of"> of €{totalVariableBudget.toFixed(0)}</span>
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
                        ? <span className="var-remaining-ok">€{varRemaining.toFixed(0)} remaining this period</span>
                        : <span className="var-remaining-over">€{Math.abs(varRemaining).toFixed(0)} over budget</span>}
                    </div>
                  </div>

                  <div className="summary-box">
                    <div className="summary-row"><span>Income</span><span className="amount-positive">+€{totalIncomeEur.toFixed(0)}</span></div>
                    <div className="summary-row"><span>Fixed expenses</span><span className="amount-negative">−€{totalFixedEur.toFixed(0)}</span></div>
                    <div className="summary-row"><span>Variable budget</span><span className="amount-negative">−€{totalVariableBudget.toFixed(0)}</span></div>
                    <div className="summary-divider" />
                    <div className="summary-row summary-total-row">
                      <span>Monthly balance</span>
                      <span className={monthlyBalance >= 0 ? 'amount-positive' : 'amount-negative'}>
                        {monthlyBalance >= 0 ? '+' : ''}€{monthlyBalance.toFixed(0)}
                      </span>
                    </div>
                  </div>

                  <div className="savings-card-full">
                    <div className="savings-card-label">TOTAL SAVINGS</div>
                    <div className="savings-card-value">€{totalSavingsEur.toLocaleString('en', { maximumFractionDigits: 0 })}</div>
                    <div className="savings-card-sub">₪{(totalSavingsEur * rate).toLocaleString('en', { maximumFractionDigits: 0 })}</div>
                  </div>

                  {recentReports.length > 0 && (
                    <div className="comparison-panel">
                      <div className="comparison-title">Recent performance</div>
                      <div className="comparison-rows">
                        {recentReports.map(r => {
                          const mName = new Date(r.year, r.month - 1).toLocaleString('en', { month: 'short', year: '2-digit' })
                          const score = scoreOf(r)
                          return (
                            <div className="comparison-row" key={r.Id}>
                              <span className="comparison-month">{mName}</span>
                              {score != null
                                ? <div className="comparison-bar-wrap">
                                    <div className="comparison-bar" style={{ width: `${score * 10}%`, background: score >= 8 ? 'var(--green)' : score >= 5 ? 'var(--orange)' : 'var(--red)' }} />
                                  </div>
                                : <div className="comparison-bar-wrap"><div className="comparison-bar" style={{ width: '0%' }} /></div>}
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

            <button className="end-month-btn" onClick={() => setEndMonthModal(true)}>
              📅 End Month
            </button>
          </section>
        )}

        {activeSection === 'fixed' && (
          <section className="section">
            <h2 className="section-title">Fixed Monthly Expenses</h2>
            <div className="list">
              {fixedExpenses.map(exp => {
                const eurVal = toEur(exp)
                const isEditing = editingFixed === exp.Id
                return (
                  <div className="list-row" key={exp.Id}>
                    {isEditing ? (
                      <div className="edit-row-form">
                        <input className="edit-input" placeholder="Name" value={editFixedData.name}
                          onChange={e => setEditFixedData(p => ({ ...p, name: e.target.value }))} />
                        <div className="add-form-row">
                          <select className="currency-select" value={editFixedData.currency}
                            onChange={e => setEditFixedData(p => ({ ...p, currency: e.target.value }))}>
                            <option value="EUR">€ EUR</option>
                            <option value="ILS">₪ ILS</option>
                          </select>
                          <input className="edit-input" type="number" placeholder="Amount" value={editFixedData.amount}
                            onChange={e => setEditFixedData(p => ({ ...p, amount: e.target.value }))} />
                        </div>
                        <div className="edit-actions">
                          <button className="btn-save" onClick={() => handleSaveFixed(exp.Id)}>Save</button>
                          <button className="btn-cancel" onClick={() => setEditingFixed(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="list-name">
                          {exp.name}
                          {exp.badge_text && <span className="badge-june">{exp.badge_text}</span>}
                          {exp.is_active === false && <span className="badge-paused">Paused</span>}
                        </div>
                        <div className="list-right">
                          <div className="list-amounts-col">
                            {exp.is_active !== false && <>
                              <span className="amount-eur">€{eurVal.toFixed(0)}</span>
                              <span className="amount-ils">₪{(eurVal * rate).toFixed(0)}</span>
                              {exp.previous_amount != null && exp.previous_amount !== (exp.amount_eur ?? exp.amount_ils) && (
                                <span className="saving-prev">Previous: {exp.amount_eur != null ? '€' : '₪'}{exp.previous_amount}</span>
                              )}
                            </>}
                          </div>
                          <div className="list-actions">
                            <button className="icon-btn" onClick={() => startEditFixed(exp)} title="Edit">✎</button>
                            <button className={`icon-btn ${exp.is_active === false ? 'icon-btn-resume' : 'icon-btn-pause'}`}
                              onClick={() => handleToggleFixed(exp)} title={exp.is_active === false ? 'Resume' : 'Pause'}>
                              {exp.is_active === false ? '▶' : '⏸'}
                            </button>
                            <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteFixed(exp.Id)} title="Delete">✕</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="list-total-row">
              <span>Total</span>
              <span>€{totalFixedEur.toFixed(0)} · ₪{(totalFixedEur * rate).toFixed(0)}</span>
            </div>
            {addFixedForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder="Expense name" value={newFixed.name}
                  onChange={e => setNewFixed(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  <select className="currency-select" value={newFixed.currency}
                    onChange={e => setNewFixed(p => ({ ...p, currency: e.target.value }))}>
                    <option value="EUR">€ EUR</option>
                    <option value="ILS">₪ ILS</option>
                  </select>
                  <input className="edit-input" type="number" placeholder="Amount" value={newFixed.amount}
                    onChange={e => setNewFixed(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="edit-actions">
                  <button className="btn-save" onClick={handleAddFixed}>Add</button>
                  <button className="btn-cancel" onClick={() => setAddFixedForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddFixedForm(true)}>+ Add Fixed Expense</button>
            )}
          </section>
        )}

        {activeSection === 'variable' && (
          <section className="section">
            <h2 className="section-title">Variable Expenses</h2>
            <div className="var-list">
              {variableCategories.map(cat => {
                const actual = getActual(cat.name)
                const actualAmt = parseFloat(actual?.actual_eur) || 0
                const budget = parseFloat(cat.budget_eur) || 0
                const diff = budget - actualAmt
                const over = diff < 0
                return (
                  <div className="var-card" key={cat.Id}>
                    <div className="var-header">
                      <span className="var-name">{cat.name}</span>
                      <div className="var-header-right">
                        <span className="var-budget-label">Budget: €{budget}</span>
                        <button className="icon-btn-sm" onClick={() => handleUpdateBudget(cat)} title="Edit budget">⇄</button>
                      </div>
                    </div>
                    <div className="var-actual-row">
                      <span className="var-actual-amount">€{actualAmt.toFixed(0)}</span>
                      <span className={`diff-pill ${over ? 'diff-over' : 'diff-under'}`}>
                        {over ? `▲ €${Math.abs(diff).toFixed(0)} over` : `▼ €${diff.toFixed(0)} left`}
                      </span>
                    </div>
                    <div className="var-actions">
                      <div className="var-input-wrap">
                        <span className="var-input-prefix">€</span>
                        <input type="number" placeholder="Amount" min="0" className="actual-input"
                          value={varInputs[cat.name] || ''}
                          onChange={e => setVarInputs(p => ({ ...p, [cat.name]: e.target.value }))} />
                      </div>
                      <button className="btn-add" onClick={() => handleAddActual(cat.name, actual)}>+ Add</button>
                      <button className="btn-return" onClick={() => handleReturnActual(cat.name, actual)}>− Return</button>
                    </div>
                    {(() => {
                      const last = lastTransaction(cat.name)
                      if (!last) return null
                      const sign = last.amount_eur < 0 ? '−' : ''
                      return (
                        <span className="var-last-added">
                          last: {sign}€{Math.abs(last.amount_eur)} · {timeAgo(last.added_at)}
                        </span>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
            {addCategoryForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder="Category name" value={newCategory.name}
                  onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))} />
                <input className="edit-input" type="number" placeholder="Monthly budget (€)" value={newCategory.budget_eur}
                  onChange={e => setNewCategory(p => ({ ...p, budget_eur: e.target.value }))} />
                <div className="edit-actions">
                  <button className="btn-save" onClick={handleAddCategory}>Add</button>
                  <button className="btn-cancel" onClick={() => setAddCategoryForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddCategoryForm(true)}>+ Add Category</button>
            )}
            <div className="list-total-row">
              <div>
                <div>Budget: €{totalVariableBudget.toFixed(0)}</div>
                {totalVariableActual > 0 && (
                  <div className={totalVariableActual > totalVariableBudget ? 'amount-negative' : 'amount-positive'}>
                    Actual: €{totalVariableActual.toFixed(0)}
                  </div>
                )}
              </div>
              {totalVariableActual > 0 && (
                <div className={totalVariableActual > totalVariableBudget ? 'amount-negative' : 'amount-positive'}>
                  {totalVariableActual > totalVariableBudget
                    ? `▲ €${(totalVariableActual - totalVariableBudget).toFixed(0)} over`
                    : `▼ €${(totalVariableBudget - totalVariableActual).toFixed(0)} left`}
                </div>
              )}
            </div>
          </section>
        )}

        {activeSection === 'income' && (
          <section className="section">
            <h2 className="section-title">Monthly Income</h2>
            <h3 className="subsection-title">Regular Income</h3>
            <div className="list">
              {incomeSources.map(src => {
                const ils = parseFloat(src.amount_ils) || 0
                const eurVal = ils / rate
                const isEditing = editingIncome === src.Id
                return (
                  <div className="list-row" key={src.Id}>
                    {isEditing ? (
                      <div className="edit-row-form">
                        <input className="edit-input" placeholder="Name" value={editIncomeData.name}
                          onChange={e => setEditIncomeData(p => ({ ...p, name: e.target.value }))} />
                        <div className="add-form-row">
                          <span className="var-input-prefix" style={{ padding: '0 8px', color: 'var(--text-muted)' }}>₪</span>
                          <input className="edit-input" type="number" placeholder="Amount ILS" value={editIncomeData.amount_ils}
                            onChange={e => setEditIncomeData(p => ({ ...p, amount_ils: e.target.value }))} />
                        </div>
                        <div className="edit-actions">
                          <button className="btn-save" onClick={() => handleSaveIncomeSource(src.Id)}>Save</button>
                          <button className="btn-cancel" onClick={() => setEditingIncome(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="list-name">{src.name}</div>
                        <div className="list-right">
                          <div className="list-amounts-col">
                            <span className="amount-eur">€{eurVal.toFixed(0)}</span>
                            <span className="amount-ils">₪{ils.toLocaleString()}</span>
                            {src.previous_amount_ils != null && src.previous_amount_ils !== ils && (
                              <span className="saving-prev">Previous: ₪{src.previous_amount_ils.toLocaleString()}</span>
                            )}
                          </div>
                          <div className="list-actions">
                            <button className="icon-btn" onClick={() => { setEditingIncome(src.Id); setEditIncomeData({ name: src.name, amount_ils: src.amount_ils }) }} title="Edit">✎</button>
                            <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteIncomeSource(src.Id)} title="Delete">✕</button>
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
                <input className="edit-input" placeholder="Income name" value={newIncomeSource.name}
                  onChange={e => setNewIncomeSource(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  <span style={{ fontSize: 14, color: 'var(--text-muted)', padding: '0 6px' }}>₪</span>
                  <input className="edit-input" type="number" placeholder="Amount ILS" value={newIncomeSource.amount_ils}
                    onChange={e => setNewIncomeSource(p => ({ ...p, amount_ils: e.target.value }))} />
                </div>
                <div className="edit-actions">
                  <button className="btn-save" onClick={handleAddIncomeSource}>Add</button>
                  <button className="btn-cancel" onClick={() => setAddIncomeSourceForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddIncomeSourceForm(true)}>+ Add Income Source</button>
            )}
            <h3 className="subsection-title">One-time / Unique Income</h3>
            <div className="list">
              {oneTimeIncome.map(inc => {
                const amt = parseFloat(inc.amount) || 0
                const eurVal = inc.currency === 'ILS' ? amt / rate : amt
                const ilsVal = inc.currency === 'ILS' ? amt : amt * rate
                return (
                  <div className="list-row" key={inc.Id}>
                    <div className="list-name">{inc.description}</div>
                    <div className="list-right">
                      <div className="list-amounts-col">
                        <span className="amount-eur">€{eurVal.toFixed(0)}</span>
                        <span className="amount-ils">₪{ilsVal.toFixed(0)}</span>
                      </div>
                      <div className="list-actions">
                        <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteIncome(inc.Id)}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="add-form">
              <p className="add-form-title">Add One-time Income</p>
              <input className="edit-input" placeholder="Description (e.g. Miluim grant)" value={newIncomeForm.description}
                onChange={e => setNewIncomeForm(p => ({ ...p, description: e.target.value }))} />
              <div className="add-form-row">
                <div className="var-input-wrap" style={{ flex: 1 }}>
                  <span className="var-input-prefix">{newIncomeForm.currency === 'ILS' ? '₪' : '€'}</span>
                  <input type="number" placeholder="Amount" className="actual-input" value={newIncomeForm.amount}
                    onChange={e => setNewIncomeForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <select className="currency-select" value={newIncomeForm.currency}
                  onChange={e => setNewIncomeForm(p => ({ ...p, currency: e.target.value }))}>
                  <option value="ILS">ILS ₪</option>
                  <option value="EUR">EUR €</option>
                </select>
              </div>
              <button className="btn-primary-full" onClick={handleAddIncome}>+ Add</button>
            </div>
            <div className="list-total-row">
              <span>Total Income</span>
              <span>€{totalIncomeEur.toFixed(0)} · ₪{(totalIncomeEur * rate).toFixed(0)}</span>
            </div>
            <p className="note">Regular income received in ILS, converted at €1 = ₪{rate}. Tap ✎ to edit any amount.</p>
          </section>
        )}

        {activeSection === 'savings' && (
          <section className="section">
            <h2 className="section-title">Savings Snapshot</h2>
            <div className="savings-list">
              {savings.map(sv => {
                const amt = parseFloat(sv.amount) || 0
                const prev = parseFloat(sv.previous_amount) || 0
                const eurVal = sv.currency === 'ILS' ? amt / rate : amt
                const delta = amt - prev
                return (
                  <div className="saving-card" key={sv.Id}>
                    <div className="saving-card-header">
                      <span className="saving-name">{sv.name}</span>
                      <div className="saving-header-actions">
                        <span className="currency-badge">{sv.currency}</span>
                        <button className="icon-btn" onClick={() => handleRenameSaving(sv)} title="Rename">✎</button>
                        <button className="icon-btn icon-btn-delete" onClick={() => handleDeleteSaving(sv.Id)} title="Delete">✕</button>
                      </div>
                    </div>
                    <div className="saving-amount-row">
                      <span className="saving-amount">{sv.currency === 'ILS' ? `₪${amt.toLocaleString()}` : `€${amt.toLocaleString()}`}</span>
                      <span className="saving-converted">≈ {sv.currency === 'ILS' ? `€${eurVal.toFixed(0)}` : `₪${(eurVal * rate).toFixed(0)}`}</span>
                      {delta !== 0 && (
                        <span className={`delta-badge ${delta < 0 ? 'delta-down' : 'delta-up'}`}>
                          {delta < 0 ? '▼' : '▲'} {Math.abs(delta).toLocaleString()} vs prev
                        </span>
                      )}
                    </div>
                    {prev > 0 && prev !== amt && (
                      <div className="saving-prev">Previous: {sv.currency === 'ILS' ? `₪${prev.toLocaleString()}` : `€${prev.toLocaleString()}`}</div>
                    )}
                    <div className="saving-actions">
                      <div className="var-input-wrap" style={{ flex: 1 }}>
                        <span className="var-input-prefix">{sv.currency === 'ILS' ? '₪' : '€'}</span>
                        <input type="number" placeholder="Amount" min="0" className="actual-input"
                          value={savingInputs[sv.Id] || ''}
                          onChange={e => setSavingInputs(p => ({ ...p, [sv.Id]: e.target.value }))} />
                      </div>
                      <select className="currency-select-sm" value={sv.currency}
                        onChange={e => { db.updateSaving(sv.Id, { currency: e.target.value }); setSavings(p => p.map(x => x.Id === sv.Id ? { ...x, currency: e.target.value } : x)) }}>
                        <option value="EUR">€ EUR</option>
                        <option value="ILS">₪ ILS</option>
                      </select>
                      <button className="btn-add" onClick={() => handleSavingTransaction(sv, 'add')}>+ Add</button>
                      <button className="btn-return" onClick={() => handleSavingTransaction(sv, 'withdraw')}>− Withdraw</button>
                    </div>
                  </div>
                )
              })}
            </div>
            {addSavingForm ? (
              <div className="add-form">
                <input className="edit-input" placeholder="Account name" value={newSaving.name}
                  onChange={e => setNewSaving(p => ({ ...p, name: e.target.value }))} />
                <div className="add-form-row">
                  <input className="edit-input" type="number" placeholder="Starting amount" value={newSaving.amount}
                    onChange={e => setNewSaving(p => ({ ...p, amount: e.target.value }))} style={{ flex: 1 }} />
                  <select className="currency-select" value={newSaving.currency}
                    onChange={e => setNewSaving(p => ({ ...p, currency: e.target.value }))}>
                    <option value="EUR">€ EUR</option>
                    <option value="ILS">₪ ILS</option>
                  </select>
                </div>
                <div className="edit-actions">
                  <button className="btn-save" onClick={handleAddSaving}>Add</button>
                  <button className="btn-cancel" onClick={() => setAddSavingForm(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="add-category-btn" onClick={() => setAddSavingForm(true)}>+ Add Saving Account</button>
            )}
            <div className="list-total-row">
              <span>Total savings</span>
              <span>€{totalSavingsEur.toLocaleString('en', { maximumFractionDigits: 0 })} · ₪{(totalSavingsEur * rate).toLocaleString('en', { maximumFractionDigits: 0 })}</span>
            </div>
          </section>
        )}

        {activeSection === 'reports' && (
          <section className="section">
            <h2 className="section-title">Monthly Reports</h2>
            {monthlyReports.length === 0 ? (
              <div className="empty-state">No reports yet. Press "End Month" on the Overview tab to generate your first report.</div>
            ) : (
              <>
              {(() => {
                const allMonths = [...monthlyReports]
                  .sort((a, b) => a.year - b.year || a.month - b.month)
                  .map(r => ({ r, j: parseReportJson(r) })).filter(m => m.j)
                if (allMonths.length === 0) return null
                const q = mo => Math.ceil(mo / 3)
                const quarters = [...new Set(allMonths.map(m => `${m.r.year}-Q${q(m.r.month)}`))]
                const picked = allMonths.filter(m => {
                  if (historyFilter === 'all') return true
                  if (historyFilter === 'last3') return allMonths.indexOf(m) >= allMonths.length - 3
                  if (historyFilter.includes('-Q')) return `${m.r.year}-Q${q(m.r.month)}` === historyFilter
                  return String(m.r.Id) === historyFilter
                })
                const months = picked.length ? picked : allMonths.slice(-3)
                const names = []
                months.forEach(m => (m.j.categories || []).forEach(c => { if (!names.includes(c.name)) names.push(c.name) }))
                const cat = (m, n) => (m.j.categories || []).find(c => c.name === n)
                const varTot = m => (m.j.categories || []).reduce((a, c) => a + (c.actual || 0), 0)
                const avg = f => months.reduce((a, m) => a + f(m), 0) / months.length
                const rows = names.filter(n => months.some(m => cat(m, n)?.actual || cat(m, n)?.budget))
                return (
                  <div className="history-section">
                    <div className="history-header">
                      <h3 className="subsection-title">Spending History (actual €)</h3>
                      <select className="history-filter" value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}>
                        <option value="last3">Last 3 months</option>
                        <option value="all">All months</option>
                        <optgroup label="Quarter">
                          {quarters.map(k => <option key={k} value={k}>{k.replace('-', ' ')}</option>)}
                        </optgroup>
                        <optgroup label="Single month">
                          {[...allMonths].reverse().map(m => <option key={m.r.Id} value={String(m.r.Id)}>{cycleLabel(m.r, 'long')}</option>)}
                        </optgroup>
                      </select>
                    </div>
                    <div className="history-scroll">
                      <table className="report-numbers history-table">
                        <thead><tr><th>Category</th>{months.map(m => <th key={m.r.Id}>{cycleLabel(m.r).replace(/ \d{4}$/, '')}</th>)}<th>Avg</th></tr></thead>
                        <tbody>
                          {rows.map(n => (
                            <tr key={n}>
                              <td>{n}</td>
                              {months.map(m => {
                                const c = cat(m, n)
                                return <td key={m.r.Id} className={c && c.actual > c.budget ? 'num-over' : ''}
                                  title={c ? `Budget ${eur0(c.budget)}` : ''}>{c ? eur0(c.actual) : '–'}</td>
                              })}
                              <td>{eur0(avg(m => cat(m, n)?.actual || 0))}</td>
                            </tr>
                          ))}
                          <tr className="num-total"><td>Variable total</td>{months.map(m => <td key={m.r.Id}>{eur0(varTot(m))}</td>)}<td>{eur0(avg(varTot))}</td></tr>
                          <tr className="fixed-toggle" onClick={() => setShowFixedItems(v => !v)}>
                            <td>{showFixedItems ? '▾' : '▸'} Fixed total</td>{months.map(m => <td key={m.r.Id}>{eur0(m.j.fixedTotal)}</td>)}<td>{eur0(avg(m => m.j.fixedTotal || 0))}</td></tr>
                          {showFixedItems && [...new Set(months.flatMap(m => (m.j.fixedItems || []).map(i => i.name)))].map(name => (
                            <tr key={name} className="fixed-change"><td>↳ {name}</td>
                              {months.map(m => { const it = m.j.fixedItems?.find(i => i.name === name)
                                return <td key={m.r.Id}>{m.j.fixedItems ? (it ? eur0(it.eur) : '€0') : '–'}</td> })}
                              <td></td></tr>
                          ))}
                          {showFixedItems && !months.some(m => m.j.fixedItems) && (
                            <tr className="fixed-change"><td colSpan={months.length + 2}>Item breakdown is saved from the next End Month on</td></tr>
                          )}
                          <tr><td>Income</td>{months.map(m => <td key={m.r.Id}>{eur0(m.j.income)}</td>)}<td>{eur0(avg(m => m.j.income || 0))}</td></tr>
                          <tr className="num-total"><td>Left over</td>{months.map(m => { const l = (m.j.income || 0) - (m.j.fixedTotal || 0) - varTot(m)
                            return <td key={m.r.Id} className={l < 0 ? 'num-over' : 'num-under'}>{eur0(l)}</td> })}
                            <td>{eur0(avg(m => (m.j.income || 0) - (m.j.fixedTotal || 0) - varTot(m)))}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="history-note">Red = over budget. Each month runs 5th to 4th of the next.</p>
                  </div>
                )
              })()}
              <div className="reports-list">
                {monthlyReports.map(r => {
                  const mName = cycleLabel(r, 'long')
                  const isExpanded = expandedReport === r.Id
                  let highlights = [], lowlights = []
                  try { highlights = r.highlights ? JSON.parse(r.highlights) : [] } catch {}
                  try { lowlights = r.lowlights ? JSON.parse(r.lowlights) : [] } catch {}
                  return (
                    <div className="report-card" key={r.Id} onClick={() => setExpandedReport(isExpanded ? null : r.Id)}>
                      <div className="report-card-header">
                        <span className="report-month">{mName} <span className="report-range">{cycleRange(r)}</span></span>
                        <div className="report-meta">
                          {scoreOf(r) != null && (
                            <span className={`score-badge score-${scoreOf(r) >= 8 ? 'high' : scoreOf(r) >= 5 ? 'mid' : 'low'}`}>
                              {scoreOf(r)}/10
                            </span>
                          )}
                          {depositsFor(r)?.bonus > 0 && (
                            <span className="bonus-badge" title="Savings deposit bonus, not part of the budget score">💰 +{depositsFor(r).bonus}</span>
                          )}
                          <span className="report-chevron">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {r.summary && <p className="report-summary-preview">{r.summary.slice(0, 120)}{r.summary.length > 120 ? '…' : ''}</p>}
                      {isExpanded && (
                        <div className="report-expanded">
                          {(() => {
                            const j = parseReportJson(r)
                            if (!j) return null
                            const cats = j.categories || []
                            const varTotal = cats.reduce((a, c) => a + (c.actual || 0), 0)
                            const varBudget = cats.reduce((a, c) => a + (c.budget || 0), 0)
                            return (
                              <table className="report-numbers" onClick={e => e.stopPropagation()}>
                                <thead><tr><th>Category</th><th>Actual</th><th>Budget</th><th>Diff</th></tr></thead>
                                <tbody>
                                  {cats.filter(c => c.budget || c.actual).map(c => (
                                    <tr key={c.name}>
                                      <td>{c.name}</td><td>{eur0(c.actual)}</td><td>{eur0(c.budget)}</td>
                                      <td className={c.actual > c.budget ? 'num-over' : 'num-under'}>{eur0(c.budget - c.actual)}</td>
                                    </tr>
                                  ))}
                                  <tr className="num-total"><td>Variable total</td><td>{eur0(varTotal)}</td><td>{eur0(varBudget)}</td>
                                    <td className={varTotal > varBudget ? 'num-over' : 'num-under'}>{eur0(varBudget - varTotal)}</td></tr>
                                  <tr><td>Fixed total</td><td>{eur0(j.fixedTotal)}</td><td></td><td></td></tr>
                                  {(j.fixedItems || []).map(it => {
                                    const ch = fixedChangesFor(r).find(f => f.name === it.name)
                                    return (
                                      <tr key={it.name} className="fixed-change"><td>↳ {it.name}</td><td>{eur0(it.eur)}</td><td>{ch ? ch.note : ''}</td>
                                        <td className={ch ? (ch.diff > 0 ? 'num-over' : 'num-under') : ''}>{ch ? `${ch.diff > 0 ? '+' : '−'}${eur0(Math.abs(ch.diff))}` : ''}</td></tr>
                                    )
                                  })}
                                  {fixedChangesFor(r).filter(f => f.note === 'removed or paused').map(f => (
                                    <tr key={f.name} className="fixed-change"><td>↳ {f.name}</td><td>€0</td><td>removed or paused</td>
                                      <td className="num-under">−{eur0(Math.abs(f.diff))}</td></tr>
                                  ))}
                                  <tr><td>Income</td><td>{eur0(j.income)}</td><td></td><td></td></tr>
                                  <tr className="num-total"><td>Left over</td><td className={(j.income - j.fixedTotal - varTotal) < 0 ? 'num-over' : 'num-under'}>{eur0(j.income - j.fixedTotal - varTotal)}</td><td></td><td></td></tr>
                                </tbody>
                              </table>
                            )
                          })()}
                          {r.summary && <p className="report-summary">{r.summary}</p>}
                          {depositsFor(r)?.bonus > 0 && (
                            <p className="savings-note">💰 Deposited to savings (not part of the score): {depositsFor(r).items
                              .map(d => `${d.name} ${eur0(d.eur)}`).join(', ')}</p>
                          )}
                          {highlights.length > 0 && (
                            <div className="report-section">
                              <p className="report-section-title">✅ Highlights</p>
                              <ul>{highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
                            </div>
                          )}
                          {lowlights.length > 0 && (
                            <div className="report-section">
                              <p className="report-section-title">⚠️ Areas to improve</p>
                              <ul>{lowlights.map((l, i) => <li key={i}>{l}</li>)}</ul>
                            </div>
                          )}
                          {parseReportJson(r) && (
                            <div className="score-reasons">
                              <strong>Score {scoreOf(r)}/10:</strong>{' '}
                              {budgetScore(parseReportJson(r).categories).reasons.map(x => `−${x.pts} ${x.text}`).join(' · ') || 'no points lost'}
                            </div>
                          )}
                          {!r.summary && <p className="report-no-ai">AI analysis unavailable for this report.</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              </>
            )}
            {monthlyReports.length > 1 && (
              <div className="trend-section">
                <h3 className="subsection-title">Month-by-Month Score</h3>
                <div className="trend-bars">
                  {[...monthlyReports].reverse().map(r => {
                    const mName = new Date(r.year, r.month - 1).toLocaleString('en', { month: 'short' })
                    const score = scoreOf(r) || 0
                    return (
                      <div className="trend-bar-item" key={r.Id}>
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

      {endMonthModal && (
        <div className="modal-overlay" onClick={() => !endMonthLoading && setEndMonthModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>End {monthName}?</h3>
            <p>This will generate an AI monthly report and reset all variable expense actuals to zero.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setEndMonthModal(false)} disabled={endMonthLoading}>Cancel</button>
              <button className="btn-primary" onClick={handleEndMonth} disabled={endMonthLoading}>
                {endMonthLoading ? 'Generating…' : 'End Month'}
              </button>
            </div>
          </div>
        </div>
      )}

      {endMonthResult && (
        <div className="modal-overlay" onClick={() => setEndMonthResult(null)}>
          <div className="modal modal-report" onClick={e => e.stopPropagation()}>
            <h3>{monthName} Report</h3>
            <div className={`score-display score-${endMonthResult.score >= 8 ? 'high' : endMonthResult.score >= 5 ? 'mid' : 'low'}`}>
              {endMonthResult.score}/10
            </div>
            <p className="report-summary">{endMonthResult.summary}</p>
            {endMonthResult.highlights?.length > 0 && (
              <div className="report-section">
                <p className="report-section-title">✅ What went well</p>
                <ul>{endMonthResult.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            )}
            {endMonthResult.lowlights?.length > 0 && (
              <div className="report-section">
                <p className="report-section-title">⚠️ Areas to improve</p>
                <ul>{endMonthResult.lowlights.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </div>
            )}
            <button className="btn-primary" onClick={() => setEndMonthResult(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
