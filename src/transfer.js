// Import / export. Backups are name-based (not ID-based) so they can be restored into any account.
import { api, waterSettings, isoDate, mondayOf, DAYS, MEALS, INGREDIENT_CATEGORIES } from './api.js';
import { toCSV, parseCSV } from './util.js';
import { loadIngredients } from './lookup.js';

export const FORMAT = 'forkplan-web-backup';
export const stamp = () => isoDate(new Date());
const num = v => (v === '' || v == null || Number.isNaN(+v) ? null : +v);

const planOut = p => ({ name: p.name, week_start: p.week_start, meals: (p.planned_meals ?? []).map(m => ({ day: m.day, category: m.category, recipe: m.recipe_name, servings: m.servings })) });
const recipeOut = (r, nameOf) => ({ name: r.name, category: r.category, servings: r.servings, description: r.description ?? '', instructions: r.instructions ?? '',
  diet_tags: (r.diet_tags ?? []).map(t => t.name), ingredients: r.ingredients.map(i => ({ name: i.ingredient_name ?? nameOf(i.ingredient_source, i.ingredient_id ?? i.catalog_ingredient_id), quantity: i.quantity, unit: i.unit })) });

// ---------- Export ----------
/** Export a single meal plan (plus the account recipes and ingredients it uses, so it imports cleanly elsewhere). */
export async function gatherPlan(planId) {
  const [plan, recipes, ingredients, ing] = await Promise.all([api.mealPlan(planId), api.recipes(), api.ingredients(), loadIngredients()]);
  const nameOf = (src, id) => ing.get(src, id)?.name;
  const used = new Set((plan.planned_meals ?? []).map(m => m.recipe_name?.trim().toLowerCase()));
  const rs = recipes.filter(r => used.has(r.name.trim().toLowerCase()));
  const ingNames = new Set(rs.flatMap(r => r.ingredients.map(i => (i.ingredient_name ?? nameOf(i.ingredient_source, i.ingredient_id ?? i.catalog_ingredient_id))?.trim().toLowerCase())));
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
    ingredients: ingredients.filter(i => ingNames.has(i.name.trim().toLowerCase())).map(i => ({ name: i.name, unit: i.unit, size: i.size, brand: i.brand ?? null, category: i.category, dietary_attributes: i.dietary_attributes ?? [], allergens: i.allergens ?? [], nutrition_facts: i.nutrition_facts ?? null })),
    recipes: rs.map(r => recipeOut(r, nameOf)), mealPlans: [planOut(plan)] };
}

export async function gather(log = () => {}) {
  log('Loading ingredients, recipes, pantries…');
  const [ingredients, recipes, pantries, plans, lists, goal, dp, np, tags, allergens, ing] = await Promise.all([
    api.ingredients(), api.recipes(), api.pantries().catch(() => []), api.mealPlans(), api.shoppingLists().catch(() => []),
    api.goal().catch(() => null), api.dietaryPrefs().catch(() => null), api.notifPrefs().catch(() => null), api.dietTags().catch(() => []), api.allergens().catch(() => []), loadIngredients()]);
  log('Loading meal plans and shopping lists…');
  const plansFull = await Promise.all(plans.map(p => api.mealPlan(p.id).catch(() => null)));
  const listsFull = await Promise.all(lists.map(l => api.shoppingList(l.id).catch(() => l)));
  const tagName = new Map(tags.map(t => [t.id, t.name]));
  const nameOf = (src, id) => ing.get(src, id)?.name;
  const recipeName = new Map(recipes.map(r => [r.id, r.name]));
  return {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
    ingredients: ingredients.map(i => ({ name: i.name, unit: i.unit, size: i.size, brand: i.brand ?? null, category: i.category, dietary_attributes: i.dietary_attributes ?? [], allergens: i.allergens ?? [], nutrition_facts: i.nutrition_facts ?? null })),
    recipes: recipes.map(r => recipeOut(r, nameOf)),
    pantries: pantries.map(p => ({ name: p.name, items: (p.items ?? []).map(it => { const src = it.ingredient_source ?? 'ACCOUNT'; const id = src === 'CATALOG' ? it.catalog_ingredient_id : it.ingredient_id; const i = ing.get(src, id); return { name: i?.name ?? id, unit: i?.unit, quantity: it.quantity ?? it.in_pantry }; }) })),
    mealPlans: plansFull.filter(Boolean).map(planOut),
    shoppingLists: listsFull.map(l => ({ name: l.name ?? null, week_start: l.week_start ?? null, items: (l.items ?? []).map(i => ({ name: i.ingredient_name, quantity: i.purchase_quantity ?? i.quantity ?? 0, unit: i.unit ?? null, checked: !!i.is_checked })) })),
    goal: goal ?? null,
    dietaryPrefs: dp ? { diets: dp.diet_tag_ids.map(id => tagName.get(id)).filter(Boolean), allergens: dp.allergen_codes, exclude_ingredient_tags: dp.exclude_ingredient_tags } : null,
    notificationPrefs: np?.preferences ?? null,
    waterSettings: waterSettings.get(),
  };
}

