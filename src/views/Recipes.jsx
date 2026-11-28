import { useRef, useState } from 'react';
import { api, DAYS, MEALS, title, recipeImage, ref, refId, isoDate, mondayOf, todayName } from '../api.js';
import RecipeView from '../RecipeView.jsx';
import ListToolbar from '../ListToolbar.jsx';
import { MacroPills, fmt, recipeN } from '../nutrition.jsx';
import { loadIngredients } from '../lookup.js';
import { Chips, Field, Page, Select, num, useAsync, useSet, useUI } from '../ui.jsx';

export function AddToPlan({ r, source, close }) {
  const { run } = useUI();
  const state = useAsync(() => api.mealPlans());
  const [planId, setPlanId] = useState('');
  const [day, setDay] = useState(todayName());
  const [cat, setCat] = useState(MEALS.includes(r.category) ? r.category : 'dinner');
  const [servings, setServings] = useState(1);
  const plans = state.data ?? [];
  const pid = planId || (plans.find(p => p.week_start === isoDate(mondayOf())) ?? plans[0])?.id;
  if (state.loading) return <p className="muted">Loading…</p>;
  if (!pid) return <p>Create a meal plan first.</p>;
  const add = async () => {
    const plan = await api.mealPlan(pid);
    const used = new Set(plan.planned_meals.filter(m => m.day === day && m.category === cat).map(m => m.slot));
    const slot = [0, 1, 2, 3, 4].find(k => !used.has(k));
    if (slot == null) throw new Error(`${title(day)} already has 5 ${cat} meals`);
    await api.addMeal(pid, day, cat, { id: r.id, source }, +servings || 1, slot);
  };
  return (
    <>
      <Field label="Meal plan"><Select value={pid} onChange={e => setPlanId(e.target.value)} options={plans.map(p => [p.id, `${p.name} (${p.week_start})`])} /></Field>
      <div className="field-row">
        <Field label="Day"><Select value={day} onChange={e => setDay(e.target.value)} options={DAYS.map(d => [d, title(d)])} /></Field>
        <Field label="Meal"><Select value={cat} onChange={e => setCat(e.target.value)} options={MEALS.map(m => [m, title(m)])} /></Field>
        <Field label="Servings"><input type="number" min="0.25" step="0.25" value={servings} onChange={e => setServings(e.target.value)} /></Field>
      </div>
      <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={async () => { if (await run(add, 'Added to meal plan')) close(); }}>Add to meal plan</button></div>
    </>
  );
}

function Detail({ r, source, reload, close, edit }) {
  const { run, confirm, openModal } = useUI();
  /** Save a copy of this catalog recipe (with its photo) to My recipes; returns the new id. */
  const copyToMine = async () => {
    const created = await api.createRecipe({ name: r.name, category: r.category, servings: r.servings, description: r.description, instructions: r.instructions,
      ingredients: r.ingredients.map(i => ({ ...ref(i.ingredient_source, refId(i)), quantity: i.quantity })), diet_tag_ids: (r.diet_tags ?? []).map(t => t.id) });
    const url = recipeImage(r);
    if (url && created?.id) {
      try {
        const blob = await (await fetch(url, { mode: 'cors', cache: 'no-store' })).blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        await api.uploadRecipeImage(created.id, new File([blob], `image.${ext}`, { type: blob.type || 'image/jpeg' }));
      } catch (e) { console.warn('Could not copy recipe image', e); }
    }
    return created.id;
  };
  return (
    <RecipeView r={r} close={close}
      top={<button className="btn big" style={{ width: '100%', marginTop: 14 }} onClick={() => openModal('Add to meal plan', c => <AddToPlan r={r} source={source} close={c} />)}>Add to Meal Plan</button>}
      footer={<>
        {source === 'ACCOUNT' ? (<>
          <button className="btn" onClick={() => { close(); edit(r); }}>Edit</button>
          <button className="btn ghost" onClick={async () => { if (await confirm(`Delete "${r.name}"?`) && await run(() => api.deleteRecipe(r.id), 'Deleted')) { close(); reload(); } }}>Delete</button>
        </>) : (<>
          {/* Catalog recipes are read-only: Edit saves a copy to My recipes and opens that. */}
          <button className="btn" onClick={async () => { const copy = await run(async () => api.recipe(await copyToMine()), 'Saved a copy to My recipes'); if (copy) { close(); reload('ACCOUNT'); edit(copy); } }}>Edit</button>
          <button className="btn ghost" onClick={async () => { if (await run(copyToMine, 'Copied to My recipes')) { close(); reload('ACCOUNT'); } }}>Copy to my recipes</button>
        </>)}
        <button className="btn ghost" onClick={() => window.print()}>Print</button>
      </>} />
  );
}

