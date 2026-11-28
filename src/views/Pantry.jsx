import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, INGREDIENT_CATEGORIES, title, recipeImage } from '../api.js';
import RecipeView from '../RecipeView.jsx';
import { AddToPlan } from './Recipes.jsx';
import { suggest } from '../stats.js';
import { loadIngredients } from '../lookup.js';
import { Detail, Editor } from './Ingredients.jsx';
import ListToolbar from '../ListToolbar.jsx';
import { Field, Loader, Page, Select, TrashIcon, num, useAsync, useUI } from '../ui.jsx';

export const CAT = {
  MEAT: ['🥩', '#c2410c'], SEAFOOD: ['🐟', '#0369a1'], DAIRY: ['🧀', '#ca8a04'], EGGS: ['🥚', '#d97706'],
  VEGETABLE: ['🥦', '#16a34a'], FRUIT: ['🍎', '#dc2626'], BREAD_BAKERY: ['🍞', '#b45309'], PASTA: ['🍝', '#e0a100'],
  RICE_GRAINS: ['🍚', '#78716c'], CEREAL: ['🥣', '#d97706'], BEANS_LEGUMES: ['🫘', '#92400e'], PLANT_PROTEIN: ['🌱', '#15803d'],
  NUT_SEED: ['🥜', '#a16207'], HERB_SPICE: ['🌿', '#059669'], OIL_FAT: ['🫒', '#65a30d'], SAUCE: ['🍅', '#e11d48'],
  CONDIMENT: ['🧂', '#7c3aed'], BAKING_COOKING: ['🧁', '#c026d3'], SWEETS_SNACKS: ['🍫', '#9d174d'], BEVERAGE: ['🥤', '#0891b2'], OTHER: ['🛒', '#4f46e5'],
};
export const catMeta = c => CAT[c] ?? CAT.OTHER;

function StockEditor({ it, onSet }) {
  const [v, setV] = useState(String(num(it.qty)));
  useEffect(() => setV(String(num(it.qty))), [it.qty]);
  const commit = () => { const n = parseFloat(v); if (Number.isNaN(n) || n < 0) return setV(String(num(it.qty))); if (n !== +it.qty) onSet(it, n); };
  return <input className="stock-input" type="number" min="0" step="any" value={v} aria-label="In stock"
    onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} />;
}

function NewPantry({ close, onDone }) {
  const { run } = useUI(); const [name, setName] = useState('Kitchen');
  return (<><Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
    <button className="btn" style={{ marginTop: 12 }} onClick={async () => { const r = await run(() => api.createPantry(name.trim())); if (r) { close(); onDone(r.id); } }}>Create</button></>);
}

function AddItem({ pantry, ing, close, onDone }) {
  const { run } = useUI();
  const [q, setQ] = useState('');
  const options = ing.list.filter(i => i.name.toLowerCase().includes(q)).slice(0, 200).map(i => [`${i.source}:${i.id}`, `${i.name} (${i.unit})${i.source === 'CATALOG' ? ' · catalog' : ''}`]);
  const [sel, setSel] = useState(''); const [qty, setQty] = useState(1);
  const cur = options.find(o => o[0] === sel)?.[0] ?? options[0]?.[0] ?? '';
  return (<>
    <Field label="Search"><input placeholder="Filter ingredients…" value={q} onChange={e => setQ(e.target.value.toLowerCase())} /></Field>
    <Field label="Ingredient"><Select value={cur} onChange={e => setSel(e.target.value)} options={options.length ? options : [['', 'No matches']]} /></Field>
    <Field label="Quantity"><input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} /></Field>
    <button className="btn" disabled={!cur} style={{ marginTop: 12 }} onClick={async () => { const [s, ...id] = cur.split(':'); if (await run(() => api.addPantryItem(pantry.id, s, id.join(':'), +qty))) { close(); onDone(); } }}>Add</button></>);
}


