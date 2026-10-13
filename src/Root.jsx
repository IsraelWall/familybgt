import { useState, useEffect, useCallback } from 'react'
import App from './App.jsx'
import { initAuth, signIn, getToken, rememberEmail, signOut } from './google/auth.js'
import { AuthNeeded } from './google/api.js'
import { pickSharedSheet } from './google/picker.js'
import { findBudgets, whoAmI, createBudget, getFileMeta, ensureSchema, APP_TAG } from './sheets.js'
import { COMMON_CURRENCIES, currencySymbol } from './budget.js'
import { DEFAULT_CATEGORIES } from './defaults.js'

const CHOSEN_KEY = 'fbgt_budget'
const ls = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

function guessCurrency() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    const map = { IL: 'ILS', US: 'USD', GB: 'GBP', CH: 'CHF', CA: 'CAD', AU: 'AUD', JP: 'JPY', PL: 'PLN', SE: 'SEK', NO: 'NOK', DK: 'DKK', CZ: 'CZK', HU: 'HUF', RO: 'RON', TR: 'TRY', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', IN: 'INR' }
    const euro = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
    return euro.includes(region) ? 'EUR' : map[region] || 'EUR'
  } catch { return 'EUR' }
}

function CurrencySelect({ value, onChange, allowNone, exclude }) {
  return (
    <select className="currency-select setup-select" value={value} onChange={e => onChange(e.target.value)}>
      {allowNone && <option value="">None</option>}
      {COMMON_CURRENCIES.filter(c => c !== exclude).map(c => <option key={c} value={c}>{c} {currencySymbol(c)}</option>)}
    </select>
  )
}

export default function Root() {
  const [phase, setPhase] = useState(() => (getToken() ? 'loading' : 'signin')) // signin | loading | choose | setup | app
  const [user, setUser] = useState(null)
  const [budgets, setBudgets] = useState([])
  const [budgetId, setBudgetId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mainCur, setMainCur] = useState(guessCurrency)
  const [secondCur, setSecondCur] = useState('')

  const discover = useCallback(async () => {
    try {
      const me = await whoAmI()
      setUser(me); rememberEmail(me?.emailAddress)
      const list = await findBudgets()
      setBudgets(list)
      const saved = ls.get(CHOSEN_KEY)
      const pick = list.find(b => b.id === saved) || (list.length === 1 ? list[0] : null)
      if (pick) { ls.set(CHOSEN_KEY, pick.id); setBudgetId(pick.id); setPhase('app') }
      else setPhase(list.length ? 'choose' : 'setup')
    } catch (e) {
      if (e instanceof AuthNeeded) setPhase('signin')
      else { setError(e.message); setPhase('signin') }
    }
  }, [])

  useEffect(() => {
    initAuth().catch(e => setError(e.message))
    // discover() only sets state after awaiting Google, so this does not cascade renders
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (getToken()) discover()
  }, [discover])

  async function handleSignIn() {
    setError('')
    try { await signIn(); setPhase('loading'); await discover() } catch (e) { setError(e.message) }
  }

  async function handleCreate() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const file = await createBudget({ main_currency: mainCur, second_currency: secondCur, language_default: 'en', categories: DEFAULT_CATEGORIES.en })
      ls.set(CHOSEN_KEY, file.id); setBudgetId(file.id); setPhase('app')
    } catch (e) {
      if (e instanceof AuthNeeded) setPhase('signin')
      setError(e.message)
    } finally { setBusy(false) }
  }

  async function handleJoin() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const picked = await pickSharedSheet()
      if (!picked) return
      const meta = await getFileMeta(picked.id)
      if (meta.appProperties?.[APP_TAG.key] !== APP_TAG.value) throw new Error('That sheet is not a FamilyBGT budget. Ask your partner to invite you from FamilyBGT settings.')
      await ensureSchema(picked.id)
      ls.set(CHOSEN_KEY, picked.id); setBudgetId(picked.id); setPhase('app')
    } catch (e) {
      if (e instanceof AuthNeeded) setPhase('signin')
      setError(e.message)
    } finally { setBusy(false) }
  }

  function choose(id) { ls.set(CHOSEN_KEY, id); setBudgetId(id); setPhase('app') }

  function handleSignOut() {
    signOut(); ls.set(CHOSEN_KEY, null)
    setUser(null); setBudgetId(null); setBudgets([]); setPhase('signin')
  }

  function handleSwitchBudget() { ls.set(CHOSEN_KEY, null); setBudgetId(null); setPhase('loading'); setError(''); discover() }

  if (phase === 'app' && budgetId) {
    return <App budgetId={budgetId} user={user} onSignOut={handleSignOut} onSwitchBudget={handleSwitchBudget} />
  }

  return (
    <div className="pw-screen">
      <div className="pw-card">
        <div className="pw-icon">💰</div>
        <h1 className="pw-title">FamilyBGT</h1>

        {phase === 'loading' && <p className="pw-sub">Loading…</p>}

        {phase === 'signin' && (
          <>
            <p className="pw-sub">A free family budget. Your data stays in your own Google Drive.</p>
            <button className="pw-btn" onClick={handleSignIn}>Sign in with Google</button>
          </>
        )}

        {phase === 'choose' && (
          <>
            <p className="pw-sub">Choose a budget</p>
            <div className="setup-list">
              {budgets.map(b => (
                <button key={b.id} className="setup-option" onClick={() => choose(b.id)}>
                  <strong>{b.name}</strong>
                  <span>{b.ownedByMe ? 'Yours' : `Shared by ${b.owners?.[0]?.emailAddress || 'someone'}`}</span>
                </button>
              ))}
            </div>
            <button className="pw-link" onClick={() => setPhase('setup')}>Start or join another budget</button>
          </>
        )}

        {phase === 'setup' && (
          <>
            <p className="pw-sub">Start a new budget</p>
            <label className="setup-label">Main currency
              <CurrencySelect value={mainCur} onChange={v => { setMainCur(v); if (v === secondCur) setSecondCur('') }} />
            </label>
            <label className="setup-label">Second currency (optional)
              <CurrencySelect value={secondCur} onChange={setSecondCur} allowNone exclude={mainCur} />
            </label>
            <p className="setup-hint">The main currency can't be changed later. Budgets and reports use it.</p>
            <button className="pw-btn" onClick={handleCreate} disabled={busy}>{busy ? 'Creating…' : 'Create my budget'}</button>
            <div className="setup-divider"><span>or</span></div>
            <button className="pw-btn pw-btn-secondary" onClick={handleJoin} disabled={busy}>Join a budget shared with me</button>
          </>
        )}

        {error && <p className="pw-error">{error}</p>}
        {user?.emailAddress && phase !== 'signin' && <p className="setup-hint">Signed in as {user.emailAddress}</p>}
        <p className="setup-footer"><a href="privacy.html">Privacy</a> · <a href="https://github.com/IsraelWall/familybgt">Source code</a></p>
      </div>
    </div>
  )
}
