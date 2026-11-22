import { useState } from 'react';
import { createPortal } from 'react-dom';
import { title, recipeImage } from './api.js';
import { NutriTiles, fmt, recipeN, scaleN } from './nutrition.jsx';

const mins = s => (s ? `${Math.round(s / 60)} min` : null);
export const steps = text => String(text ?? '').split(/\r?\n/).map(l => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);

const VULGAR = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s?[½¼¾⅓⅔⅛⅜⅝⅞]|[½¼¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)`;
const UNITS = String.raw`(?:cups?|c|tablespoons?|tbsps?|tbs|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|millilitres?|ml|liters?|litres?|l|pints?|quarts?|gallons?|cloves?|slices?|pieces?|sticks?|cans?|pinch(?:es)?|dash(?:es)?|handfuls?|sprigs?|bunch(?:es)?)`;
const QTY_RE = new RegExp(String.raw`(?<![\w./])(${NUM})(\s?(?:-|–|to)\s?(${NUM}))?(\s?(?:${UNITS})\b)`, 'gi');
const toNum = t => {
  t = t.trim();
  let m;
  if ((m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = t.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s?([½¼¾⅓⅔⅛⅜⅝⅞])$/))) return +m[1] + VULGAR[m[2]];
  return VULGAR[t] ?? +t;
};
const nice = v => {
  const r = Math.round(v * 100) / 100;
  const whole = Math.floor(r + 1e-9), frac = r - whole;
  const fr = [[.25, '¼'], [.5, '½'], [.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔'], [.125, '⅛']].find(([f]) => Math.abs(frac - f) < .02);
  if (fr) return `${whole || ''}${fr[1]}`;
  return String(Math.round(v * 10) / 10);
};
/** Scale "2 cups", "1 1/2 tbsp", "200g" style quantities inside free-text instructions. */
export const scaleText = (text, f) => (f === 1 ? text : text.replace(QTY_RE, (_, a, range, b, unit) => `${nice(toNum(a) * f)}${range ? range.replace(b, nice(toNum(b) * f)) : ''}${unit}`));

/** Clean print-only layout, portalled to <body>; hidden on screen, the only thing visible when printing. */
function PrintSheet({ r }) {
  const img = recipeImage(r);
  const n = recipeN(r);
  const time = mins(r.total_time_seconds ?? ((r.prep_time_seconds ?? 0) + (r.cook_time_seconds ?? 0)));
  const st = steps(r.instructions);
  const ings = r.ingredients ?? [];
  const facts = n ? [['Calories', fmt(n.kcal), 'kcal'], ['Protein', fmt(n.protein), 'g'], ['Carbs', fmt(n.carbs), 'g'], ['Fat', fmt(n.fat), 'g']] : [];
  return createPortal(
    <div className="print-sheet print-recipe">
      <header className="ps-head">
        {img && <img className="ps-img" src={img} alt="" />}
        <div className="ps-info">
          <div className="ps-cat">{title(r.category)}</div>
          <h1>{r.name}</h1>
          <div className="ps-meta"><span>Serves <b>{r.servings}</b></span>{time && <span>Time <b>{time}</b></span>}</div>
          {(r.diet_tags ?? []).length > 0 && <div className="ps-tags">{r.diet_tags.map(t => <span key={t.id}>{t.name}</span>)}</div>}
          {facts.length > 0 && (
            <div className="ps-nutri">
              <div className="ps-nl">Nutrition per serving</div>
              <div className="ps-nrow">{facts.map(([l, v, u]) => <div key={l}><b>{v}<small>{u}</small></b><span>{l}</span></div>)}</div>
            </div>
          )}
        </div>
      </header>
      {r.description && <p className="ps-desc">{r.description}</p>}
      <div className="ps-cols">
        <section className="ps-ing">
          <h2>Ingredients</h2>
          <table>
            <tbody>
              {ings.map((i, k) => <tr key={k}><td className="q">{fmt(i.quantity)} {i.unit === 'piece' ? '' : i.unit ?? ''}</td><td>{i.ingredient_name ?? 'Ingredient'}</td></tr>)}
              {!ings.length && <tr><td>No ingredients.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="ps-steps">
          <h2>Instructions</h2>
          <table>
            <tbody>
              {st.map((s, k) => <tr key={k}><td className="n"><span>{k + 1}</span></td><td>{s}</td></tr>)}
              {!st.length && <tr><td>No instructions.</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
      <footer className="ps-foot">Printed from ForkPlan</footer>
    </div>,
    document.body
  );
}

/**
 * Recipe detail sheet content (hero image, nutrition tiles, tags, ingredients / instructions tabs).
 * `servings` (optional) scales nutrition + ingredient quantities for a planned meal.
 * `top` is rendered under the title (eaten toggle / servings stepper / add button); `footer` at the bottom.
 */
export default function RecipeView({ r, close, servings, top, footer }) {
  const [tab, setTab] = useState('ingredients');
  const img = recipeImage(r);
  const factor = servings ? servings / (r.servings || 1) : 1;
  const per = recipeN(r);
  const n = servings ? scaleN(per, servings) : per;
  const time = mins(r.total_time_seconds ?? ((r.prep_time_seconds ?? 0) + (r.cook_time_seconds ?? 0)));
  const st = steps(r.instructions).map(x => scaleText(x, factor));
  return (
    <>
      <PrintSheet r={r} />
      <div className="hero" style={img ? undefined : { height: 90 }}>
        {img && <img src={img} alt="" />}
        <button className="round" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="sheet-body">
        <h2 className="sheet-title">{r.name}</h2>
        <div className="meta">
          <span className={`dot-label cat-${r.category}`}><i />{title(r.category)}</span>
          <span>👤 Serves {r.servings}</span>
          {time && <span>⏱ {time}</span>}
        </div>
        {r.description && <p className="muted" style={{ fontSize: 14 }}>{r.description}</p>}
        {top}
        {n && <>
          <div className="muted" style={{ margin: '14px 0 6px' }}>{servings ? `For this meal · ${fmt(servings)} serving${+servings === 1 ? '' : 's'}` : 'Per serving'}</div>
          <NutriTiles n={n} />
        </>}
        {r.nutrition?.status && r.nutrition.status !== 'complete' && <p className="muted">Nutrition data is {String(r.nutrition.status).replace(/_/g, ' ')}.</p>}
        {(r.diet_tags ?? []).length > 0 && <div style={{ margin: '12px 0 4px' }}>{r.diet_tags.map(t => <span key={t.id} className="tag">{t.name}</span>)}</div>}
        <div className="seg">{[['ingredients', 'Ingredients'], ['instructions', 'Instructions']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'ingredients' ? (
          <div className="list">
            {(r.ingredients ?? []).map((i, k) => <div key={k} className="li"><i className="bul" /><span className="grow">{i.ingredient_name ?? 'Ingredient'}</span><span className="muted">{fmt(i.quantity * factor)} {i.unit === 'piece' ? 'each' : i.unit ?? ''}</span></div>)}
            {!(r.ingredients ?? []).length && <p className="muted" style={{ padding: 12 }}>No ingredients.</p>}
          </div>
        ) : (
          <>
            {servings && factor !== 1 && <p className="muted">Quantities in these steps are scaled for your servings. Check the Ingredients tab for exact amounts.</p>}
            {st.length ? st.map((s, k) => <div key={k} className="step"><b>{k + 1}</b><span>{s}</span></div>) : <p className="muted">No instructions.</p>}
          </>
        )}
        {footer && <div className="row sheet-foot">{footer}</div>}
      </div>
    </>
  );
}
