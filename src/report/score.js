// Returns null when either month has no item-level snapshot (all reports before Oct 2026)
export function diffFixed(prevItems, curItems) {
  if (!prevItems || !curItems) return null
  const prev = new Map(prevItems.map(i => [i.name, i.eur]))
  const cur = new Map(curItems.map(i => [i.name, i.eur]))
  const out = []
  for (const [name, eur] of cur) {
    if (!prev.has(name)) out.push({ name, diff: eur, note: 'new' })
    else if (Math.abs(eur - prev.get(name)) >= 1) out.push({ name, diff: eur - prev.get(name), note: `€${Math.round(prev.get(name))} → €${Math.round(eur)}` })
  }
  for (const [name, eur] of prev) if (!cur.has(name)) out.push({ name, diff: -eur, note: 'removed or paused' })
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
}

// Budget adherence score, deterministic. Start at 10;
// -1 per full 3% that total variable spending is over total budget;
// -1 per category more than 10% over its own budget (max -3). Floor 1.
export function budgetScore(categories = []) {
  const actual = categories.reduce((a, c) => a + (Number(c.actual) || 0), 0)
  const budget = categories.reduce((a, c) => a + (Number(c.budget) || 0), 0)
  const reasons = []
  let score = 10
  const overPct = budget > 0 ? (actual - budget) / budget * 100 : 0
  if (overPct >= 3) {
    const pts = Math.floor(overPct / 3)
    score -= pts
    reasons.push({ pts, text: `Variable total ${Math.round(overPct)}% over budget` })
  }
  const overCats = categories
    .filter(c => c.budget > 0 && c.actual > c.budget * 1.1)
    .sort((a, b) => b.actual / b.budget - a.actual / a.budget)
  overCats.slice(0, 3).forEach(c => {
    score -= 1
    reasons.push({ pts: 1, text: `${c.name} ${Math.round((c.actual / c.budget - 1) * 100)}% over budget` })
  })
  return { score: Math.max(1, score), reasons }
}
