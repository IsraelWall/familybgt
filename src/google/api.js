import { getToken, clearToken } from './auth.js'

// Thrown when the user has to tap "Continue" to get a fresh token
export class AuthNeeded extends Error {
  constructor() { super('Sign-in expired'); this.name = 'AuthNeeded' }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function gfetch(url, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const token = getToken()
    if (!token) throw new AuthNeeded()
    let res
    try {
      res = await fetch(url, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
      })
    } catch (e) {
      if (attempt < 2) { await sleep(800 * 2 ** attempt); continue }
      throw new Error(`Network error: ${e.message}`)
    }
    if (res.status === 401) { clearToken(); throw new AuthNeeded() }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1000 * 2 ** attempt); continue }
    const text = await res.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`
      console.warn('Google API error', url.split('?')[0], res.status, body)
      throw new Error(msg)
    }
    return body
  }
}

export const DRIVE = 'https://www.googleapis.com/drive/v3'
export const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'
