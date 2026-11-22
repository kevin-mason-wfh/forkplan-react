// Shared nutrition widgets — same four-colour scheme as the iOS app (kcal green, protein blue, carbs orange, fat pink).
export const fmt = v => (v == null || Number.isNaN(+v) ? '—' : String(Math.round(+v * 10) / 10));
export const scaleN = (n, f) => (n ? { kcal: n.kcal * f, protein: n.protein * f, carbs: n.carbs * f, fat: n.fat * f } : null);
export const sumN = list => list.reduce((a, n) => (n ? { kcal: a.kcal + n.kcal, protein: a.protein + n.protein, carbs: a.carbs + n.carbs, fat: a.fat + n.fat } : a), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
/** Per-serving facts of a recipe (API shape: nutrition.per_serving). */
export const recipeN = r => r?.nutrition?.per_serving ?? null;
/** Totals for a planned meal (already scaled by servings). */
export const mealN = m => m?.nutrition?.total ?? (m?.nutrition?.per_serving ? scaleN(m.nutrition.per_serving, m.servings ?? 1) : null);

const MACROS = [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']];

/** Four big tiles: kcal / protein / carbs / fat (recipe detail). */
export function NutriTiles({ n }) {
  if (!n) return null;
  return (
    <div className="ntiles">
      <div className="nt kcal"><b>{fmt(n.kcal)}</b><span>kcal</span></div>
      {MACROS.map(([k, l]) => <div key={k} className={`nt ${k}`}><b>{fmt(n[k])}g</b><span>{l}</span></div>)}
    </div>
  );
}

/** Three compact macro pills (list rows). */
export function MacroPills({ n }) {
  if (!n) return null;
  return <div className="npills">{MACROS.map(([k, l]) => <div key={k} className={`np ${k}`}><b>{fmt(n[k])}g</b><span>{l}</span></div>)}</div>;
}

/** Macro tiles with "value / goal" and a progress bar (day summary). */
export function MacroProgress({ n, goal }) {
  return (
    <div className="npills big">
      {MACROS.map(([k, l]) => {
        const v = n?.[k] ?? 0, g = goal?.[k];
        return (
          <div key={k} className={`np ${k}`}>
            <div><b>{fmt(v)}</b>{g ? <small> / {fmt(g)}g</small> : <small>g</small>}</div>
            <span>{l}</span>
            <div className="nbar"><i style={{ width: `${g ? Math.min(100, (v / g) * 100) : 0}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}