export const CSV = {
  ingredients: b => toCSV([['name', 'unit', 'size', 'brand', 'category', 'kcal', 'protein', 'carbs', 'fat'],
    ...b.ingredients.map(i => [i.name, i.unit, i.size, i.brand, i.category, i.nutrition_facts?.kcal, i.nutrition_facts?.protein, i.nutrition_facts?.carbs, i.nutrition_facts?.fat])]),
  recipes: b => toCSV([['recipe', 'category', 'servings', 'description', 'instructions', 'ingredient', 'quantity', 'unit'],
    ...b.recipes.flatMap(r => (r.ingredients.length ? r.ingredients : [{}]).map((i, n) => [r.name, r.category, r.servings, n ? '' : r.description, n ? '' : r.instructions, i.name, i.quantity, i.unit]))]),
  pantry: b => toCSV([['pantry', 'ingredient', 'quantity', 'unit'], ...b.pantries.flatMap(p => p.items.map(i => [p.name, i.name, i.quantity, i.unit]))]),
  mealplans: b => toCSV([['plan', 'week_start', 'day', 'meal', 'recipe', 'servings'], ...b.mealPlans.flatMap(p => p.meals.map(m => [p.name, p.week_start, m.day, m.category, m.recipe, m.servings]))]),
  shopping: b => toCSV([['list', 'ingredient', 'quantity', 'unit', 'checked'], ...b.shoppingLists.flatMap(l => l.items.map(i => [l.name ?? l.week_start ?? 'List', i.name, i.quantity, i.unit, i.checked ? 'yes' : 'no']))]),
};
export const TEMPLATES = {
  ingredients: 'name,unit,size,brand,category,kcal,protein,carbs,fat\nRolled oats,g,500,Acme,RICE_GRAINS,379,13,67,6.5\n',
  recipes: 'recipe,category,servings,description,instructions,ingredient,quantity,unit\nPorridge,breakfast,2,Warm oats,"Simmer oats with milk.",Rolled oats,80,g\n,,,,,Milk,300,ml\n',
  pantry: 'pantry,ingredient,quantity,unit\nKitchen,Rolled oats,500,g\n',
  mealplans: 'plan,week_start,day,meal,recipe,servings\nMy week,2026-01-05,MONDAY,breakfast,Porridge,1\n',
  shopping: 'list,ingredient,quantity,unit,checked\nMy list,Milk,2,l,no\n',
};

// ---------- CSV → bundle ----------
export function csvToBundle(kind, text) {
  const rows = parseCSV(text); const b = {};
  if (kind === 'ingredients') b.ingredients = rows.filter(r => r.name).map(r => ({ name: r.name, unit: r.unit || 'g', size: num(r.size) ?? 1, brand: r.brand || null,
    category: INGREDIENT_CATEGORIES.includes(r.category?.toUpperCase()) ? r.category.toUpperCase() : 'OTHER', dietary_attributes: [], allergens: [],
    nutrition_facts: r.kcal ? { kcal: num(r.kcal), protein: num(r.protein) ?? 0, carbs: num(r.carbs) ?? 0, fat: num(r.fat) ?? 0 } : null }));
  if (kind === 'recipes') { const m = new Map(); let last;
    for (const r of rows) { const n = r.recipe || last; if (!n) continue; last = n;
      if (!m.has(n)) m.set(n, { name: n, category: (r.category || 'dinner').toLowerCase(), servings: num(r.servings) ?? 1, description: r.description ?? '', instructions: r.instructions ?? '', diet_tags: [], ingredients: [] });
      if (r.ingredient) m.get(n).ingredients.push({ name: r.ingredient, quantity: num(r.quantity) ?? 1, unit: r.unit || undefined }); }
    b.recipes = [...m.values()]; }
  if (kind === 'pantry') { const m = new Map(); for (const r of rows) { if (!r.ingredient) continue; const n = r.pantry || 'Kitchen'; if (!m.has(n)) m.set(n, { name: n, items: [] }); m.get(n).items.push({ name: r.ingredient, quantity: num(r.quantity) ?? 1, unit: r.unit }); } b.pantries = [...m.values()]; }
  if (kind === 'mealplans') { const m = new Map();
    for (const r of rows) { if (!r.recipe) continue; const k = `${r.plan || 'Meal plan'}|${r.week_start || ''}`;
      if (!m.has(k)) m.set(k, { name: r.plan || 'Meal plan', week_start: r.week_start || null, meals: [] });
      m.get(k).meals.push({ day: (r.day ?? '').toUpperCase(), category: (r.meal ?? '').toLowerCase(), recipe: r.recipe, servings: num(r.servings) ?? 1 }); }
    b.mealPlans = [...m.values()]; }
  if (kind === 'shopping') { const m = new Map(); for (const r of rows) { if (!r.ingredient) continue; const n = r.list || 'List'; if (!m.has(n)) m.set(n, { name: n, items: [] }); m.get(n).items.push({ name: r.ingredient, quantity: num(r.quantity) ?? 1, unit: r.unit, checked: /^(y|yes|true|1)$/i.test(r.checked ?? '') }); } b.shoppingLists = [...m.values()]; }
  return b;
}

