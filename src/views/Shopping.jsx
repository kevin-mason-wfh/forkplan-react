import { useEffect, useState } from 'react';
import { api, title, ref, INGREDIENT_CATEGORIES, UNITS } from '../api.js';
import { loadIngredients } from '../lookup.js';
import { Field, Page, PencilIcon, SearchPick, Select, TrashIcon, num, useAsync, useUI } from '../ui.jsx';
import { catMeta } from './Pantry.jsx';

const brandOf = (it, ing) => {
  if (it.brand) return it.brand;
  const id = it.ingredient_source === 'CATALOG' ? it.catalog_ingredient_id : it.ingredient_id;
  return (id && ing?.get(it.ingredient_source ?? 'ACCOUNT', id)?.brand) || '';
};
const qty = i => i.purchase_quantity ?? i.quantity ?? i.required_quantity ?? 0;

function Generate({ close, onDone }) {
  const { run, toast } = useUI();
  const { data } = useAsync(async () => ({ plans: await api.mealPlans(), pantries: await api.pantries().catch(() => []) }));
  const [plan, setPlan] = useState(''); const [pan, setPan] = useState(''); const [skipOwned, setSkipOwned] = useState(true);
  if (!data) return <p className="muted">Loading…</p>;
  if (!data.plans.length) return <p>Create a meal plan first.</p>;
  const planId = plan || data.plans[0].id;
  const pantryId = skipOwned ? pan || data.pantries[0]?.id || '' : '';
  return (<>
    <Field label="Meal plan"><Select value={planId} onChange={e => setPlan(e.target.value)} options={data.plans.map(p => [p.id, p.name])} /></Field>
    {data.pantries.length > 0 && <label className="opt-check"><input type="checkbox" checked={skipOwned} onChange={e => setSkipOwned(e.target.checked)} /><span>Leave out food I already have<small>Uses what's in your pantry</small></span></label>}
    {skipOwned && data.pantries.length > 1 && <Field label="Which pantry?"><Select value={pantryId} onChange={e => setPan(e.target.value)} options={data.pantries.map(p => [p.id, p.name])} /></Field>}
    <button className="btn" style={{ marginTop: 12 }} onClick={async () => { const r = await run(() => api.generateShopping(planId, pantryId), 'Shopping list made'); if (r) { close(); onDone((r.shopping_list ?? r).id); } }}>Make list</button>
  </>);
}

function AddItem({ listId, ing, close, onDone }) {
  const { run } = useUI();
  const [mode, setMode] = useState('existing');
  const [sel, setSel] = useState(''); const [q, setQ] = useState(1);
  const [n, setN] = useState({ name: '', brand: '', category: 'OTHER', unit: 'each', size: 1 });
  const setNew = k => e => setN(s => ({ ...s, [k]: e.target.value }));
  const items = ing.list.map(i => ({ key: `${i.source}:${i.id}`, label: `${i.name}${i.brand ? ` – ${i.brand}` : ''} (${i.unit})` }));
  const add = async () => {
    if (mode === 'existing') {
      if (!sel) return;
      const [s, ...id] = sel.split(':'); const i = ing.get(s, id.join(':'));
      if (await run(() => api.addShoppingItem(listId, { ...ref(s, id.join(':')), display_name: i?.name ?? '', unit: i?.unit ?? 'each', purchase_quantity: +q }))) { close(); onDone(); }
      return;
    }
    if (!n.name.trim()) return;
    const ok = await run(async () => {
      const r = await api.createIngredient({ name: n.name.trim(), brand: n.brand.trim() || null, category: n.category, unit: n.unit, size: +n.size || 1, dietary_attributes: [], allergens: [] });
      await api.addShoppingItem(listId, { ...ref('ACCOUNT', r.id), display_name: n.name.trim(), unit: n.unit, purchase_quantity: +q });
    }, 'Ingredient created and added');
    if (ok) { close(); onDone(); }
  };
  return (<>
    <div className="seg" style={{ marginTop: 0 }}>
      <button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>Existing ingredient</button>
      <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>✨ New ingredient</button>
    </div>
    {mode === 'existing'
      ? <Field label="Ingredient"><SearchPick autoFocus items={items} value={sel} onChange={setSel} placeholder="Type to search, e.g. milk" /></Field>
      : <>
        <Field label="Name"><input autoFocus placeholder="e.g. Sourdough loaf" value={n.name} onChange={setNew('name')} /></Field>
        <div className="field-row"><Field label="Brand (optional)"><input value={n.brand} onChange={setNew('brand')} /></Field>
          <Field label="Category"><Select value={n.category} onChange={setNew('category')} options={INGREDIENT_CATEGORIES.map(c => [c, title(c)])} /></Field></div>
        <div className="field-row"><Field label="Pack size"><input type="number" min="0" step="any" value={n.size} onChange={setNew('size')} /></Field>
          <Field label="Unit"><Select value={n.unit} onChange={setNew('unit')} options={UNITS} /></Field></div>
        <p className="muted">This is saved to your Ingredients so you can reuse it in recipes and pantries.</p>
      </>}
    <Field label={`Quantity to buy${mode === 'new' ? ` (${n.unit})` : ''}`}><input type="number" min="0" step="any" value={q} onChange={e => setQ(e.target.value)} /></Field>
    <button className="btn" style={{ marginTop: 12 }} onClick={add}>{mode === 'new' ? 'Create & add' : 'Add'}</button></>);
}

function EditItem({ listId, it, close, onDone }) {
  const { run } = useUI(); const [q, setQ] = useState(qty(it));
  return (<><Field label={`Quantity${it.unit ? ` (${it.unit})` : ''}`}><input type="number" min="0" step="any" value={q} onChange={e => setQ(e.target.value)} /></Field>
    <button className="btn" style={{ marginTop: 12 }} onClick={async () => { if (await run(() => api.updateShoppingItem(listId, it.item_id, { purchase_quantity: +q }))) { close(); onDone(); } }}>Save</button></>);
}

export default function Shopping() {
  const { run, openModal, confirm } = useUI();
  const [selected, setSelected] = useState(null);
  const [fCat, setFCat] = useState('ALL'); const [fBrand, setFBrand] = useState('ALL');
  const lists = useAsync(() => api.shoppingLists());
  useEffect(() => { if (lists.data && !lists.data.find(l => l.id === selected)) setSelected(lists.data[0]?.id ?? null); }, [lists.data, selected]);
  const detail = useAsync(async () => {
    if (!selected) return null;
    const full = await api.shoppingList(selected);
    return { full, items: full.items ?? await api.shoppingItems(selected), ing: await loadIngredients() };
  }, [selected]);
  const { full, items = [], ing } = detail.data ?? {};
  const done = items.filter(i => i.is_checked).length;
  const catOf = i => i.category ?? 'OTHER';
  const cats = [...new Set(items.map(catOf))].sort((a, b) => a.localeCompare(b));
  const brands = [...new Set(items.map(i => brandOf(i, ing)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const hasNoBrand = items.some(i => !brandOf(i, ing));
  const catOn = cats.includes(fCat) ? fCat : 'ALL'; const brandOn = brands.includes(fBrand) || (fBrand === 'NONE' && hasNoBrand) ? fBrand : 'ALL';
  const shown = items.filter(i => (catOn === 'ALL' || catOf(i) === catOn) && (brandOn === 'ALL' || (brandOn === 'NONE' ? !brandOf(i, ing) : brandOf(i, ing) === brandOn)));
  const groups = Object.entries(shown.reduce((a, i) => { (a[i.category ?? 'OTHER'] ??= []).push(i); return a; }, {})).sort(([a], [b]) => a.localeCompare(b));

  const generate = () => openModal('New shopping list', close => <Generate close={close} onDone={id => { setSelected(id); lists.reload(); }} />);
  const actions = (<>
    {lists.data?.length > 0 && <Select style={{ width: 'auto' }} value={selected ?? ''} onChange={e => setSelected(e.target.value)} options={lists.data.map(l => [l.id, l.name || `List ${l.week_start ?? l.id.slice(0, 6)}`])} />}
    <details className="menu no-print">
      <summary className="round-btn" aria-label="Shopping list options" data-tour="shop-more">⋯</summary>
      <div className="menu-backdrop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')} />
      <div className="menu-pop" onClick={e => e.currentTarget.parentElement.removeAttribute('open')}>
        <button onClick={generate}>🛒 New list from meal plan</button>
        {full && <button onClick={async () => { if (await run(() => api.regenerateShopping(full.id), 'List updated from your meal plan')) detail.reload(); }}>🔄 Update from meal plan</button>}
        {full && <button onClick={() => window.print()}>🖨️ Print</button>}
        {full && <button className="danger" onClick={async () => { if (await confirm('Delete this shopping list?') && await run(() => api.deleteShopping(full.id), 'Deleted')) { setSelected(null); lists.reload(); } }}>🗑️ Delete list</button>}
      </div>
    </details>
    {full && <button className="round-btn add" data-tour="shop-add" title="Add item" aria-label="Add item" onClick={() => openModal('Add item', close => <AddItem listId={full.id} ing={ing} close={close} onDone={detail.reload} />)}>+</button>}
  </>);
  return (
    <Page title="Shopping" fill actions={actions} state={[lists, detail]} busy={!selected && lists.data?.length > 0}>
      {!selected ? <div className="card empty-cta"><div className="empty-ic">🛒</div><p>Make a shopping list from your meal plan. Forkplan adds up every ingredient for you.</p><button className="btn" data-tour="shop-generate" onClick={generate}>Make a list from my meal plan</button></div> : !full ? null : (<>
        <div className="shop-sticky">
        <div className="card shop-hero">
          <div className="row between"><div className="shop-title"><span className="shop-ico">🛒</span><div><b>{full.name || 'Shopping list'}</b><div className="muted">{done} of {items.length} items{items.length > 0 && done === items.length ? ' · all done 🎉' : ''}</div></div></div>
          </div>
          <div className="bar shop-bar" style={{ marginTop: 14 }}><i style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
        </div>
        {items.length > 0 && <div className="shop-filters no-print">
          <div className="catbar">
            <button className={'catchip' + (catOn === 'ALL' ? ' on' : '')} style={{ '--c': 'var(--brand)' }} onClick={() => setFCat('ALL')}>🛒 All<em>{items.length}</em></button>
            {cats.map(c => { const [e, col] = catMeta(c); return <button key={c} className={'catchip' + (catOn === c ? ' on' : '')} style={{ '--c': col }} onClick={() => setFCat(c)}>{e} {title(c)}<em>{items.filter(i => catOf(i) === c).length}</em></button>; })}
          </div>
          {(brands.length > 0) && <div className="row" style={{ marginBottom: 12 }}>
            <label style={{ margin: 0 }}>🏷️ Brand</label>
            <Select style={{ width: 'auto' }} value={brandOn} onChange={e => setFBrand(e.target.value)} options={[['ALL', 'All brands'], ...brands.map(b => [b, b]), ...(hasNoBrand ? [['NONE', 'No brand']] : [])]} />
            {(catOn !== 'ALL' || brandOn !== 'ALL') && <button className="btn ghost sm" onClick={() => { setFCat('ALL'); setFBrand('ALL'); }}>Clear filters</button>}
          </div>}
        </div>}
        </div>
        <div className="pscroll">
        {shown.length === 0 && items.length > 0 && <div className="card"><p className="muted">No items match these filters.</p></div>}
        {groups.map(([c, list]) => { const [emoji, col] = catMeta(c); return (
          <div key={c} className="card shop-group" style={{ marginBottom: 12, '--c': col }}>
            <h3 className="shop-h"><span className="shop-emoji">{emoji}</span>{title(c)}<em>{list.filter(i => i.is_checked).length}/{list.length}</em></h3>
            {list.map(it => (
              <div key={it.item_id} data-tour="shop-tick" className={'check' + (it.is_checked ? ' done' : '')}>
                <input type="checkbox" checked={!!it.is_checked} onChange={async e => { if (await run(() => api.checkItem(full.id, it.item_id, e.target.checked))) detail.reload(); }} />
                <span className="n grow">{it.ingredient_name ?? 'Item'}{brandOf(it, ing) && <span className="brand-tag">{brandOf(it, ing)}</span>}</span><span className="qty-pill">{num(qty(it))} {it.unit ?? ''}</span>
                <button className="icon-btn no-print" title="Edit" aria-label="Edit" onClick={() => openModal(`Edit ${it.ingredient_name ?? 'item'}`, close => <EditItem listId={full.id} it={it} close={close} onDone={detail.reload} />)}><PencilIcon /></button>
                <button className="icon-btn trash no-print" title="Remove item" aria-label="Remove item" onClick={async () => { if (await run(() => api.deleteShoppingItem(full.id, it.item_id))) detail.reload(); }}><TrashIcon /></button>
              </div>
            ))}
          </div>
        ); })}
        </div>
      </>)}
    </Page>
  );
}
