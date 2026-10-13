// Fixed-cost changes between two report snapshots. Items are { name, amount } in the main currency.
// Returns null when either snapshot has no item list. Formatting is left to the UI.
export function diffFixed(prevItems, curItems) {
  if (!prevItems || !curItems) return null
  const prev = new Map(prevItems.map(i => [i.name, i.amount]))
  const cur = new Map(curItems.map(i => [i.name, i.amount]))
  const out = []
  for (const [name, amount] of cur) {
    if (!prev.has(name)) out.push({ name, diff: amount, kind: 'new' })
    else if (Math.abs(amount - prev.get(name)) >= 1) out.push({ name, diff: amount - prev.get(name), kind: 'changed', from: prev.get(name), to: amount })
  }
  for (const [name, amount] of prev) if (!cur.has(name)) out.push({ name, diff: -amount, kind: 'removed' })
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}

// Budget adherence score, deterministic. Start at 10;
// -1 per full 3% that total variable spending is over total budget;
// -1 per category more than 10% over its own budget (max -3). Floor 1.
// Reasons are structured ({ code, pts, pct, name }) so the UI can translate them.
export function budgetScore(categories = []) {
  const actual = categories.reduce((a, c) => a + (Number(c.actual) || 0), 0)
  const budget = categories.reduce((a, c) => a + (Number(c.budget) || 0), 0)
  const reasons = []
  let score = 10
  const overPct = budget > 0 ? (actual - budget) / budget * 100 : 0
  if (overPct >= 3) {
    const pts = Math.floor(overPct / 3)
    score -= pts
    reasons.push({ code: 'total_over', pts, pct: Math.round(overPct) })
  }
  const overCats = categories
    .filter(c => c.budget > 0 && c.actual > c.budget * 1.1)
    .sort((a, b) => b.actual / b.budget - a.actual / a.budget)
  overCats.slice(0, 3).forEach(c => {
    score -= 1
    reasons.push({ code: 'category_over', pts: 1, name: c.name, pct: Math.round((c.actual / c.budget - 1) * 100) })
  })
  return { score: Math.max(1, score), reasons }
}

export function reasonText(r) {
  if (r.code === 'total_over') return `Variable total ${r.pct}% over budget`
  if (r.code === 'category_over') return `${r.name} ${r.pct}% over budget`
  return ''
}
