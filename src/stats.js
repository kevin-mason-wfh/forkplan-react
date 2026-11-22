// Pure helpers for the Nutrition Summary and Meal Suggestions (mirrors the iOS NutritionSummaryCalculator rules).
import { isoDate, mondayOf, refId } from './api.js';

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const dayKey = d => isoDate(d);

/** `consumed_at` is UTC; bucket by the LOCAL day. Timestamps without an offset are treated as UTC. */
export function localDay(ts) {
  const s = String(ts);
  return isoDate(new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'));
}

/** Sum consumptions into { 'YYYY-MM-DD': {kcal, protein, carbs, fat} } keyed by local day. */
export function totalsByDay(consumptions) {
  const out = {};
  for (const c of consumptions) {
    const k = localDay(c.consumed_at);
    const t = (out[k] ??= { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    t.kcal += +c.calories || 0; t.protein += +c.protein || 0; t.carbs += +c.carbs || 0; t.fat += +c.fat || 0;
  }
  return out;
}

/** Current streak: consecutive logged days ending today (or yesterday if nothing is logged yet today). */
export function currentStreak(days, today = new Date()) {
  let d = startOfDay(today);
  if (!days[dayKey(d)]) d = addDays(d, -1);
  let n = 0;
  while (days[dayKey(d)]) { n++; d = addDays(d, -1); }
  return n;
}

/** Inclusive list of local days between two dates. */
const span = (from, to) => { const out = []; for (let d = startOfDay(from); d <= to; d = addDays(d, 1)) out.push(new Date(d)); return out; };

export function periodBounds(period, today = new Date()) {
  const t = startOfDay(today);
  if (period === 'week') {
    const start = mondayOf(t);
    return { start, end: addDays(start, 6), prevStart: addDays(start, -7), prevEnd: addDays(start, -1) };
  }
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return { start, end, prevStart: new Date(t.getFullYear(), t.getMonth() - 1, 1), prevEnd: addDays(start, -1) };
}

const avgOf = (days, list) => {
  const logged = list.map(d => days[dayKey(d)]).filter(Boolean);
  if (!logged.length) return null;
  const sum = logged.reduce((a, x) => ({ kcal: a.kcal + x.kcal, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const n = logged.length;
  return { kcal: sum.kcal / n, protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n, n };
};

/**
 * Summary for a Week (Mon–Sun, 7 bars) or Month (calendar month, 4 weekly buckets).
 * Averages divide by LOGGED days — an unlogged day is "not recorded", not "0 kcal".
 */
export function summarize(days, period, today = new Date()) {
  const t = startOfDay(today);
  const { start, end, prevStart, prevEnd } = periodBounds(period, t);
  const sofar = span(start, t < end ? t : end);
  const avg = avgOf(days, sofar);
  const prevAvg = avgOf(days, span(prevStart, prevEnd));
  const trendPercent = avg && prevAvg && prevAvg.kcal > 0 ? Math.round(((avg.kcal - prevAvg.kcal) / prevAvg.kcal) * 100) : null;

  let bars;
  if (period === 'week') {
    bars = span(start, end).map(d => ({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), value: days[dayKey(d)]?.kcal ?? 0, future: d > t }));
  } else {
    const last = end.getDate();
    bars = [[1, 7], [8, 14], [15, 21], [22, last]].map(([a, b], i) => {
      const list = span(new Date(start.getFullYear(), start.getMonth(), a), new Date(start.getFullYear(), start.getMonth(), b));
      return { label: `Wk ${i + 1}`, value: avgOf(days, list)?.kcal ?? 0, future: list[0] > t };
    });
  }

  // "Today doesn't count against you yet": elapsed runs to yesterday, plus today once it has a log.
  const elapsed = sofar.filter(d => d < t || days[dayKey(d)]);
  const loggedElapsed = elapsed.filter(d => days[dayKey(d)]).length;
  const daysLoggedPercent = elapsed.length ? Math.round((loggedElapsed / elapsed.length) * 100) : 0;
  return { bars, avg, trendPercent, daysLoggedPercent, hasLogs: !!avg, streak: currentStreak(days, t) };
}

/**
 * Meal suggestions from pantry stock. Missing = pantry has less than the recipe needs (matched by source + id).
 * 0 missing → "ready"; 1–2 → "near"; 3+ or no ingredients → not suggested. Sorted fewest missing, then name.
 */
export function suggest(recipes, pantryItems) {
  const stock = new Map();
  for (const it of pantryItems) {
    const src = it.ingredient_source ?? 'ACCOUNT';
    stock.set(`${src}:${refId(it)}`, (stock.get(`${src}:${refId(it)}`) ?? 0) + (+(it.in_pantry ?? it.quantity) || 0));
  }
  const out = [];
  for (const r of recipes) {
    const need = new Map(); const names = new Map();
    for (const i of r.ingredients ?? []) {
      const k = `${i.ingredient_source ?? 'ACCOUNT'}:${refId(i)}`;
      need.set(k, (need.get(k) ?? 0) + (+i.quantity || 0));
      names.set(k, i.ingredient_name ?? 'Ingredient');
    }
    if (!need.size) continue;
    const missing = [...need].filter(([k, q]) => (stock.get(k) ?? 0) + 1e-9 < q).map(([k]) => names.get(k));
    if (missing.length > 2) continue;
    out.push({ r, missing, group: missing.length ? 'near' : 'ready' });
  }
  return out.sort((a, b) => a.missing.length - b.missing.length || a.r.name.localeCompare(b.r.name));
}
