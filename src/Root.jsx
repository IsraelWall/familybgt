import { useState, useEffect, useCallback } from 'react'
import App from './App.jsx'
import { initAuth, signIn, getToken, rememberEmail, signOut } from './google/auth.js'
import { AuthNeeded } from './google/api.js'
import { pickSharedSheet } from './google/picker.js'
import { findBudgets, whoAmI, createBudget, getFileMeta, ensureSchema, APP_TAG } from './sheets.js'
import { COMMON_CURRENCIES, currencySymbol } from './budget.js'
import { DEFAULT_CATEGORIES } from './defaults.js'
import { I18nContext, LANGS, initialLang, saveLang, useI18n } from './i18n.js'
import LanguageSwitch from './LanguageSwitch.jsx'

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
  const { t } = useI18n()
  return (
    <select className="currency-select setup-select" value={value} onChange={e => onChange(e.target.value)} dir="ltr">
      {allowNone && <option value="">{t('none')}</option>}
      {COMMON_CURRENCIES.filter(c => c !== exclude).map(c => <option key={c} value={c}>{c} {currencySymbol(c)}</option>)}
    </select>
  )
}

function Gate() {
  const { t, lang } = useI18n()
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
      if (!(e instanceof AuthNeeded)) setError(e.message)
      setPhase('signin')
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
      const file = await createBudget({
        main_currency: mainCur, second_currency: secondCur, language_default: lang,
        categories: DEFAULT_CATEGORIES[lang] || DEFAULT_CATEGORIES.en,
      })
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
      if (meta.appProperties?.[APP_TAG.key] !== APP_TAG.value) throw new Error(t('notABudget'))
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
        <LanguageSwitch />
        <div className="pw-icon">💰</div>
        <h1 className="pw-title">FamilyBGT</h1>

        {phase === 'loading' && <p className="pw-sub">{t('loading')}</p>}

        {phase === 'signin' && (
          <>
            <p className="pw-sub">{t('tagline')}</p>
            <button className="pw-btn" onClick={handleSignIn}>{t('signIn')}</button>
          </>
        )}

        {phase === 'choose' && (
          <>
            <p className="pw-sub">{t('chooseBudget')}</p>
            <div className="setup-list">
              {budgets.map(b => (
                <button key={b.id} className="setup-option" onClick={() => choose(b.id)}>
                  <strong>{b.name}</strong>
                  <span>{b.ownedByMe ? t('yours') : t('sharedBy', { email: b.owners?.[0]?.emailAddress || t('someone') })}</span>
                </button>
              ))}
            </div>
            <button className="pw-link" onClick={() => setPhase('setup')}>{t('startOrJoin')}</button>
          </>
        )}

        {phase === 'setup' && (
          <>
            <p className="pw-sub">{t('startNew')}</p>
            <label className="setup-label">{t('mainCurrency')}
              <CurrencySelect value={mainCur} onChange={v => { setMainCur(v); if (v === secondCur) setSecondCur('') }} />
            </label>
            <label className="setup-label">{t('secondCurrency')}
              <CurrencySelect value={secondCur} onChange={setSecondCur} allowNone exclude={mainCur} />
            </label>
            <p className="setup-hint">{t('mainCurrencyHint')}</p>
            <button className="pw-btn" onClick={handleCreate} disabled={busy}>{busy ? t('creating') : t('createBudget')}</button>
            <div className="setup-divider"><span>{t('or')}</span></div>
            <button className="pw-btn pw-btn-secondary" onClick={handleJoin} disabled={busy}>{t('joinShared')}</button>
          </>
        )}

        {error && <p className="pw-error">{error}</p>}
        {user?.emailAddress && phase !== 'signin' && <p className="setup-hint">{t('signedInAs', { email: user.emailAddress })}</p>}
        <p className="setup-footer">
          <a href="guide.html">{t('guide')}</a> · <a href="privacy.html">{t('privacy')}</a> · <a href="https://github.com/IsraelWall/familybgt">{t('sourceCode')}</a>
        </p>
      </div>
    </div>
  )
}

export default function Root() {
  const [lang, setLangState] = useState(initialLang)
  const setLang = l => { saveLang(l); setLangState(l) }

  // Sync <html lang dir> with the chosen language (external DOM state)
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = LANGS[lang].dir
  }, [lang])

  return (
    <I18nContext.Provider value={{ lang, setLang }}>
      <Gate />
    </I18nContext.Provider>
  )
}
