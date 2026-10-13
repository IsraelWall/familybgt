# FamilyBGT

A free family budget app that keeps your data in your own Google Drive.

**Use it:** https://israelwall.github.io/familybgt/ · [How to start](https://israelwall.github.io/familybgt/guide.html) · [Privacy](https://israelwall.github.io/familybgt/privacy.html)

## What it does

- Monthly budget: income, fixed costs, variable categories with a budget each, savings accounts
- Log expenses as you go; see what is left in each category for the current period
- One main currency plus an optional second one, with a live exchange rate
- Periods start on any day of the month (payday, for example)
- A formula-based monthly score and report, with history by month and quarter
- Shared budgets: invite a partner, both edit the same budget at the same time
- English and Hebrew (right to left)
- Installable on a phone home screen

## How your data is stored

There is no server and no database. When you sign in with Google, the app creates a Google Sheet called **FamilyBGT** in your own Drive and reads and writes it directly from your browser.

- The app asks for one permission, `drive.file`: access only to files it created or that you opened with it. It cannot see anything else in your Drive.
- Sharing with a partner is regular Google Drive sharing.
- No analytics, no ads, no tracking. The only other request is a currency rate from open.er-api.com (currency codes only).

Data model, one tab per table: `BudgetConfig`, `FixedExpenses`, `IncomeSources`, `VariableCategories`, `Savings`, `SavingsEntries`, `OneTimeIncome`, `VariableTransactions`, `MonthlyReports`. Expenses and savings entries are append-only rows, so two people adding at the same moment never overwrite each other. Deleted rows are marked, never removed.

## Self-hosting

You need a free Google Cloud project and a static host (GitHub Pages works).

1. Google Cloud: create a project, enable **Google Sheets API**, **Google Drive API** and **Google Picker API**.
2. Google Auth Platform: external app, scope `https://www.googleapis.com/auth/drive.file` only, your home page and privacy policy URLs, your domain as an authorized domain. Publish it.
3. Create an OAuth client (Web application) with your site's origin as an authorized JavaScript origin. No redirect URIs and no client secret are needed.
4. Create an API key restricted to the Picker API and to your site plus `https://docs.google.com/*` as HTTP referrers.
5. Put the three values in `.env.production`:
   ```
   VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   VITE_GOOGLE_PROJECT_NUMBER=...
   VITE_GOOGLE_PICKER_KEY=...
   ```
   These values are public by design: they identify the app, they grant no access to anyone's data.
6. Set `base` in `vite.config.js` to your path, then `npm ci && npm run build` and publish `dist/`.

## Development

```
npm install
npm run dev      # http://localhost:5175/familybgt/
npm test         # unit tests (periods, currency, balances, sheet rows, score, translations)
npm run lint
npm run build
```

Add `http://localhost:5175` as an authorized JavaScript origin of your OAuth client for local sign-in.

Every push to `main` runs the tests, builds, runs a leak scan and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## License

MIT
