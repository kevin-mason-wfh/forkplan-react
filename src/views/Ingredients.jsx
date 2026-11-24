import { useState } from 'react';
import { api, INGREDIENT_CATEGORIES, DIETARY_ATTRIBUTES, UNITS, title } from '../api.js';
import { Chips, Field, PencilIcon, Page, Select, TrashIcon, num, useAsync, useSet, useUI } from '../ui.jsx';
import ListToolbar from '../ListToolbar.jsx';
import { MacroPills, NutriTiles, fmt } from '../nutrition.jsx';

export function Editor({ existing, close, onSaved, initialName = '' }) {
  const { run } = useUI();
  const i = existing ?? { name: initialName, unit: 'g', size: 100, brand: '', category: 'OTHER', dietary_attributes: [], allergens: [], nutrition_facts: null };
  const algState = useAsync(() => api.allergens().catch(() => []));
  const allergens = algState.data ?? [];
  const nf = i.nutrition_facts ?? i.nutrition ?? {};
  const [f, setF] = useState({ name: i.name, brand: i.brand ?? '', unit: i.unit, size: i.size, category: i.category, kcal: nf.kcal ?? '', protein: nf.protein ?? '', carbs: nf.carbs ?? '', fat: nf.fat ?? '' });
  const [attrs, toggleAttr] = useSet(i.dietary_attributes);
  const [alg, toggleAlg] = useSet(i.allergens);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) return;
    const payload = { name: f.name.trim(), size: +f.size || 1, brand: f.brand || null, category: f.category, dietary_attributes: [...attrs], allergens: [...alg] };
    if (!existing || f.unit !== i.unit) payload.unit = f.unit; // the API refuses unit changes on ingredients already in use
    let saved;
    const ok = await run(async () => {
      const r = existing ? await api.updateIngredient(i.id, payload) : await api.createIngredient(payload);
      saved = r;
      if (f.kcal !== '') await api.setNutrition(existing ? i.id : r.id, { kcal: +f.kcal, fat: +f.fat || 0, protein: +f.protein || 0, carbs: +f.carbs || 0 });
    }, 'Saved');
    if (ok) { close(); onSaved(saved); }
  };
  return (
    <>
      <Field label="Name"><input value={f.name} onChange={set('name')} /></Field>
      <div className="field-row"><Field label="Brand"><input value={f.brand} onChange={set('brand')} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set('category')} options={INGREDIENT_CATEGORIES.map(c => [c, title(c)])} /></Field></div>
      <div className="field-row"><Field label="Pack size"><input type="number" min="0" step="any" value={f.size} onChange={set('size')} /></Field>
        <Field label="Unit"><Select value={f.unit} onChange={set('unit')} options={[...new Set([...UNITS, i.unit])]} /></Field></div>
      <label>Dietary attributes</label><Chips options={DIETARY_ATTRIBUTES.map(a => [a, title(a)])} selected={attrs} onToggle={toggleAttr} />
      {allergens.length > 0 && <><label>Allergens</label><Chips options={allergens.map(a => [a.code, a.name])} selected={alg} onToggle={toggleAlg} /></>}
      <label>Nutrition per pack (optional)</label>
      <div className="field-row">{[['kcal', 'kcal'], ['protein', 'Protein g'], ['carbs', 'Carbs g'], ['fat', 'Fat g']].map(([k, l]) => <Field key={k} label={l}><input type="number" step="any" value={f[k]} onChange={set(k)} /></Field>)}</div>
      <div className="row" style={{ marginTop: 16 }}><button className="btn" onClick={save}>Save</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </>
  );
}

