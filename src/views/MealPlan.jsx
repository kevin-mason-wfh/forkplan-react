import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, DAYS, MEALS, isoDate, mondayOf, title, todayName, recipeImage } from '../api.js';
import { Field, Loader, Page, Select, num, useAsync, useUI } from '../ui.jsx';
import { gatherPlan, csvToBundle, importBundle, FORMAT, CSV, stamp } from '../transfer.js';
import { download, pickFile, readText } from '../util.js';
import RecipeView from '../RecipeView.jsx';
import { MacroPills, MacroProgress, fmt, mealN, recipeN, scaleN, sumN } from '../nutrition.jsx';

const ICON = { breakfast: '☕', lunch: '🥪', dinner: '🍽', snack: '🍎', dessert: '🍰' };
const CAT_COLOR = { breakfast: '#c2410c', lunch: '#0f766e', dinner: '#4f46e5', snack: '#a21cae', dessert: '#0369a1' };
const MAX_SLOTS = 5;
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d + n); };

function PickRow({ r, onAdd, close }) {
  const { run } = useUI();
  const [n, setN] = useState(1);
  const nut = recipeN(r);
  const step = d => setN(v => Math.max(0.5, Math.round((v + d) * 100) / 100));
  const sn = scaleN(nut, n);
  return (
    <div className="pick-row">
      <div className="pick-top">
        {recipeImage(r) ? <img className="mini" src={recipeImage(r)} alt="" loading="lazy" /> : <div className="mini ph">🍽</div>}
        <div className="grow"><div className="pick-name">{r.name}</div><div className="muted">{title(r.category)} · per {fmt(n)} serving{n === 1 ? '' : 's'}</div></div>
        {sn && <div className="mkcal"><b>{fmt(sn.kcal)}</b><span>kcal</span></div>}
      </div>
      {sn && <MacroPills n={sn} />}
      <div className="pick-add">
        <div className="pick-step" aria-label="Servings to add">
          <button onClick={() => step(-0.5)} aria-label="Fewer servings">−</button>
          <span><b>{fmt(n)}</b><small>serving{n === 1 ? '' : 's'}</small></span>
          <button onClick={() => step(0.5)} aria-label="More servings">+</button>
        </div>
        <button className="btn sm" onClick={async () => { if (await run(() => onAdd(n))) close(); }}>Add to plan</button>
      </div>
    </div>
  );
}

function RecipePicker({ category, onPick, close }) {
  const { run } = useUI();
  const [src, setSrc] = useState('ACCOUNT');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(category);
  const [myDiet, setMyDiet] = useState(true);
  const { data } = useAsync(async () => ({ ACCOUNT: await api.recipes(), CATALOG: await api.catalogRecipes().catch(() => []), prefs: await api.dietaryPrefs().catch(() => null) }));
  const dietIds = data?.prefs?.diet_tag_ids ?? [];
  const avoid = new Set(data?.prefs?.allergen_codes ?? []);
  const hasDiet = dietIds.length > 0 || avoid.size > 0;
  const fitsDiet = r => dietIds.every(id => (r.diet_tags ?? []).some(t => t.id === id))
    && !(r.allergens ?? []).some(a => avoid.has(a.code ?? a));
  const items = (data?.[src] ?? []).filter(r => r.name.toLowerCase().includes(q) && (!cat || r.category === cat) && (!myDiet || !hasDiet || fitsDiet(r)));
  return (
    <div className="picker">
      <div className="picker-head">
      <div className="tabs">{[['ACCOUNT', 'My recipes'], ['CATALOG', 'Catalog']].map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => setSrc(k)}>{l}</button>)}</div>
      {hasDiet && <label className="diet-toggle"><span><b>My diet</b><span className="muted">Match your diet and hide foods you avoid</span></span><input type="checkbox" className="switch" checked={myDiet} onChange={e => setMyDiet(e.target.checked)} /></label>}
      <div className="field-row picker-fields">
        <Field label="Search"><input placeholder="Search recipes…" value={q} onChange={e => setQ(e.target.value.toLowerCase())} /></Field>
      </div>
      <div className="catbar pick-cats">
        <button className={'cat' + (!cat ? ' on' : '')} style={{ '--c': '#1f9d4a' }} onClick={() => setCat('')}>✨ All</button>
        {MEALS.map(c => <button key={c} className={'cat' + (cat === c ? ' on' : '')} style={{ '--c': CAT_COLOR[c] }} onClick={() => setCat(cat === c ? '' : c)}>{ICON[c]} {title(c)}</button>)}
      </div>
      </div>
      <div className="picker-list">
      {!data ? <Loader /> : items.length ? items.map(r => <PickRow key={r.id} r={r} onAdd={n => onPick({ id: r.id, source: src }, n)} close={close} />) : <p className="muted">No recipes found.</p>}
      </div>
    </div>
  );
}

