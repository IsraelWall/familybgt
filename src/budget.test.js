import { describe, it, expect } from 'vitest'
import { cycleOf, previousCycle, cycleForReport, inCycle, toMain, roundMoney, actualsByCategory, savingBalance, clampStartDay } from './budget.js'
import { colLetter, rowsToObjects, objectToRow } from './sheets.js'
import { budgetScore, diffFixed } from './report/score.js'

describe('cycles', () => {
  it('start day 1 follows calendar months', () => {
    const c = cycleOf(new Date(2026, 9, 13), 1)
    expect([c.start.getDate(), c.start.getMonth(), c.end.getMonth(), c.key]).toEqual([1, 9, 10, '2026-10'])
  })
  it('start day 5 before the 5th belongs to the previous month', () => {
    const c = cycleOf(new Date(2026, 9, 3), 5)
    expect(c.key).toBe('2026-09')
    expect(c.end).toEqual(new Date(2026, 9, 5))
  })
  it('start day 28 across February', () => {
    const c = cycleOf(new Date(2027, 1, 10), 28)
    expect(c.start).toEqual(new Date(2027, 0, 28))
    expect(c.end).toEqual(new Date(2027, 1, 28))
  })
  it('previous cycle and report cycle line up across a year boundary', () => {
    const p = previousCycle(new Date(2027, 0, 10), 5)
    expect(p.key).toBe('2026-12')
    expect(cycleForReport(12, 2026, 5).key).toBe('2026-12')
  })
  it('clamps start day to 1..28', () => {
    expect([clampStartDay(0), clampStartDay(31), clampStartDay('7')]).toEqual([1, 28, 7])
  })
  it('inCycle is end-exclusive', () => {
    const c = cycleOf(new Date(2026, 9, 13), 1)
    expect(inCycle(new Date(2026, 10, 1).toISOString(), c)).toBe(false)
    expect(inCycle(new Date(2026, 9, 31, 23).toISOString(), c)).toBe(true)
    expect(inCycle('not a date', c)).toBe(false)
  })
})

describe('money', () => {
  const cur = { main: 'EUR', second: 'ILS', rate: 4 }
  it('converts the second currency into the main one', () => {
    expect(toMain(400, 'ILS', cur)).toBe(100)
    expect(toMain(50, 'EUR', cur)).toBe(50)
    expect(toMain('12.5', undefined, cur)).toBe(12.5)
  })
  it('rounds to the currency digits', () => {
    expect(roundMoney('12.345', 'EUR')).toBe(12.35)
    expect(roundMoney('1234.6', 'JPY')).toBe(1235)
  })
})

describe('derived balances', () => {
  const c = cycleOf(new Date(2026, 9, 13), 1)
  it('actual per category is the signed sum of transactions in the cycle', () => {
    const tx = [
      { category_id: 'a', amount: 50, added_at: new Date(2026, 9, 2).toISOString() },
      { category_id: 'a', amount: 50, added_at: new Date(2026, 9, 2).toISOString() }, // two partners, same moment
      { category_id: 'a', amount: -20, added_at: new Date(2026, 9, 5).toISOString() },
      { category_id: 'a', amount: 999, added_at: new Date(2026, 8, 30).toISOString() }, // previous cycle
    ]
    expect(actualsByCategory(tx, c)).toEqual({ a: 80 })
  })
  it('savings balance and previous balance come from entries', () => {
    const e = [
      { saving_id: 's', amount: 1000, kind: 'opening', added_at: '2026-10-01T10:00:00Z' },
      { saving_id: 's', amount: 200, kind: 'deposit', added_at: '2026-10-03T10:00:00Z' },
      { saving_id: 'x', amount: 5, kind: 'deposit', added_at: '2026-10-03T10:00:00Z' },
    ]
    expect(savingBalance(e, 's')).toEqual({ balance: 1200, previous: 1000, lastChange: 200 })
    expect(savingBalance([], 's')).toEqual({ balance: 0, previous: 0, lastChange: 0 })
  })
})

describe('sheet rows', () => {
  it('column letters', () => {
    expect([colLetter(0), colLetter(7), colLetter(25), colLetter(26)]).toEqual(['A', 'H', 'Z', 'AA'])
  })
  it('maps rows by header, keeps numbers, drops soft-deleted and empty rows', () => {
    const values = [
      ['id', 'name', 'amount', 'deleted'],
      ['1', 'Rent', 12.5, ''],
      ['2', 'Old', 3, true],
      ['', '', '', ''],
      ['3', '=1+1'],
    ]
    expect(rowsToObjects(values)).toEqual([
      { id: '1', name: 'Rent', amount: 12.5, deleted: null },
      { id: '3', name: '=1+1', amount: null, deleted: null },
    ])
  })
  it('orders a row by the tab schema', () => {
    expect(objectToRow('VariableTransactions', { amount: 5, id: 'x', category_id: 'c', extra: 1 })).toEqual(['x', 'c', 5, ''])
  })
})

describe('report', () => {
  it('score matches the original formula', () => {
    expect(budgetScore([{ name: 'A', budget: 100, actual: 100 }]).score).toBe(10)
    const r = budgetScore([{ name: 'A', budget: 100, actual: 112 }, { name: 'B', budget: 100, actual: 100 }])
    expect(r.score).toBe(7) // total 6% over: -2; A 12% over its budget: -1
  })
  it('fixed changes are structured', () => {
    const d = diffFixed([{ name: 'Rent', amount: 1000 }, { name: 'Gym', amount: 30 }], [{ name: 'Rent', amount: 1100 }, { name: 'Phone', amount: 20 }])
    expect(d).toEqual([
      { name: 'Rent', diff: 100, kind: 'changed', from: 1000, to: 1100 },
      { name: 'Gym', diff: -30, kind: 'removed' },
      { name: 'Phone', diff: 20, kind: 'new' },
    ])
  })
})

import { STRINGS, translate } from './i18n.js'
import { DEFAULT_CATEGORIES } from './defaults.js'

describe('i18n', () => {
  it('Hebrew and English have the same keys', () => {
    const en = Object.keys(STRINGS.en).sort(), he = Object.keys(STRINGS.he).sort()
    expect(he.filter(k => !en.includes(k))).toEqual([])
    expect(en.filter(k => !he.includes(k))).toEqual([])
  })
  it('placeholders match between languages', () => {
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join()
    for (const k of Object.keys(STRINGS.en)) expect(ph(STRINGS.he[k]), k).toBe(ph(STRINGS.en[k]))
  })
  it('fills placeholders and falls back to English', () => {
    expect(translate('he', 'daysAgo', { n: 3 })).toBe('לפני 3 ימים')
    expect(translate('xx', 'save')).toBe('Save')
  })
  it('no dashes in Hebrew prose', () => {
    for (const [k, v] of Object.entries(STRINGS.he)) expect(/[–—־]/.test(v), k).toBe(false)
  })
  it('default categories exist for both languages', () => {
    expect(DEFAULT_CATEGORIES.he.length).toBe(DEFAULT_CATEGORIES.en.length)
  })
})