// ---------- Import ----------
export async function importBundle(b, sections, log) {
  const stats = { created: 0, skipped: 0, failed: 0 };
  const ok = () => { stats.created++; }; const skip = (m) => { stats.skipped++; log(`↷ ${m}`); }; const fail = (m, e) => { stats.failed++; log(`✗ ${m}: ${e.message ?? e}`); };
  let ing = await loadIngredients();
  const ensureIngredient = async (name, unit) => {
    const f = ing.find(name); if (f) return { source: f.source, id: f.id };
    const c = await api.createIngredient({ name, unit: unit || 'g', size: 1, brand: null, category: 'OTHER', dietary_attributes: [], allergens: [] });
    const rec = { ...c, name, unit: unit || 'g', source: 'ACCOUNT' }; ing.byName.set(name.trim().toLowerCase(), rec); ing.byKey.set(`ACCOUNT:${c.id}`, rec); ing.list.push(rec);
    log(`+ created ingredient “${name}” (not found)`); return { source: 'ACCOUNT', id: c.id };
  };

  if (sections.ingredients && b.ingredients?.length) { log(`Ingredients (${b.ingredients.length})…`);
    for (const i of b.ingredients) { try {
      if (ing.find(i.name)) { skip(`ingredient “${i.name}” exists`); continue; }
      const c = await api.createIngredient({ name: i.name, unit: i.unit || 'g', size: i.size || 1, brand: i.brand ?? null, category: i.category || 'OTHER', dietary_attributes: i.dietary_attributes ?? [], allergens: i.allergens ?? [] });
      if (i.nutrition_facts?.kcal != null) await api.setNutrition(c.id, { kcal: i.nutrition_facts.kcal, fat: i.nutrition_facts.fat ?? 0, protein: i.nutrition_facts.protein ?? 0, carbs: i.nutrition_facts.carbs ?? 0 });
      const rec = { ...c, name: i.name, unit: i.unit || 'g', source: 'ACCOUNT' }; ing.byName.set(i.name.trim().toLowerCase(), rec); ing.byKey.set(`ACCOUNT:${c.id}`, rec); ing.list.push(rec);
      ok(); } catch (e) { fail(`ingredient “${i.name}”`, e); } } }

  let recipeIndex = null;
  const recipesByName = async () => recipeIndex ??= new Map([...(await api.catalogRecipes().catch(() => [])), ...(await api.recipes())].map(r => [r.name.trim().toLowerCase(), r]));
  if (sections.recipes && b.recipes?.length) { log(`Recipes (${b.recipes.length})…`);
    const tags = new Map((await api.dietTags().catch(() => [])).map(t => [t.name.toLowerCase(), t.id])); const have = await recipesByName();
    for (const r of b.recipes) { try {
      const existing = have.get(r.name.trim().toLowerCase()); if (existing && existing.recipe_source !== 'CATALOG') { skip(`recipe “${r.name}” exists`); continue; }
      const ingredients = []; for (const x of r.ingredients ?? []) { const f = await ensureIngredient(x.name, x.unit); ingredients.push({ ingredient_source: f.source, ingredient_id: f.source === 'ACCOUNT' ? f.id : null, catalog_ingredient_id: f.source === 'CATALOG' ? f.id : null, quantity: x.quantity ?? 1 }); }
      const tagIds = (r.diet_tags ?? []).map(n => { const id = tags.get(n.toLowerCase()); if (!id) log(`! unknown diet tag “${n}” skipped`); return id; }).filter(Boolean);
      const c = await api.createRecipe({ name: r.name, category: r.category || 'dinner', servings: r.servings || 1, description: r.description || null, instructions: r.instructions || null, ingredients, diet_tag_ids: tagIds });
      recipeIndex.set(r.name.trim().toLowerCase(), { ...c, name: r.name }); ok(); } catch (e) { fail(`recipe “${r.name}”`, e); } } }

  if (sections.pantries && b.pantries?.length) { log(`Pantries (${b.pantries.length})…`); const existing = await api.pantries();
    for (const p of b.pantries) { try {
      let pan = existing.find(x => x.name.toLowerCase() === p.name.toLowerCase()); if (!pan) { pan = await api.createPantry(p.name); ok(); }
      for (const it of p.items ?? []) { const f = await ensureIngredient(it.name, it.unit); await api.addPantryItem(pan.id, f.source, f.id, it.quantity ?? 1); }
      log(`✓ pantry “${p.name}”: ${(p.items ?? []).length} items added`); } catch (e) { fail(`pantry “${p.name}”`, e); } } }

  if (sections.mealPlans && b.mealPlans?.length) { log(`Meal plans (${b.mealPlans.length})…`); const have = await recipesByName(); const existing = await api.mealPlans();
    for (const p of b.mealPlans) { try {
      const week = p.week_start || isoDate(mondayOf());
      if (existing.some(x => x.name === p.name && x.week_start === week)) { skip(`meal plan “${p.name}” (${week}) exists`); continue; }
      const plan = await api.createMealPlan(p.name, week); ok();
      const slots = {};
      for (const m of p.meals ?? []) { const r = have.get(String(m.recipe).trim().toLowerCase()); if (!r || !DAYS.includes(m.day) || !MEALS.includes(m.category)) { log(`! meal “${m.recipe}” skipped (recipe or slot not found)`); continue; }
        await api.addMeal(plan.id, m.day, m.category, { id: r.id, source: r.recipe_source === 'CATALOG' ? 'CATALOG' : 'ACCOUNT' }, m.servings || 1, Math.min(4, slots[`${m.day}${m.category}`] = (slots[`${m.day}${m.category}`] ?? -1) + 1)); }
      } catch (e) { fail(`meal plan “${p.name}”`, e); } } }

  if (sections.shoppingLists && b.shoppingLists?.length) { log(`Shopping lists (${b.shoppingLists.length})…`); const lists = await api.shoppingLists();
    for (const l of b.shoppingLists) { try {
      const target = lists.find(x => (x.name ?? '').toLowerCase() === String(l.name ?? '').toLowerCase()) ?? (l.name === 'List' || !l.name ? lists[0] : null);
      if (!target) { skip(`shopping list “${l.name}” not found — lists are generated from meal plans; items not imported`); continue; }
      for (const it of l.items ?? []) { const f = ing.find(it.name);
        await api.addShoppingItem(target.id, { ...(f ? { ingredient_source: f.source, ingredient_id: f.source === 'ACCOUNT' ? f.id : null, catalog_ingredient_id: f.source === 'CATALOG' ? f.id : null } : {}), ingredient_name: it.name, display_name: f ? undefined : it.name, unit: it.unit ?? f?.unit, purchase_quantity: it.quantity ?? 1 }); ok(); }
      } catch (e) { fail(`shopping list “${l.name}”`, e); } } }

  if (sections.settings) {
    try { if (b.goal) { await api.setGoal({ kcal: Math.round(b.goal.kcal), protein: b.goal.protein, carbs: b.goal.carbs, fat: b.goal.fat }); log('✓ nutrition goals restored'); }
      if (b.dietaryPrefs) { const tags = new Map((await api.dietTags().catch(() => [])).map(t => [t.name.toLowerCase(), t.id]));
        await api.setDietaryPrefs({ diet_tag_ids: (b.dietaryPrefs.diets ?? []).map(n => tags.get(n.toLowerCase())).filter(Boolean), allergen_codes: b.dietaryPrefs.allergens ?? [], exclude_ingredient_tags: b.dietaryPrefs.exclude_ingredient_tags ?? [] }); log('✓ dietary preferences restored'); }
      if (b.notificationPrefs) { await api.setNotifPrefs(b.notificationPrefs); log('✓ notification preferences restored'); }
      if (b.waterSettings) { waterSettings.set(b.waterSettings); log('✓ water settings restored'); } } catch (e) { fail('settings', e); }
  }
  return stats;
}

