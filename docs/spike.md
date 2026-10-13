# Phase 1 spike: partner join (2026-10-13)

Owner A on Windows Chrome 155, partner B on Android 10 Chrome 153 (browser tab, not installed PWA).

| Check | Result |
|---|---|
| GIS token client, scope drive.file, popup from a tap | Pass on desktop and Android, token ~3600 s |
| Drive files.create (spreadsheet MIME + appProperties) | Pass |
| permissions.create writer + notification email | Pass |
| Picker on Android with setAppId + setOAuthToken + setDeveloperKey, DocsView SPREADSHEETS setOwnedByMe(false) | Pass, grants drive.file access to B |
| B: files.list by appProperties (set by A) | Pass, A's appProperties visible to B; no name/MIME fallback needed |
| B: Sheets append (RAW, INSERT_ROWS) + read (UNFORMATTED_VALUE) | Pass; both partners' rows present |
| 12.5 read back as number; "=1+1" stored as text | Pass |

Findings for the build:
- Discovery by appProperties works for shared files after Picker. Keep it as the only method.
- Buttons that create things need a busy state: the test created 3 sheets from repeated taps.
- Not tested here (moved to E2E): token expiry after 60 min and re-auth tap, installed-PWA mode.