function Editor({ existing, close, onSaved }) {
  const { run, toast } = useUI();
  const r = existing ?? { name: '', category: 'dinner', servings: 2, description: '', instructions: '', ingredients: [], diet_tags: [] };
  const { data } = useAsync(async () => ({ ing: await loadIngredients(), tags: await api.dietTags().catch(() => []) }));
  const [name, setName] = useState(r.name);
  const [category, setCategory] = useState(r.category);
  const [servings, setServings] = useState(r.servings);
  const [desc, setDesc] = useState(r.description ?? '');
  const [instr, setInstr] = useState(r.instructions ?? '');
  const [rows, setRows] = useState(r.ingredients.map(i => ({ source: i.ingredient_source, id: refId(i), quantity: i.quantity })));
  const [tagIds, toggleTag] = useSet((r.diet_tags ?? []).map(t => t.id));
  const file = useRef();
  if (!data) return <p className="muted">Loading…</p>;
  const { ing, tags } = data;
  const options = ing.list.map(i => [`${i.source}:${i.id}`, `${i.name} (${i.unit})${i.source === 'CATALOG' ? ' · catalog' : ''}`]);
  const upd = (idx, patch) => setRows(rs => rs.map((x, k) => (k === idx ? { ...x, ...patch } : x)));

  const save = async () => {
    if (!name.trim()) return toast('Name is required', true);
    const payload = { name: name.trim(), category, servings: +servings || 1, description: desc || null, instructions: instr || null };
    const ok = await run(async () => {
      let id = existing?.id;
      const ingredients = rows.filter(x => x.id && x.quantity > 0).map(x => ({ ...ref(x.source, x.id), quantity: x.quantity }));
      if (!existing) { const c = await api.createRecipe({ ...payload, ingredients, diet_tag_ids: [...tagIds] }); id = c.id; }
      else {
        await api.updateRecipe(id, payload);
        const after = new Set(rows.map(x => `${x.source}:${x.id}`));
        for (const i of r.ingredients) if (!after.has(`${i.ingredient_source}:${refId(i)}`)) await api.removeRecipeIngredient(id, refId(i), i.ingredient_source);
        for (const x of rows) await api.setRecipeIngredient(id, x.id, x.quantity, x.source);
        const old = new Set((r.diet_tags ?? []).map(t => t.id));
        for (const t of tagIds) if (!old.has(t)) await api.assignTag(id, t);
        for (const t of old) if (!tagIds.has(t)) await api.removeTag(id, t);
      }
      if (file.current?.files[0]) await api.uploadRecipeImage(id, file.current.files[0]);
    }, 'Saved');
    if (ok) { close(); onSaved(); }
  };

  return (
    <>
      <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} /></Field>
      <div className="field-row">
        <Field label="Category"><Select value={category} onChange={e => setCategory(e.target.value)} options={[...new Set([...MEALS, r.category])]} /></Field>
        <Field label="Servings"><input type="number" min="1" value={servings} onChange={e => setServings(e.target.value)} /></Field>
      </div>
      <Field label="Description"><textarea value={desc} onChange={e => setDesc(e.target.value)} /></Field>
      <label>Ingredients</label>
      {rows.map((row, idx) => (
        <div key={idx} className="row" style={{ marginBottom: 6 }}>
          <Select style={{ flex: 2 }} value={`${row.source}:${row.id}`} options={options} onChange={e => { const [s, ...id] = e.target.value.split(':'); upd(idx, { source: s, id: id.join(':') }); }} />
          <input type="number" min="0" step="any" style={{ flex: 1 }} value={row.quantity} onChange={e => upd(idx, { quantity: +e.target.value })} />
          <button className="btn ghost sm" onClick={() => setRows(rs => rs.filter((_, k) => k !== idx))}>×</button>
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => { const f = ing.list[0]; if (!f) return toast('Add an ingredient first', true); setRows(rs => [...rs, { source: f.source, id: f.id, quantity: 1 }]); }}>+ Add ingredient</button>
      <Field label="Instructions"><textarea style={{ minHeight: 140 }} value={instr} onChange={e => setInstr(e.target.value)} /></Field>
      {tags.length > 0 && <><label>Diet tags</label><Chips options={tags.map(t => [t.id, t.name])} selected={tagIds} onToggle={toggleTag} /></>}
      <Field label="Photo"><input type="file" accept="image/*" ref={file} /></Field>
      <div className="row" style={{ marginTop: 16 }}><button className="btn" onClick={save}>Save</button><button className="btn ghost" onClick={close}>Cancel</button></div>
    </>
  );
}

const MEAL_META = { breakfast: ['☕', '#c2410c'], lunch: ['🥪', '#0f766e'], dinner: ['🍽', '#4f46e5'], snack: ['🍎', '#a21cae'], dessert: ['🍰', '#0369a1'] };

export default function Recipes() {
  const { openModal } = useUI();
  const [src, setSrc] = useState('ACCOUNT');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('name');
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('recipes.view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const setView = v => { setViewState(v); try { localStorage.setItem('recipes.view', v); } catch { /* ignore */ } };
  const [diets, toggleDiet, clearDiets] = useSet([]);
  const state = useAsync(() => (src === 'ACCOUNT' ? api.recipes() : api.catalogRecipes()), [src]);
  const list = state.data ?? [];
  const shown = list.filter(r => r.name.toLowerCase().includes(query) && (!cat || r.category === cat) && [...diets].every(id => (r.diet_tags ?? []).some(t => t.id === id)))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'newest') return String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || a.name.localeCompare(b.name);
      const v = r => +(recipeN(r)?.[sort.replace(/^-/, '')] ?? NaN);
      const [x, y] = [v(a), v(b)];
      if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) - Number.isNaN(y) || a.name.localeCompare(b.name); // recipes without nutrition last
      return (sort.startsWith('-') ? x - y : y - x) || a.name.localeCompare(b.name);
    });
  const cats = [...new Set(list.map(r => r.category))].sort((a, b) => MEALS.indexOf(a) - MEALS.indexOf(b));
  const tagList = [...new Map(list.flatMap(r => r.diet_tags ?? []).map(t => [t.id, t.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const reset = () => { setCat(''); clearDiets(); setQuery(''); };
  const edit = existing => openModal(existing ? 'Edit recipe' : 'New recipe', close => <Editor existing={existing} close={close} onSaved={state.reload} />);
  const open = async r => {
    const full = await (src === 'ACCOUNT' ? api.recipe(r.id) : api.catalogRecipe(r.id)).catch(() => r);
    openModal(full.name, close => <Detail r={full} source={src} close={close} edit={edit} reload={s => (s && s !== src ? setSrc(s) : state.reload())} />, { sheet: true });
  };
  return (
    <Page title="" state={state}>
      <ListToolbar
        title="🍳 Recipes"
        actions={<>
          <div className="seg srctoggle" data-tour="recipes-source" role="group" aria-label="Recipe source">{[['ACCOUNT', '🧺 Mine'], ['CATALOG', '📚 Catalog']].map(([k, l]) => <button key={k} className={src === k ? 'on' : ''} onClick={() => { if (src !== k) { setSrc(k); reset(); } }}>{l}</button>)}</div>
          <button className="round-btn add" data-tour="recipes-new" title="New recipe" aria-label="New recipe" onClick={() => edit(null)}>+</button></>}
        query={query} onQuery={v => setQuery(v.toLowerCase())} placeholder="Search recipes…"
        sort={{ value: sort, onChange: setSort, options: [['name', 'Sort: A–Z'], ['newest', 'Sort: Newest'], ['kcal', 'Sort: Calories ↓'], ['-kcal', 'Sort: Calories ↑'], ['protein', 'Sort: Protein ↓'], ['carbs', 'Sort: Carbs ↓'], ['fat', 'Sort: Fat ↓']] }}
        view={{ value: view, onChange: setView, first: 'grid', second: 'list' }}
        cats={cats.map(c => ({ key: c, label: title(c), emoji: MEAL_META[c]?.[0] ?? '🍽', color: MEAL_META[c]?.[1] ?? '#1f9d4a', count: list.filter(r => r.category === c).length }))} cat={cat || 'ALL'} onCat={c => setCat(c === 'ALL' ? '' : c)} total={list.length}
        groups={tagList.length ? [{ label: 'Diet', options: tagList, selected: diets, onToggle: toggleDiet, multi: true }] : []}
        filtered={!!(cat || diets.size || query)} onClear={reset} />
      {shown.length === 0 ? <div className="card" style={{ textAlign: 'center', marginTop: 14 }}><div style={{ fontSize: 40 }}>🍳</div><p className="muted">{list.length ? 'No recipes match.' : src === 'ACCOUNT' ? 'No recipes yet. Create one, copy from the catalog, or import a file.' : 'No catalog recipes.'}</p></div> : (
        <div className={view === 'list' ? 'recipe-list' : 'recipe-grid'} style={{ marginTop: 14 }}>
          {shown.map(r => view === 'list' ? (
            <div key={r.id} data-tour="recipes-card" className="card recipe-row" style={{ '--c': MEAL_META[r.category]?.[1] ?? 'var(--brand)' }} tabIndex={0} role="button" onClick={() => open(r)} onKeyDown={e => { if (e.key === 'Enter') open(r); }}>
              {recipeImage(r) ? <img className="rthumb" src={recipeImage(r)} alt="" loading="lazy" /> : <div className="rthumb ph">🍽</div>}
              <div className="rmain">
                <h3>{r.name}</h3>
                <div className="rmeta">
                  <span className={`catdot dot-${r.category}`} />{title(r.category)} · {r.servings} {r.servings === 1 ? 'serving' : 'servings'}
                  {(r.diet_tags ?? []).slice(0, 2).map(t => <span key={t.id} className="tag sm">{t.name}</span>)}
                </div>
              </div>
              <div className="rmacros"><MacroPills n={recipeN(r)} /></div>
              {recipeN(r) && <div className="rkcal"><b>{fmt(recipeN(r).kcal)}</b><span>kcal</span></div>}
              <span className="chev">›</span>
            </div>
          ) : (
            <div key={r.id} data-tour="recipes-card" className="card recipe-card" onClick={() => open(r)}>
              {recipeImage(r) ? <img className="thumb" src={recipeImage(r)} alt="" loading="lazy" /> : <div className="thumb">🍽</div>}
              <div className="row between" style={{ marginTop: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: 16 }}>{r.name}</h3>
                {recipeN(r) && <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{fmt(recipeN(r).kcal)}</b> <span className="muted">kcal</span></div>}
              </div>
              <div className="muted" style={{ margin: '2px 0 8px' }}>{title(r.category)} · {r.servings} servings</div>
              <MacroPills n={recipeN(r)} />
              {(r.diet_tags ?? []).length > 0 && <div className="card-tags">{r.diet_tags.slice(0, 3).map(t => <span key={t.id} className="tag sm">{t.name}</span>)}</div>}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