const CAT = {
  MEAT: ['🥩', '#c2410c'], SEAFOOD: ['🐟', '#0369a1'], DAIRY: ['🧀', '#ca8a04'], EGGS: ['🥚', '#d97706'], VEGETABLE: ['🥦', '#1f9d4a'],
  FRUIT: ['🍎', '#dc2626'], BREAD_BAKERY: ['🍞', 'var(--n-carbs)'], PASTA: ['🍝', '#eab308'], RICE_GRAINS: ['🍚', '#78716c'], CEREAL: ['🥣', '#c2410c'],
  BEANS_LEGUMES: ['🫘', '#92400e'], PLANT_PROTEIN: ['🌱', '#15803d'], NUT_SEED: ['🥜', '#a16207'], HERB_SPICE: ['🌿', '#0f766e'], OIL_FAT: ['🫒', '#65a30d'],
  SAUCE: ['🥫', '#be123c'], CONDIMENT: ['🧂', '#4f46e5'], BAKING_COOKING: ['🧁', '#a21cae'], SWEETS_SNACKS: ['🍫', '#9d174d'], BEVERAGE: ['🥤', '#0891b2'], OTHER: ['🍽️', '#667069'],
};
const catOf = c => CAT[c] ?? CAT.OTHER;
const DIET_ICON = { VEGETARIAN: '🥕', VEGAN: '🌱', PESCATARIAN: '🐠', KETO: '🥑', PALEO: '🍖', LOW_CARB: '📉', GLUTEN_FREE: '🌾', DAIRY_FREE: '🥛', HALAL: '☪️', KOSHER: '✡️' };
// Known nutrient labels/units/colours; any other numeric field the API returns is shown too.
const NUTRIENTS = [
  ['kcal', 'Energy', 'kcal', 'var(--nv-kcal)'], ['protein', 'Protein', 'g', 'var(--nv-protein)'], ['carbs', 'Carbohydrate', 'g', 'var(--nv-carbs)'], ['fat', 'Fat', 'g', 'var(--nv-fat)'],
  ['saturated_fat', 'Saturated fat', 'g', '#db2777'], ['sugar', 'Sugars', 'g', '#ea580c'], ['fibre', 'Fibre', 'g', '#15803d'], ['fiber', 'Fibre', 'g', '#15803d'],
  ['salt', 'Salt', 'g', '#6b7280'], ['sodium', 'Sodium', 'mg', '#6b7280'], ['cholesterol', 'Cholesterol', 'mg', '#7c3aed'],
];
const nutrientRows = nf => {
  const known = new Set(NUTRIENTS.map(n => n[0]));
  const extra = Object.keys(nf).filter(k => !known.has(k) && typeof nf[k] === 'number' && !/^(id|.*_id|.*version)$/.test(k))
    .map(k => [k, title(k.replace(/_/g, ' ')), /^(mg|sodium)/.test(k) ? 'mg' : 'g', '#6b7280']);
  return [...NUTRIENTS, ...extra].filter(([k]) => nf[k] != null && !Number.isNaN(+nf[k]));
};
const factsOf = x => x.nutrition_facts ?? x.nutrition ?? null;

