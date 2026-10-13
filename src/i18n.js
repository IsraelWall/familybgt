import { createContext, useContext } from 'react'

export const LANGS = {
  en: { label: 'English', dir: 'ltr', locale: 'en' },
  he: { label: 'עברית', dir: 'rtl', locale: 'he-IL' },
}
const LANG_KEY = 'fbgt_lang'

export function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && LANGS[saved]) return saved
  } catch { /* storage blocked */ }
  return (navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en'
}

export function saveLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* storage blocked */ }
}

// {name} placeholders are filled from vars
export const STRINGS = {
  en: {
    // sign-in and setup
    tagline: 'A free family budget. Your data stays in your own Google Drive.',
    signIn: 'Sign in with Google',
    loading: 'Loading…',
    chooseBudget: 'Choose a budget',
    yours: 'Yours',
    sharedBy: 'Shared by {email}',
    someone: 'someone',
    startOrJoin: 'Start or join another budget',
    startNew: 'Start a new budget',
    language: 'Language',
    mainCurrency: 'Main currency',
    secondCurrency: 'Second currency (optional)',
    none: 'None',
    mainCurrencyHint: "The main currency can't be changed later. Budgets and reports use it.",
    creating: 'Creating…',
    createBudget: 'Create my budget',
    or: 'or',
    joinShared: 'Join a budget shared with me',
    notABudget: 'That sheet is not a FamilyBGT budget. Ask your partner to invite you from FamilyBGT settings.',
    signedInAs: 'Signed in as {email}',
    privacy: 'Privacy',
    sourceCode: 'Source code',
    guide: 'How to start',

    // app shell
    loadingBudget: 'Loading your budget…',
    loadFailed: "Couldn't open the budget: {error}",
    tryAgain: 'Try again',
    chooseAnother: 'Choose another budget',
    authExpired: 'Your Google sign-in expired. Nothing you typed was lost.',
    continue: 'Continue',
    saveFailed: 'Saving failed. Check your connection and try again.',
    liveRate: 'Live rate',
    setRate: 'Set {main}/{second} rate',
    settings: 'Settings',
    navOverview: 'Overview', navFixed: 'Fixed', navVariable: 'Variable', navIncome: 'Income', navSavings: 'Savings', navReports: 'Reports',

    // common
    save: 'Save', cancel: 'Cancel', add: 'Add', saving: 'Saving…', edit: 'Edit', del: 'Delete', rename: 'Rename', close: 'Close',
    name: 'Name', amount: 'Amount', total: 'Total', newName: 'New name:', previous: 'Previous: {amount}',
    today: 'today', yesterday: 'yesterday', daysAgo: '{n} days ago',

    // overview
    currentPeriod: 'Current period',
    emptyStart: 'Start by adding your regular income on the Income tab, your fixed monthly costs on the Fixed tab, and a monthly budget for each spending category on the Variable tab. Starter categories are ready there: rename, delete or add your own.',
    income: 'Income', fixed: 'Fixed', balance: 'Balance', afterBudgets: 'after all budgets',
    variableSpending: 'Variable spending', ofBudget: 'of {amount}',
    remaining: '{amount} remaining this period', overBudget: '{amount} over budget',
    fixedExpenses: 'Fixed expenses', variableBudget: 'Variable budget', monthlyBalance: 'Monthly balance',
    totalSavings: 'TOTAL SAVINGS', recentPerformance: 'Recent performance',
    closePeriod: 'Close {label}',

    // fixed
    fixedTitle: 'Fixed Monthly Expenses',
    fixedEmpty: 'Rent, insurance, subscriptions: anything you pay every month. Add the first one below.',
    paused: 'Paused', resume: 'Resume', pause: 'Pause',
    expenseName: 'Expense name', addFixed: '+ Add Fixed Expense',

    // variable
    variableTitle: 'Variable Expenses',
    variableEmpty: 'Groceries, fuel, eating out: give each category a monthly budget, then log what you spend.',
    budgetLabel: 'Budget: {amount}', setBudget: 'Set budget', editBudget: 'Edit budget', deleteCategory: 'Delete category',
    over: '▲ {amount} over', left: '▼ {amount} left',
    addSpend: '+ Add', returnSpend: '− Return', last: 'last: {amount} · {when}',
    categoryName: 'Category name', monthlyBudgetIn: 'Monthly budget ({currency})', addCategory: '+ Add Category',
    budgetTotal: 'Budget: {amount}', actualTotal: 'Actual: {amount}',
    promptBudget: 'New monthly budget for {name} ({currency})?',
    confirmDeleteCategory: 'Delete the category "{name}"? Its past expenses stay in closed reports.',

    // income
    incomeTitle: 'Monthly Income', regularIncome: 'Regular Income',
    incomeEmpty: 'Salaries, allowances, rent you receive: anything that comes in every month.',
    incomeName: 'Income name', addIncomeSource: '+ Add Income Source',
    oneTimeTitle: 'One-time Income (this period)', addOneTime: 'Add One-time Income',
    oneTimePlaceholder: 'Description (e.g. bonus, gift)', addPlain: '+ Add', totalIncome: 'Total Income',
    oneTimeNote: 'One-time income counts in the period it was added.',
    convertedNote: 'Amounts in {second} are converted at 1 {main} = {rate} {second}.',

    // savings
    savingsTitle: 'Savings Snapshot',
    savingsEmpty: 'Add a savings account to track deposits. Deposits earn a bonus in your monthly report.',
    vsPrev: '{arrow} {amount} vs prev', deposit: '+ Deposit', withdraw: '− Withdraw',
    accountName: 'Account name', startingAmount: 'Starting amount', addSaving: '+ Add Saving Account', totalSavingsRow: 'Total savings',
    confirmDeleteSaving: 'Delete the savings account "{name}"?',

    // reports
    reportsTitle: 'Monthly Reports', thisPeriod: 'This period so far',
    liveNote: 'Live view. It is saved as a report when you close this period after it ends.',
    unclosed: 'Finished periods without a report:',
    noReports: 'No saved reports yet. When a period ends, press "Close" on the Overview tab to save its report.',
    history: 'Spending History (actual {currency})', last3: 'Last 3 months', allMonths: 'All months', quarter: 'Quarter', singleMonth: 'Single month',
    category: 'Category', actual: 'Actual', budget: 'Budget', diff: 'Diff', avg: 'Avg',
    variableTotal: 'Variable total', fixedTotal: 'Fixed total', leftOver: 'Left over',
    isNew: 'new', removedPaused: 'removed or paused',
    historyNote: 'Red = over budget. Each period starts on day {day} of the month.',
    bonusTitle: 'Savings deposit bonus, not part of the budget score',
    deposited: '💰 Deposited to savings (not part of the score): {items}',
    scoreLabel: 'Score {score}/10:', noPointsLost: 'no points lost',
    reasonTotalOver: 'Variable total {pct}% over budget', reasonCategoryOver: '{name} {pct}% over budget',
    trendTitle: 'Month-by-Month Score',
    closeConfirmTitle: 'Close {label}?',
    closeConfirmText: 'This saves the report for the period from {from} to {to}. The current period is not affected.',
    closeExists: 'A report for this period already exists and will be updated.',
    saveReport: 'Save report', reportTitle: '{label} Report',
    allWithinBudget: 'No points lost. Every category stayed within budget.', seeReport: 'See the report',

    // settings
    invitePartner: 'Invite your partner to this budget', sendInvite: 'Send invitation', sending: 'Sending…',
    inviteHint: 'They get an email from Google, open FamilyBGT, sign in and choose "Join a budget shared with me".',
    invalidEmail: 'Enter a valid email address', inviteSent: 'Invitation sent to {email}',
    periodStartDay: 'Each period starts on day',
    currenciesLine: 'Main currency: {main}', secondLine: ' · Second currency: {second}',
    openSheet: 'Open the budget sheet in Google Sheets', switchBudget: 'Switch budget', signOut: 'Sign out',
  },

  he: {
    tagline: 'תקציב משפחתי בחינם. הנתונים נשמרים רק בגוגל דרייב שלכם.',
    signIn: 'כניסה עם Google',
    loading: 'טוען…',
    chooseBudget: 'בחרו תקציב',
    yours: 'שלכם',
    sharedBy: 'שותף על ידי {email}',
    someone: 'מישהו',
    startOrJoin: 'פתיחת תקציב חדש או הצטרפות לתקציב אחר',
    startNew: 'פתיחת תקציב חדש',
    language: 'שפה',
    mainCurrency: 'מטבע ראשי',
    secondCurrency: 'מטבע נוסף (לא חובה)',
    none: 'ללא',
    mainCurrencyHint: 'את המטבע הראשי אי אפשר לשנות אחר כך. התקציבים והדוחות מחושבים בו.',
    creating: 'יוצר…',
    createBudget: 'יצירת התקציב שלי',
    or: 'או',
    joinShared: 'הצטרפות לתקציב ששותף איתי',
    notABudget: 'הגיליון הזה אינו תקציב של FamilyBGT. בקשו מבן או בת הזוג לשלוח לכם הזמנה מההגדרות של FamilyBGT.',
    signedInAs: 'מחוברים בתור {email}',
    privacy: 'פרטיות',
    sourceCode: 'קוד המקור',
    guide: 'איך מתחילים',

    loadingBudget: 'טוען את התקציב…',
    loadFailed: 'לא הצלחנו לפתוח את התקציב: {error}',
    tryAgain: 'לנסות שוב',
    chooseAnother: 'בחירת תקציב אחר',
    authExpired: 'החיבור לחשבון Google פג. שום דבר ממה שהקלדתם לא נמחק.',
    continue: 'המשך',
    saveFailed: 'השמירה נכשלה. בדקו את החיבור לאינטרנט ונסו שוב.',
    liveRate: 'שער עדכני',
    setRate: 'קביעת שער {main}/{second}',
    settings: 'הגדרות',
    navOverview: 'סקירה', navFixed: 'קבועות', navVariable: 'משתנות', navIncome: 'הכנסות', navSavings: 'חסכונות', navReports: 'דוחות',

    save: 'שמירה', cancel: 'ביטול', add: 'הוספה', saving: 'שומר…', edit: 'עריכה', del: 'מחיקה', rename: 'שינוי שם', close: 'סגירה',
    name: 'שם', amount: 'סכום', total: 'סה״כ', newName: 'שם חדש:', previous: 'קודם: {amount}',
    today: 'היום', yesterday: 'אתמול', daysAgo: 'לפני {n} ימים',

    currentPeriod: 'התקופה הנוכחית',
    emptyStart: 'מתחילים כך: מוסיפים את ההכנסות הקבועות בלשונית הכנסות, את ההוצאות הקבועות בלשונית קבועות, ותקציב חודשי לכל קטגוריה בלשונית משתנות. קטגוריות ראשונות כבר מחכות שם, ואפשר לשנות להן שם, למחוק או להוסיף משלכם.',
    income: 'הכנסות', fixed: 'קבועות', balance: 'יתרה', afterBudgets: 'אחרי כל התקציבים',
    variableSpending: 'הוצאות משתנות', ofBudget: 'מתוך {amount}',
    remaining: 'נשארו {amount} לתקופה הזו', overBudget: 'חריגה של {amount} מהתקציב',
    fixedExpenses: 'הוצאות קבועות', variableBudget: 'תקציב משתנות', monthlyBalance: 'יתרה חודשית',
    totalSavings: 'סך החסכונות', recentPerformance: 'ביצועים אחרונים',
    closePeriod: 'סגירת {label}',

    fixedTitle: 'הוצאות קבועות חודשיות',
    fixedEmpty: 'שכירות, ביטוחים, מנויים: כל מה שמשלמים כל חודש. הוסיפו את הראשונה למטה.',
    paused: 'מושהה', resume: 'חידוש', pause: 'השהיה',
    expenseName: 'שם ההוצאה', addFixed: '+ הוספת הוצאה קבועה',

    variableTitle: 'הוצאות משתנות',
    variableEmpty: 'סופר, דלק, מסעדות: נותנים לכל קטגוריה תקציב חודשי, ורושמים כל הוצאה.',
    budgetLabel: 'תקציב: {amount}', setBudget: 'קביעת תקציב', editBudget: 'עריכת תקציב', deleteCategory: 'מחיקת קטגוריה',
    over: '▲ חריגה של {amount}', left: '▼ נשארו {amount}',
    addSpend: '+ הוצאה', returnSpend: '− החזר', last: 'אחרון: {amount} · {when}',
    categoryName: 'שם הקטגוריה', monthlyBudgetIn: 'תקציב חודשי ({currency})', addCategory: '+ הוספת קטגוריה',
    budgetTotal: 'תקציב: {amount}', actualTotal: 'בפועל: {amount}',
    promptBudget: 'תקציב חודשי חדש ל{name} ({currency})?',
    confirmDeleteCategory: 'למחוק את הקטגוריה "{name}"? ההוצאות שלה נשארות בדוחות שכבר נסגרו.',

    incomeTitle: 'הכנסות חודשיות', regularIncome: 'הכנסות קבועות',
    incomeEmpty: 'משכורות, קצבאות, שכירות שמקבלים: כל מה שנכנס כל חודש.',
    incomeName: 'שם ההכנסה', addIncomeSource: '+ הוספת הכנסה קבועה',
    oneTimeTitle: 'הכנסות חד פעמיות (התקופה הזו)', addOneTime: 'הוספת הכנסה חד פעמית',
    oneTimePlaceholder: 'תיאור (למשל בונוס, מתנה)', addPlain: '+ הוספה', totalIncome: 'סך ההכנסות',
    oneTimeNote: 'הכנסה חד פעמית נספרת בתקופה שבה הוספה.',
    convertedNote: 'סכומים במטבע {second} מומרים לפי 1 {main} = {rate} {second}.',

    savingsTitle: 'מצב החסכונות',
    savingsEmpty: 'הוסיפו חשבון חיסכון כדי לעקוב אחרי הפקדות. הפקדות מזכות בבונוס בדוח החודשי.',
    vsPrev: '{arrow} {amount} מהקודם', deposit: '+ הפקדה', withdraw: '− משיכה',
    accountName: 'שם החשבון', startingAmount: 'סכום פתיחה', addSaving: '+ הוספת חשבון חיסכון', totalSavingsRow: 'סך החסכונות',
    confirmDeleteSaving: 'למחוק את חשבון החיסכון "{name}"?',

    reportsTitle: 'דוחות חודשיים', thisPeriod: 'התקופה הזו עד עכשיו',
    liveNote: 'תצוגה חיה. היא נשמרת כדוח כשסוגרים את התקופה אחרי שהיא נגמרת.',
    unclosed: 'תקופות שנגמרו ואין להן דוח:',
    noReports: 'עדיין אין דוחות שמורים. כשתקופה נגמרת, לוחצים "סגירה" בלשונית סקירה כדי לשמור את הדוח שלה.',
    history: 'היסטוריית הוצאות (בפועל, {currency})', last3: '3 חודשים אחרונים', allMonths: 'כל החודשים', quarter: 'רבעון', singleMonth: 'חודש בודד',
    category: 'קטגוריה', actual: 'בפועל', budget: 'תקציב', diff: 'הפרש', avg: 'ממוצע',
    variableTotal: 'סה״כ משתנות', fixedTotal: 'סה״כ קבועות', leftOver: 'נשאר',
    isNew: 'חדש', removedPaused: 'הוסר או הושהה',
    historyNote: 'אדום = חריגה מהתקציב. כל תקופה מתחילה ביום {day} בחודש.',
    bonusTitle: 'בונוס על הפקדה לחיסכון, לא חלק מציון התקציב',
    deposited: '💰 הופקד לחיסכון (לא חלק מהציון): {items}',
    scoreLabel: 'ציון {score}/10:', noPointsLost: 'לא ירדו נקודות',
    reasonTotalOver: 'סך המשתנות {pct}% מעל התקציב', reasonCategoryOver: '{name} {pct}% מעל התקציב',
    trendTitle: 'ציון לפי חודש',
    closeConfirmTitle: 'לסגור את {label}?',
    closeConfirmText: 'זה שומר את הדוח של התקופה מ{from} עד {to}. התקופה הנוכחית לא מושפעת.',
    closeExists: 'כבר יש דוח לתקופה הזו, והוא יעודכן.',
    saveReport: 'שמירת הדוח', reportTitle: 'דוח {label}',
    allWithinBudget: 'לא ירדו נקודות. כל הקטגוריות נשארו בתוך התקציב.', seeReport: 'לדוח',

    invitePartner: 'הזמנת בן או בת הזוג לתקציב הזה', sendInvite: 'שליחת הזמנה', sending: 'שולח…',
    inviteHint: 'יגיע אליהם מייל מגוגל. הם נכנסים לאפליקציה, מתחברים ובוחרים "הצטרפות לתקציב ששותף איתי".',
    invalidEmail: 'הזינו כתובת מייל תקינה', inviteSent: 'ההזמנה נשלחה אל {email}',
    periodStartDay: 'כל תקופה מתחילה ביום',
    currenciesLine: 'מטבע ראשי: {main}', secondLine: ' · מטבע נוסף: {second}',
    openSheet: 'פתיחת גיליון התקציב בגוגל שיטס', switchBudget: 'החלפת תקציב', signOut: 'יציאה',
  },
}

export function translate(lang, key, vars) {
  const s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s
}

export const I18nContext = createContext({ lang: 'en', setLang: () => {} })

export function useI18n() {
  const { lang, setLang } = useContext(I18nContext)
  return { lang, setLang, t: (key, vars) => translate(lang, key, vars), locale: LANGS[lang].locale, dir: LANGS[lang].dir }
}