function Suggestions({ items, ing, close }) {
  const { openModal } = useUI();
  const state = useAsync(async () => {
    const [mine, cat, prefs] = await Promise.all([api.recipes(), api.catalogRecipes().then(r => r, () => null), api.dietaryPrefs().catch(() => null)]);
    return { mine, cat, prefs };
  });
  const head = <div className="row between"><h2>🍳 Meal suggestions</h2><button className="btn ghost sm" onClick={close}>Close</button></div>;
  if (state.loading) return <div className="sheet-body">{head}<Loader label="Finding meals…" /></div>;
  if (state.error) return <div className="sheet-body">{head}<p>Couldn't load recipes: {state.error.message}</p><button className="btn" onClick={state.reload}>Retry</button></div>;
  const { mine, cat, prefs } = state.data;
  const dietIds = prefs?.diet_tag_ids ?? []; const avoid = new Set(prefs?.allergen_codes ?? []);
  const fits = r => dietIds.every(id => (r.diet_tags ?? []).some(t => t.id === id)) && !(r.allergens ?? []).some(a => avoid.has(a.code ?? a));
  const tagged = [...mine.map(r => ({ ...r, _src: 'ACCOUNT' })), ...(cat ?? []).map(r => ({ ...r, _src: 'CATALOG' }))].filter(fits);
  const res = suggest(tagged, items);
  const open = async s => {
    const r = s.r, full = await (r._src === 'ACCOUNT' ? api.recipe(r.id) : api.catalogRecipe(r.id)).catch(() => r);
    openModal(full.name, c => <RecipeView r={full} close={c}
      top={<button className="btn big" style={{ width: '100%', marginTop: 14 }} onClick={() => openModal('Add to meal plan', c2 => <AddToPlan r={full} source={r._src} close={c2} />)}>Add to Meal Plan</button>} />, { sheet: true });
  };
  const Group = ({ g, label }) => { const list = res.filter(s => s.group === g); return list.length ? (<>
    <h3 style={{ margin: '16px 0 8px', fontSize: 15 }}>{label}</h3>
    {list.map(s => (
      <div key={`${s.r._src}:${s.r.id}`} className="card sug" role="button" tabIndex={0} onClick={() => open(s)} onKeyDown={e => { if (e.key === 'Enter') open(s); }}>
        {recipeImage(s.r) ? <img className="rthumb" src={recipeImage(s.r)} alt="" loading="lazy" /> : <div className="rthumb ph">🍽</div>}
        <div className="grow"><b>{s.r.name}</b>{s._src === 'CATALOG' && <span className="tag sm">Catalog</span>}
          <div className="muted">{title(s.r.category)}</div>
          {s.missing.length > 0 && <div className="muted" style={{ color: 'var(--danger)' }}>Missing: {s.missing.join(', ')}</div>}</div>
        <span className="chev">›</span>
      </div>))}</>) : null; };
  return (<div className="sheet-body">
    {head}
    <p className="muted">Recipes you can cook from what's in stock.</p>
    {cat === null && <p className="muted">Catalog recipes couldn't be loaded — showing your own. <a href="#" onClick={e => { e.preventDefault(); state.reload(); }}>Retry</a></p>}
    {res.length === 0 ? <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing to suggest yet. Add pantry stock or recipes and suggestions will show up here.</p></div> : <>
      <Group g="ready" label="Ready to cook" /><Group g="near" label="Missing 1–2 ingredients" /></>}
  </div>);
}

export default function Pantry() {
  const { run, openModal, confirm } = useUI();
  const [selected, setSelected] = useState(null);
  const [cat, setCat] = useState('ALL');
  const [query, setQuery] = useState('');
  const lists = useAsync(async () => ({ pantries: await api.pantries(), ing: await loadIngredients() }));
  const { pantries = [], ing } = lists.data ?? {};
  useEffect(() => { if (lists.data && !pantries.find(p => p.id === selected)) setSelected(pantries[0]?.id ?? null); }, [lists.data, selected]); // eslint-disable-line
  const detail = useAsync(() => (selected ? api.pantry(selected) : Promise.resolve(null)), [selected]);
  const pantry = detail.data;
  const items = (pantry?.items ?? []).map(it => {
    const src = it.ingredient_source ?? 'ACCOUNT'; const id = src === 'CATALOG' ? it.catalog_ingredient_id : it.ingredient_id;
    return { ...it, src, id, qty: it.in_pantry ?? it.quantity, info: ing?.get(src, id) };
  }).sort((a, b) => (a.info?.name ?? '').localeCompare(b.info?.name ?? ''));
  const q = query.trim().toLowerCase();
  const found = items.filter(it => !q || (it.info?.name ?? '').toLowerCase().includes(q));
  const byCat = c => found.filter(it => (INGREDIENT_CATEGORIES.includes(it.info?.category) ? it.info.category : 'OTHER') === c);
  const visibleCats = cat === 'ALL' ? INGREDIENT_CATEGORIES.filter(c => byCat(c).length) : [cat];
  const [params, setParams] = useSearchParams(); const autoOpened = useRef(false);
  useEffect(() => { // deep link from the Home shortcut: /pantry?suggestions=1
    if (!params.get('suggestions') || autoOpened.current || !pantry || !ing) return;
    autoOpened.current = true; setParams({}, { replace: true });
    openModal('Meal suggestions', close => <Suggestions items={pantry.items ?? []} ing={ing} close={close} />, { sheet: true });
  }, [params, pantry, ing]); // eslint-disable-line
  const setStock = async (it, n) => { const d = n - it.qty; if (!d) return; const fn = d < 0 ? api.reducePantryItem : api.addPantryItem; if (await run(() => fn(pantry.id, it.src, it.id, Math.abs(d)))) detail.reload(); };
  const showCard = it => { if (!it.info) return;
    const edit = x => openModal('Edit ingredient', close => <Editor existing={x} close={close} onSaved={() => { lists.reload(); detail.reload(); }} />);
    openModal(it.info.name, close => <Detail x={it.info} src={it.src} close={close} onEdit={edit} />); };
  const step = async (it, d) => { const fn = d < 0 ? api.reducePantryItem : api.addPantryItem; if (await run(() => fn(pantry.id, it.src, it.id, Math.abs(d)))) detail.reload(); };

  const actions = (<>
    {pantries.length > 0 && <Select style={{ width: 'auto' }} value={selected ?? ''} onChange={e => { setSelected(e.target.value); setCat('ALL'); setQuery(''); }} options={pantries.map(p => [p.id, p.name])} />}
    <details className="menu no-print">
      <summary className="round-btn" aria-label="Pantry options" data-tour="pantry-more">⋯</summary>
      <div className="menu-backdrop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')} />
      <div className="menu-pop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')}>
        <button onClick={() => openModal('New pantry', close => <NewPantry close={close} onDone={id => { setSelected(id); lists.reload(); }} />)}>➕ New pantry</button>
        {pantry && <button onClick={() => openModal('Meal suggestions', close => <Suggestions items={pantry.items ?? []} ing={ing} close={close} />, { sheet: true })}>🍳 Meal suggestions</button>}
        {pantry && <button className="danger" onClick={async () => { if (await confirm(`Delete pantry "${pantry.name}"?`) && await run(() => api.deletePantry(pantry.id), 'Deleted')) { setSelected(null); lists.reload(); } }}>🗑️ Delete pantry</button>}
      </div>
    </details>
    {pantry && <button className="round-btn add" data-tour="pantry-add" title="Add item" aria-label="Add item" onClick={() => openModal('Add to pantry', close => <AddItem pantry={pantry} ing={ing} close={close} onDone={detail.reload} />)}>+</button>}
  </>);
  return (
    <Page title="Pantry" fill actions={actions} state={[lists, detail]} busy={!selected && pantries.length > 0}>
      {!selected ? <div className="card"><p>No pantry yet — create one to track what you have at home.</p></div> : !pantry ? (detail.error ? <div className="card"><p>Couldn't load pantry: {detail.error.message}</p></div> : null) : (<>
        <ListToolbar
          query={query} onQuery={setQuery} placeholder="Search pantry…"
          cats={INGREDIENT_CATEGORIES.filter(c => byCat(c).length || cat === c).map(c => ({ key: c, label: title(c), emoji: catMeta(c)[0], color: catMeta(c)[1], count: byCat(c).length }))} cat={cat} onCat={setCat} total={found.length}
          filtered={cat !== 'ALL' || !!q} onClear={() => { setCat('ALL'); setQuery(''); }} />
        <div className="pscroll">
        {visibleCats.map(c => { const [e, col] = catMeta(c); const list = byCat(c); return (
          <section key={c} className="psec" style={{ '--c': col }}>
            <h2 className="psec-h"><span>{e}</span>{title(c)}<em>{list.length}</em></h2>
            {list.length > 0 && <div className="pgrid">{list.map(it => { const s = it.info?.size || 1; const out = +it.qty <= 0; return (
              <div key={`${it.src}:${it.id}`} className={`pcard${out ? ' out' : ''}`} onClick={() => showCard(it)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) showCard(it); }}>
                <button className="icon-btn danger pdel" title="Remove" aria-label="Remove" onClick={async e => { e.stopPropagation(); if (await run(() => api.removePantryItem(pantry.id, it.src, it.id))) detail.reload(); }}><TrashIcon /></button>
                <div className="pemoji">{e}</div>
                <div className="pname" title={it.info?.name ?? it.id}>{it.info?.name ?? it.id}</div>
                <div className="pstock" data-tour="pantry-stock" onClick={e => e.stopPropagation()}>
                  <button onClick={() => step(it, -s)} aria-label="Decrease">−</button>
                  <StockEditor it={it} onSet={setStock} /><span className="punit">{it.info?.unit ?? ''}</span>
                  <button onClick={() => step(it, s)} aria-label="Increase">+</button>
                </div>
                <div className="pbadge" style={{ visibility: out ? 'visible' : 'hidden' }}>Out of stock</div>
              </div>); })}</div>}
          </section>); })}
        </div>
      </>)}
    </Page>
  );
}
