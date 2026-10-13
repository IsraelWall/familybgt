import { LANGS, useI18n } from './i18n.js'

export default function LanguageSwitch({ className = '' }) {
  const { lang, setLang } = useI18n()
  return (
    <div className={`lang-switch ${className}`}>
      {Object.entries(LANGS).map(([code, l]) => (
        <button key={code} className={code === lang ? 'active' : ''} onClick={() => setLang(code)} lang={code}>{l.label}</button>
      ))}
    </div>
  )
}
