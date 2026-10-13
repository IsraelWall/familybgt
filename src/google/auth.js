// Google sign-in with the GIS token client. No refresh tokens exist in the browser:
// a new token always needs a user tap (popups opened without a gesture are blocked on mobile).
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const TOKEN_KEY = 'fbgt_token'
const HINT_KEY = 'fbgt_login_hint'

let client = null
let token = null
let expiresAt = 0
let pending = null

const store = {
  get(k, s = sessionStorage) { try { return s.getItem(k) } catch { return null } },
  set(k, v, s = sessionStorage) { try { v == null ? s.removeItem(k) : s.setItem(k, v) } catch { /* storage blocked */ } },
}

// A token saved earlier in this browser session survives a page reload until it expires
try {
  const saved = JSON.parse(store.get(TOKEN_KEY) || 'null')
  if (saved && saved.expiresAt > Date.now() + 60_000) { token = saved.token; expiresAt = saved.expiresAt }
} catch { /* ignore */ }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export async function initAuth() {
  if (client) return
  await loadScript('https://accounts.google.com/gsi/client')
  client = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: r => {
      const p = pending; pending = null
      if (r.error) return p?.reject(new Error(r.error_description || r.error))
      token = r.access_token
      expiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000
      store.set(TOKEN_KEY, JSON.stringify({ token, expiresAt }))
      p?.resolve(token)
    },
    error_callback: e => { const p = pending; pending = null; p?.reject(new Error(e?.message || e?.type || 'Sign-in cancelled')) },
  })
}

// Must be called from a click/tap handler
export async function signIn() {
  await initAuth()
  return new Promise((resolve, reject) => {
    pending = { resolve, reject }
    const hint = store.get(HINT_KEY, localStorage)
    client.requestAccessToken({ prompt: '', ...(hint ? { login_hint: hint } : {}) })
  })
}

export function rememberEmail(email) { store.set(HINT_KEY, email || null, localStorage) }

export function getToken() {
  return token && Date.now() < expiresAt - 60_000 ? token : null
}

export function clearToken() {
  token = null; expiresAt = 0
  store.set(TOKEN_KEY, null)
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {})
  clearToken()
  rememberEmail(null)
}