function NewPlan({ onDone, close }) {
  const { run } = useUI();
  const [name, setName] = useState('My week');
  const [week, setWeek] = useState(isoDate(mondayOf()));
  return (
    <>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Week starting (Monday)"><input type="date" value={week} onChange={e => setWeek(e.target.value)} /></Field>
      <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={async () => { const r = await run(() => api.createMealPlan(name.trim(), week)); if (r) { close(); onDone(r.id); } }}>Create</button></div>
    </>
  );
}

function Rename({ plan, onDone, close }) {
  const { run } = useUI();
  const [name, setName] = useState(plan.name);
  return (<><Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
    <button className="btn" style={{ marginTop: 12 }} onClick={async () => { if (await run(() => api.renameMealPlan(plan.id, name.trim()))) { close(); onDone(); } }}>Save</button></>);
}

function History() {
  const state = useAsync(() => api.consumptions().catch(() => []));
  const items = [...(state.data ?? [])].sort((a, b) => b.consumed_at.localeCompare(a.consumed_at));
  const days = [];
  for (const i of items) {
    const d = new Date(i.consumed_at);
    const key = d.toDateString();
    let g = days[days.length - 1];
    if (!g || g.key !== key) days.push(g = { key, date: d, items: [] });
    g.items.push(i);
  }
  const total = (g, k) => g.items.reduce((s, i) => s + (+i[k] || 0), 0);
  const MACROS = [['calories', 'kcal', 'kcal'], ['protein', 'protein', 'g'], ['carbs', 'carbs', 'g'], ['fat', 'fat', 'g']];
  if (state.loading) return <div className="card"><Loader /></div>;
  if (!days.length) return (
    <div className="card hist-empty"><div className="hist-empty-ic">🍽</div><h3>No meals logged yet</h3><p className="muted">Tap “Eaten” on a planned meal and it will show up here.</p></div>
  );
  return (
    <div className="hist">
      {days.map(g => (
        <section key={g.key} className="hist-day">
          <header className="hist-dh">
            <div><div className="hist-date">{g.date.toLocaleDateString(undefined, { weekday: 'long' })}</div><div className="muted">{g.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
            <div className="hist-tot"><b>{fmt(total(g, 'calories'))}</b> kcal<span className="muted"> · {g.items.length} meal{g.items.length === 1 ? '' : 's'}</span></div>
          </header>
          <div className="card hist-list">
            {g.items.map(i => (
              <div key={i.id} className="hist-row">
                <div className="hist-ic">{ICON[i.meal_category] ?? '🍽'}</div>
                <div className="grow">
                  <div className="hist-name">{i.recipe_name}</div>
                  <div className="muted">{title(i.meal_category)} · {new Date(i.consumed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <div className="hist-macros">
                  {MACROS.map(([k, c, u]) => <span key={k} className={'hist-m ' + c}>{fmt(+i[k] || 0)}{u === 'g' ? 'g' : ''} <small>{u === 'g' ? c[0].toUpperCase() : u}</small></span>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MealSheet({ plan, m, close, onChanged }) {
  const { run, confirm } = useUI();
  const [servings, setServings] = useState(+m.servings);
  const [eaten, setEaten] = useState(!!m.eaten_by_me);
  const rec = useAsync(() => (m.recipe_source === 'CATALOG' ? api.catalogRecipe(m.catalog_recipe_id) : api.recipe(m.recipe_id)));
  const toggle = async () => {
    const ok = await run(async () => {
      if (eaten) for (const c of await api.consumptionsFor(m.id)) await api.deleteConsumption(c.id);
      else await api.logConsumption(m.id);
    }, eaten ? 'Marked as not eaten' : 'Logged as eaten');
    if (ok) { setEaten(!eaten); onChanged(); }
  };
  const step = async d => {
    const next = Math.max(0.5, Math.round((servings + d) * 100) / 100);
    if (next !== servings && await run(() => api.setMealServings(plan.id, m.id, next))) { setServings(next); onChanged(); }
  };
  if (!rec.data) return <div className="sheet-body" style={{ paddingTop: 24 }}>{rec.error ? <p>Couldn't load recipe: {rec.error.message}</p> : <p className="muted">Loading…</p>}<button className="btn ghost" onClick={close}>Close</button></div>;
  return (
    <RecipeView r={rec.data} close={close} servings={servings}
      top={<>
        <button className="eatrow" onClick={toggle}><span>{eaten ? 'Eaten' : 'Not eaten'}</span><i className={'check-c' + (eaten ? ' on' : '')}>{eaten ? '✓' : ''}</i></button>
        <div className="eatrow"><div><small className="muted">Servings</small><div style={{ fontWeight: 600, fontSize: 18 }}>{fmt(servings)} serving{servings === 1 ? '' : 's'}</div></div>
          <div className="stepper"><button onClick={() => step(-0.5)} aria-label="Fewer">−</button><button onClick={() => step(0.5)} aria-label="More">+</button></div></div>
      </>}
      footer={<>
        <button className="btn ghost" onClick={async () => { if (await confirm(`Remove "${m.recipe_name}" from the plan?`, 'Remove') && await run(() => api.removeMeal(plan.id, m.id), 'Removed')) { close(); onChanged(); } }}>Remove from plan</button>
        <button className="btn ghost" onClick={() => window.print()}>Print</button>
      </>} />
  );
}

function MealCard({ m, onOpen, onToggle }) {
  const n = mealN(m);
  const img = recipeImage(m);
  return (
    <div className={`mcard cat-b-${m.category}`} onClick={onOpen}>
      <button data-tour="plan-eaten" className="eat-btn" title={m.eaten_by_me ? 'Mark as not eaten' : 'Mark as eaten'} aria-pressed={!!m.eaten_by_me} onClick={e => { e.stopPropagation(); onToggle(); }}>
        <i className={'check-c' + (m.eaten_by_me ? ' on' : '')}>{m.eaten_by_me ? '✓' : ''}</i><small>{m.eaten_by_me ? 'Eaten' : 'Eaten?'}</small>
      </button>
      {img ? <img className="mthumb" src={img} alt="" loading="lazy" /> : <div className="mthumb ph">{ICON[m.category]}</div>}
      <div className="mbody">
        <div className="mtop">
          <div className="grow">
            <div className={'mname' + (m.eaten_by_me ? ' done' : '')}>{m.recipe_name}</div>
            <div className="muted">{num(m.servings)} serving{+m.servings === 1 ? '' : 's'}</div>
          </div>
          {n && <div className="mkcal"><b>{fmt(n.kcal)}</b><span>kcal</span></div>}
          <span className="chev">›</span>
        </div>
        <MacroPills n={n} />
      </div>
    </div>
  );
}

const PwChips = ({ n }) => n ? (
  <div className="pw-chips">
    <span className="kcal"><b>{fmt(n.kcal)}</b>kcal</span>
    <span className="protein"><b>{fmt(n.protein)}g</b>Protein</span>
    <span className="carbs"><b>{fmt(n.carbs)}g</b>Carbs</span>
    <span className="fat"><b>{fmt(n.fat)}g</b>Fat</span>
  </div>
) : null;

/** Print-only weekly overview (portalled; hidden on screen). */
function PrintWeek({ plan, meals, dates, target }) {
  const inDay = (d, c) => meals.filter(m => m.day === d && m.category === c).sort((a, b) => a.slot - b.slot);
  const range = dates.length ? `${dates[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${dates[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  return createPortal(
    <div className="print-sheet print-week">
      <div className="pw-head">
        <div><div className="pw-eyebrow">Weekly Meal Plan</div><h1>{plan.name}</h1></div>
        <div className="pw-range">{range}<small>{meals.length} meals planned</small></div>
      </div>
      <div className="pw-grid">
        {DAYS.map((d, i) => {
          const dm = meals.filter(m => m.day === d);
          const dn = sumN(dm.map(mealN));
          return (
            <div key={d} className="pw-day">
              <h3><span>{title(d)} <em>{dates[i]?.getDate()}</em></span></h3>
              {MEALS.map(c => inDay(d, c).map(m => {
                const n = mealN(m);
                return (
                  <div key={m.id} className="pw-meal">
                    <i className={'pw-box' + (m.eaten_by_me ? ' on' : '')} />
                    <div className="pw-body">
                      <div className="pw-name"><span className="pw-type">{title(c)}</span>{m.recipe_name}{+m.servings !== 1 && <em> ×{num(m.servings)}</em>}</div>
                      <PwChips n={n} />
                    </div>
                  </div>
                );
              }))}
              {!dm.length && <div className="pw-empty">Nothing planned</div>}
              {dm.length > 0 && dn.kcal > 0 && <div className="pw-daysum"><div className="pw-dl">Day total</div><PwChips n={dn} /></div>}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default function MealPlan() {
  const { run, openModal, confirm, toast } = useUI();
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('week');
  const [day, setDay] = useState(todayName());
  const plans = useAsync(() => api.mealPlans());
  const goal = useAsync(() => api.goal().catch(() => null));
  useEffect(() => {
    if (!plans.data) return;
    if (!plans.data.find(p => p.id === selected)) setSelected((plans.data.find(p => p.week_start === isoDate(mondayOf())) ?? plans.data[0])?.id ?? null);
  }, [plans.data, selected]);
  const detail = useAsync(() => (selected ? api.mealPlan(selected) : Promise.resolve(null)), [selected]);
  const refreshAll = () => { plans.reload(); detail.reload(); };
  const plan = detail.data;
  const meals = plan?.planned_meals ?? [];
  const weekStart = plan?.week_start;
  const dates = weekStart ? DAYS.map((_, i) => addDays(weekStart, i)) : [];
  useEffect(() => {
    if (!weekStart) return;
    const t = isoDate(new Date());
    const hit = DAYS.findIndex((_, i) => isoDate(addDays(weekStart, i)) === t);
    setDay(hit >= 0 ? DAYS[hit] : 'MONDAY');
  }, [weekStart]);

  const inDay = (d, c) => meals.filter(m => m.day === d && (!c || m.category === c)).sort((a, b) => a.slot - b.slot);
  const pick = (d, c) => {
    const used = new Set(inDay(d, c).map(m => m.slot));
    const slot = [0, 1, 2, 3, 4].find(k => !used.has(k));
    if (slot == null) return run(async () => { throw new Error(`You can plan up to ${MAX_SLOTS} ${c} meals per day`); });
    openModal(`Add ${c} · ${title(d)}`, close => (
      <RecipePicker category={c} close={close} onPick={async (r, s) => { await api.addMeal(plan.id, d, c, r, s, slot); detail.reload(); }} />));
  };
  const openMeal = m => openModal(m.recipe_name, close => <MealSheet plan={plan} m={m} close={close} onChanged={detail.reload} />, { sheet: true });
  const toggleEaten = async m => {
    const ok = await run(async () => {
      if (m.eaten_by_me) for (const c of await api.consumptionsFor(m.id)) await api.deleteConsumption(c.id);
      else await api.logConsumption(m.id);
    });
    if (ok) detail.reload();
  };

  const dayMeals = inDay(day);
  const eatenMeals = dayMeals.filter(m => m.eaten_by_me);
  const eatenN = sumN(eatenMeals.map(mealN));
  const plannedN = sumN(dayMeals.map(mealN));
  const target = goal.data ?? plan?.nutrition_targets ?? null;
  const di = DAYS.indexOf(day);

  const exportPlan = async () => { const b = await run(() => gatherPlan(plan.id)); if (b) download(`forkplan-mealplan-${stamp()}.json`, JSON.stringify(b, null, 2)); };
  const importPlan = async type => {
    const file = await pickFile(type === 'json' ? '.json,application/json' : '.csv,text/csv'); if (!file) return;
    const lines = [];
    const s = await run(async () => {
      const text = await readText(file); let b;
      if (type === 'json') { b = JSON.parse(text); if (b.format !== FORMAT) throw new Error('This file is not a Forkplan export'); } else b = csvToBundle('mealplans', text);
      if (!b.mealPlans?.length) throw new Error('No meal plan found in file');
      return importBundle(b, { ingredients: true, recipes: true, mealPlans: true }, m => lines.push(m));
    });
    if (s) { plans.reload(); toast(s.created || s.skipped ? `Plan imported (${s.created} created, ${s.skipped} skipped${s.failed ? `, ${s.failed} failed` : ''})` : 'Nothing imported', s.failed > 0); }
  };

  const actions = (
    <>
      {plans.data?.length > 0 && <Select style={{ width: 'auto' }} value={selected ?? ''} onChange={e => setSelected(e.target.value)} options={plans.data.map(p => [p.id, p.name + (p.week_start ? ` (${p.week_start})` : '')])} />}
      <details className="menu no-print">
        <summary className="round-btn" aria-label="Plan options" data-tour="plan-more">⋯</summary>
        <div className="menu-backdrop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')} />
        <div className="menu-pop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')}>
          {plan && <>
            <button onClick={() => setTab(tab === 'history' ? 'week' : 'history')}>{tab === 'history' ? '📅 Back to plan' : '🕘 Meal history'}</button>
            <button onClick={() => openModal('Rename plan', close => <Rename plan={plan} close={close} onDone={refreshAll} />)}>✏️ Rename</button>
            {plan.week_start !== isoDate(mondayOf()) && <button onClick={async () => { if (await run(() => api.advanceWeek(plan.id, isoDate(mondayOf())), 'This plan is now set for this week')) refreshAll(); }}>🔁 Reuse this plan for this week</button>}
            <button onClick={() => window.print()}>🖨️ Print</button>
            <button onClick={exportPlan}>📤 Export plan (JSON)</button>
            <button onClick={async () => { const b = await run(() => gatherPlan(plan.id)); if (b) download(`forkplan-mealplan-${stamp()}.csv`, CSV.mealplans(b), 'text/csv'); }}>📤 Export plan (CSV)</button>
          </>}
          <button onClick={() => importPlan('json')}>📥 Import plan (JSON)</button>
          <button onClick={() => importPlan('csv')}>📥 Import plan (CSV)</button>
          {plan && <button className="danger" onClick={async () => { if (await confirm(`Delete "${plan.name}"?`) && await run(() => api.deleteMealPlan(plan.id), 'Deleted')) { setSelected(null); plans.reload(); } }}>🗑️ Delete plan</button>}
        </div>
      </details>
      <button className="round-btn add" data-tour="plan-new" title="New plan" aria-label="New plan" onClick={() => openModal('New meal plan', close => <NewPlan close={close} onDone={id => { setSelected(id); plans.reload(); }} />)}>+</button>
    </>
  );

  return (
    <Page title="Meal Plan" actions={actions} sticky={plan && tab !== 'history' ? (
      <>
              <div className="daystrip" data-tour="plan-days">
                {DAYS.map((d, i) => {
                  const cats = MEALS.filter(c => inDay(d, c).length);
                  return (
                    <button key={d} className={'daycell' + (d === day ? ' on' : '')} onClick={() => setDay(d)}>
                      <span className="dow">{d.slice(0, 3)}</span>
                      <span className="dnum">{dates[i].getDate()}</span>
                      <span className="dots">{cats.map(c => <i key={c} className={`dot-${c}`} />)}</span>
                    </button>
                  );
                })}
              </div>
      </>) : null} state={[plans, detail]} busy={!selected && plans.data?.length > 0}>
      {!selected ? <div className="card"><p>No meal plans yet. Create your first one to start planning.</p></div> : !plan ? null : (
        <>
          <PrintWeek plan={plan} meals={meals} dates={dates} target={target} />
          {tab === 'history' ? <History /> : (
            <>
              <div className="plan-body">
                <aside className="plan-summary">
                  <div className="card sumcard">
                    <div className="row between" style={{ alignItems: 'baseline' }}>
                      <div><span className="dayname">{title(day)}</span> <span className="muted">{dates[di]?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>
                      <span className="muted">{eatenMeals.length} of {dayMeals.length} meal{dayMeals.length === 1 ? '' : 's'} eaten</span>
                    </div>
                    <div className="bigkcal"><b>{fmt(eatenN.kcal)}</b>{target?.kcal ? <span> / {fmt(target.kcal)} kcal target</span> : <span> kcal eaten</span>}</div>
                    <div className="bar green"><i style={{ width: `${target?.kcal ? Math.min(100, (eatenN.kcal / target.kcal) * 100) : 0}%` }} /></div>
                    <div className="sum-more">
                    <MacroProgress n={eatenN} goal={target} />
                    {plannedN.kcal > 0 && <p className="muted" style={{ margin: '12px 0 0' }}>Planned for the day: {fmt(plannedN.kcal)} kcal · {fmt(plannedN.protein)}g protein · {fmt(plannedN.carbs)}g carbs · {fmt(plannedN.fat)}g fat</p>}
                    </div>
                    {!target && <p className="muted" style={{ margin: '8px 0 0' }}>Set daily targets in Account to see progress.</p>}
                  </div>
                </aside>
                <section className="plan-meals">
                  {MEALS.map(c => {
                    const list = inDay(day, c);
                    const kcal = sumN(list.map(mealN)).kcal;
                    return (
                      <div key={c} className="msection">
                        <div className={`mhead cat-t-${c}`}><span className="micon">{ICON[c]}</span><h3>{title(c)}</h3><span className="grow" />{list.length > 0 && <span className="mhk"><b>{fmt(kcal)}</b> kcal</span>}</div>
                        {list.map(m => <MealCard key={m.id} m={m} onOpen={() => openMeal(m)} onToggle={() => toggleEaten(m)} />)}
                        {list.length < MAX_SLOTS && <button data-tour="plan-add" className={`addrow cat-t-${c} no-print`} onClick={() => pick(day, c)}><span>＋</span>{list.length ? `Add another ${c}` : `Add ${c}`}</button>}
                      </div>
                    );
                  })}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </Page>
  );
}
