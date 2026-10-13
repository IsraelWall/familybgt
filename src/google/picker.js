import { getToken } from './auth.js'
import { AuthNeeded } from './api.js'

const PROJECT_NUMBER = import.meta.env.VITE_GOOGLE_PROJECT_NUMBER
const PICKER_KEY = import.meta.env.VITE_GOOGLE_PICKER_KEY

let loaded = null
function loadPicker() {
  loaded ||= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => window.gapi.load('picker', resolve)
    s.onerror = () => reject(new Error('Failed to load Google Picker'))
    document.head.appendChild(s)
  })
  return loaded
}

// Opens Google's file picker on spreadsheets shared with the user. Picking a file grants
// this app (drive.file) access to it. Resolves with { id, name } or null when cancelled.
export async function pickSharedSheet() {
  await loadPicker()
  const token = getToken()
  if (!token) throw new AuthNeeded()
  const { picker } = window.google
  return new Promise(resolve => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS).setOwnedByMe(false).setIncludeFolders(false)
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(PICKER_KEY)
      .setAppId(PROJECT_NUMBER)
      .setCallback(d => {
        if (d.action === picker.Action.PICKED) resolve({ id: d.docs[0].id, name: d.docs[0].name })
        else if (d.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