export function Detail({ x, src, close, onEdit }) {
  const [per, setPer] = useState('pack');
  const [, color] = catOf(x.category);
  const nf = factsOf(x);
  const canPer100 = ['g', 'ml'].includes((x.unit ?? '').toLowerCase()) && +x.size > 0;
  const f = per === 'per100' && canPer100 ? 100 / +x.size : 1;
  const rows = nf ? nutrientRows(nf) : [];
  const energy = nf ? +nf.kcal * f : 0;
  const macroKcal = nf ? { protein: nf.protein * 4, carbs: nf.carbs * 4, fat: nf.fat * 9 } : null;
  const mTotal = macroKcal ? macroKcal.protein + macroKcal.carbs + macroKcal.fat : 0;
  return (
    <>
      <div className="ing-hero" style={{ '--c': color }}>
        <span className="ing-emoji">{catOf(x.category)[0]}</span>
        <div><h3>{x.name}</h3><div className="muted">{x.brand ? `${x.brand} · ` : ''}{title(x.category)} · {num(x.size)} {x.unit} pack</div></div>
      </div>
      {(x.dietary_attributes ?? []).length > 0 && <div style={{ marginTop: 10 }}>{x.dietary_attributes.map(a => <span key={a} className="chip">{DIET_ICON[a] ?? '✔'} {title(a)}</span>)}</div>}
      {(x.allergens ?? []).length > 0 && <div style={{ marginTop: 6 }}>{x.allergens.map(a => <span key={a.code ?? a} className="chip warn">⚠️ {title(a.name ?? a.code ?? a)}</span>)}</div>}
      <h3 style={{ marginTop: 18, fontSize: 16 }}>🔬 Nutrition facts</h3>
      {!nf ? <p className="muted">No nutrition data recorded for this ingredient.</p> : <>
        <div className="tabs" style={{ margin: '10px 0' }}>
          <button className={per === 'pack' ? 'on' : ''} onClick={() => setPer('pack')}>Per pack ({num(x.size)} {x.unit})</button>
          {canPer100 && <button className={per === 'per100' ? 'on' : ''} onClick={() => setPer('per100')}>Per 100 {x.unit}</button>}
        </div>
        <NutriTiles n={{ kcal: energy, protein: nf.protein * f, carbs: nf.carbs * f, fat: nf.fat * f }} />
        {mTotal > 0 && <>
          <div className="msplit" title="Share of calories">{['protein', 'carbs', 'fat'].map(k => <i key={k} style={{ width: `${macroKcal[k] / mTotal * 100}%`, background: `var(--nv-${k})` }} />)}</div>
          <div className="muted small mlegend">Calories from {[['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(([k, l]) => <span key={k}><i className="dot" style={{ background: `var(--nv-${k})` }} /><b style={{ color: `var(--n-${k})` }}>{l} {Math.round(macroKcal[k] / mTotal * 100)}%</b></span>)}</div></>}
        <table className="facts"><tbody>{rows.map(([k, l, u, c]) => (
          <tr key={k}><td><i className="dot" style={{ background: c }} />{l}</td><td style={{ textAlign: 'right' }}><b>{fmt(nf[k] * f)}</b> {u}</td></tr>
        ))}</tbody></table>
      </>}
      <div className="row" style={{ marginTop: 16 }}>
        {src === 'ACCOUNT' && <button className="btn" onClick={() => { close(); onEdit(x); }}>Edit</button>}
        <button className="btn ghost" onClick={close}>Close</button>
      </div>
    </>
  );
}

export default function Ingredients() {
  const { openModal, run, confirm } = useUI();
  const [src, setSrc] = useState('ACCOUNT');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('ALL');
  const [diets, toggleDiet, clearDiets] = useSet([]);
  const [noAlg, toggleNoAlg, clearNoAlg] = useSet([]);
  const [onlyFacts, setOnlyFacts] = useState(false);
  const [sort, setSort] = useState('name');
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('ingredients.view') === 'list' ? 'list' : 'cards'; } catch { return 'cards'; } });
  const setView = v => { setViewState(v); try { localStorage.setItem('ingredients.view', v); } catch { /* ignore */ } };
  const algState = useAsync(() => api.allergens().catch(() => []));
  const state = useAsync(() => (src === 'ACCOUNT' ? api.ingredients() : api.catalogIngredients()), [src]);
  const edit = x => openModal(x ? 'Edit ingredient' : 'New ingredient', close => <Editor existing={x} close={close} onSaved={state.reload} />);
  const show = x => openModal(x.name, close => <Detail x={x} src={src} close={close} onEdit={edit} />);
  const del = async x => { if (await confirm(`Delete "${x.name}"?`) && await run(() => api.deleteIngredient(x.id), 'Deleted')) state.reload(); };

  const all = state.data ?? [];
  const catCounts = all.reduce((m, x) => ({ ...m, [x.category]: (m[x.category] ?? 0) + 1 }), {});
  const algCode = a => a.code ?? a;
  const q = query.trim().toLowerCase();
  const rows = all.filter(x => (!q || x.name.toLowerCase().includes(q) || (x.brand ?? '').toLowerCase().includes(q))
    && (cat === 'ALL' || x.category === cat)
    && [...diets].every(d => (x.dietary_attributes ?? []).includes(d))
    && [...noAlg].every(a => !(x.allergens ?? []).some(y => algCode(y) === a))
    && (!onlyFacts || factsOf(x)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (+(factsOf(b)?.[sort] ?? -1)) - (+(factsOf(a)?.[sort] ?? -1)));
  const maxKcal = Math.max(1, ...rows.map(x => +(factsOf(x)?.kcal ?? 0)));
  const filtered = cat !== 'ALL' || diets.size || noAlg.size || onlyFacts || q;
  const reset = () => { setCat('ALL'); clearDiets(); clearNoAlg(); setOnlyFacts(false); setQuery(''); };
  const actions = x => src === 'ACCOUNT' && <>
    <button className="icon-btn" title="Edit" aria-label="Edit" onClick={e => { e.stopPropagation(); edit(x); }}><PencilIcon /></button>{' '}
    <button className="icon-btn danger" title="Delete" aria-label="Delete" onClick={e => { e.stopPropagation(); del(x); }}><TrashIcon /></button></>;

  return (
    <Page title="" state={state}>
      <ListToolbar
        title="🛒 Ingredients"
        actions={<>
          <div className="seg srctoggle" role="group" aria-label="Ingredient source">{[['ACCOUNT', '🧺 Mine'], ['CATALOG', '📚 Catalog']].map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => { if (src !== k) { setSrc(k); reset(); } }}>{l}</button>)}</div>
          <button className="round-btn add" title="New ingredient" aria-label="New ingredient" onClick={() => edit(null)}>+</button></>}
        query={query} onQuery={setQuery} placeholder="Search name or brand…"
        sort={{ value: sort, onChange: setSort, options: [['name', 'Sort: A–Z'], ['kcal', 'Sort: Calories ↓'], ['protein', 'Sort: Protein ↓'], ['carbs', 'Sort: Carbs ↓'], ['fat', 'Sort: Fat ↓']] }}
        view={{ value: view, onChange: setView }}
        cats={INGREDIENT_CATEGORIES.filter(c => catCounts[c]).map(c => ({ key: c, label: title(c), emoji: catOf(c)[0], color: catOf(c)[1], count: catCounts[c] }))} cat={cat} onCat={setCat} total={all.length}
        groups={[
          { label: 'Dietary', options: DIETARY_ATTRIBUTES.map(a => [a, `${DIET_ICON[a] ?? ''} ${title(a)}`]), selected: diets, onToggle: toggleDiet, multi: true },
          ...((algState.data ?? []).length > 0 ? [{ label: 'Must not contain', options: algState.data.map(a => [a.code, `🚫 ${a.name}`]), selected: noAlg, onToggle: toggleNoAlg, multi: true }] : []),
        ]}
        toggle={{ label: 'Only items with nutrition facts', checked: onlyFacts, onChange: setOnlyFacts }}
        filtered={filtered} onClear={reset} />
      {rows.length === 0 ? <div className="card" style={{ textAlign: 'center', marginTop: 14 }}><div style={{ fontSize: 40 }}>🫙</div><p className="muted">No ingredients match.</p></div>
        : view === 'cards' ? (
          <div className="grid cols-3" style={{ marginTop: 14 }}>{rows.map(x => {
            const nf = factsOf(x), [emoji, color] = catOf(x.category);
            return (
              <div key={x.id} className="card ing-card" style={{ '--c': color }} onClick={() => show(x)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && show(x)}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span className="ing-emoji">{emoji}</span><div className="no-print">{actions(x)}</div>
                </div>
                <h3 style={{ fontSize: 16, marginTop: 8 }}>{x.name}</h3>
                <div className="muted">{x.brand ? `${x.brand} · ` : ''}{num(x.size)} {x.unit}</div>
                <span className="catpill">{title(x.category)}</span>
                {nf ? <div className="npills" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                  <div className="np kcal" style={{ background: 'var(--n-kcal-bg)', color: 'var(--n-kcal)' }}><b>{fmt(nf.kcal)}</b><span>kcal</span></div>
                  {[['protein', 'P'], ['carbs', 'C'], ['fat', 'F']].map(([k, l]) => <div key={k} className={`np ${k}`}><b>{fmt(nf[k])}</b><span>{l}</span></div>)}
                </div> : <div className="muted" style={{ marginTop: 10 }}>No nutrition data</div>}
                <div style={{ marginTop: 8 }}>{(x.dietary_attributes ?? []).slice(0, 4).map(a => <span key={a} className="chip" title={title(a)}>{DIET_ICON[a] ?? ''} {title(a)}</span>)}
                  {(x.allergens ?? []).length > 0 && <span className="chip warn">⚠️ {x.allergens.length}</span>}</div>
              </div>
            );
          })}</div>
        ) : (
          <div className="recipe-list" style={{ marginTop: 14 }}>{rows.map(x => {
            const nf = factsOf(x), [emoji, color] = catOf(x.category);
            const mk = nf ? { protein: nf.protein * 4, carbs: nf.carbs * 4, fat: nf.fat * 9 } : null, mt = mk ? mk.protein + mk.carbs + mk.fat : 0;
            const per100 = nf && ['g', 'ml'].includes((x.unit ?? '').toLowerCase()) && +x.size > 0 ? nf.kcal * 100 / x.size : null;
            return (
              <div key={x.id} className="card recipe-row ing-row" style={{ '--c': color }} tabIndex={0} role="button" onClick={() => show(x)} onKeyDown={e => { if (e.key === 'Enter') show(x); }}>
                <div className="rthumb ph ing-tile">{emoji}</div>
                <div className="rmain">
                  <h3>{x.name}{x.brand && <span className="rbrand"> · {x.brand}</span>}</h3>
                  <div className="rmeta">
                    <span className="catdot" style={{ background: color }} />{title(x.category)} · {num(x.size)} {x.unit} pack
                    {(x.dietary_attributes ?? []).slice(0, 3).map(a => <span key={a} className="tag sm">{DIET_ICON[a] ?? ''} {title(a)}</span>)}
                    {(x.dietary_attributes ?? []).length > 3 && <span className="tag sm">+{x.dietary_attributes.length - 3}</span>}
                    {(x.allergens ?? []).length > 0 && <span className="tag sm warn" title={x.allergens.map(a => a.name ?? a.code ?? a).join(', ')}>⚠️ {x.allergens.map(a => title(a.name ?? a.code ?? a)).slice(0, 2).join(', ')}{x.allergens.length > 2 ? ` +${x.allergens.length - 2}` : ''}</span>}
                  </div>
                  {mt > 0 && <div className="msplit slim" title="Share of calories: protein / carbs / fat">{['protein', 'carbs', 'fat'].map(k => <i key={k} style={{ width: `${mk[k] / mt * 100}%`, background: `var(--nv-${k})` }} />)}</div>}
                </div>
                <div className="rmacros">{nf ? <MacroPills n={nf} /> : <span className="muted">No nutrition data</span>}</div>
                {nf && <div className="rkcal"><b>{fmt(nf.kcal)}</b><span>kcal / pack</span>{per100 != null && <span className="per100">{fmt(per100)} per 100{x.unit}</span>}</div>}
                <div className="no-print ract">{actions(x)}</div>
                <span className="chev">›</span>
              </div>
            );
          })}</div>
        )}
    </Page>
  );
}
