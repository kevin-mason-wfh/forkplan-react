// API client for the Forkplan backend (same endpoints as the iOS app). Calls go through /api (proxy).
const TOK = 'fp.tokens';
export const session = {
  get tokens() { try { return JSON.parse(localStorage.getItem(TOK)); } catch { return null; } },
  set tokens(v) { v ? localStorage.setItem(TOK, JSON.stringify(v)) : localStorage.removeItem(TOK); },
  account: null,
};
const IMAGE_BASE = (import.meta.env.VITE_IMAGE_BASE || '').replace(/\/+$/, '');
export const imageUrl = key => (key && IMAGE_BASE ? `${IMAGE_BASE}/${key}` : null);
/** Best image for a recipe / planned meal: API-provided URL first, then the configured image base. */
export const recipeImage = r => r?.image_url || imageUrl(r?.image_key);

export class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

function msg(body, status) {
  if (!body) return `Request failed (${status})`;
  const d = body.detail ?? body.message ?? body.error;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(x => x.msg || JSON.stringify(x)).join('; ');
  return d ? JSON.stringify(d) : `Request failed (${status})`;
}

let refreshing = null;
async function refresh() {
  const t = session.tokens;
  if (!t?.refresh) throw new ApiError(401, 'Session expired');
  refreshing ??= fetch('/api/v1/auth/refresh', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh }),
  }).then(async r => {
    if (!r.ok) throw new ApiError(401, 'Session expired');
    const b = await r.json();
    session.tokens = { access: b.access_token, id: b.id_token, refresh: b.refresh_token || t.refresh, expiresAt: Date.now() + b.expires_in * 1000 };
  }).finally(() => { refreshing = null; });
  return refreshing;
}

/** Global in-flight request tracking so the UI can show activity for every call. */
export const activity = {
  reads: 0, writes: 0, subs: new Set(),
  emit() { this.subs.forEach(f => f({ reads: this.reads, writes: this.writes })); },
  subscribe(f) { this.subs.add(f); return () => this.subs.delete(f); },
};

export async function request(method, path, body, opts = {}) {
  const k = method === 'GET' ? 'reads' : 'writes';
  if (!opts.retried) { activity[k]++; activity.emit(); }
  try { return await doRequest(method, path, body, opts); }
  finally { if (!opts.retried) { activity[k]--; activity.emit(); } }
}

async function doRequest(method, path, body, { auth = true, retried = false } = {}) {
  if (auth && session.tokens && session.tokens.expiresAt - Date.now() < 60_000) { try { await refresh(); } catch { /* handled on 401 */ } }
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && session.tokens) headers.authorization = `Bearer ${session.tokens.access}`;
  const res = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && auth && !retried) {
    try { await refresh(); return request(method, path, body, { auth, retried: true }); }
    catch { session.tokens = null; window.dispatchEvent(new Event('fp:signedout')); throw new ApiError(401, 'Session expired — please sign in again'); }
  }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, msg(data, res.status), data);
  return data;
}
export const get = (p) => request('GET', p);
export const post = (p, b = {}) => request('POST', p, b);
export const put = (p, b = {}) => request('PUT', p, b);
export const patch = (p, b = {}) => request('PATCH', p, b);
export const del = (p) => request('DELETE', p);

/** Fetch every page of a paginated list. `key` is the array property (default "items"). */
export async function all(path, key = 'items', limit = 100) {
  const out = []; let offset = 0;
  for (let i = 0; i < 50; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await get(`${path}${sep}limit=${limit}&offset=${offset}`);
    const items = Array.isArray(r) ? r : (r?.[key] ?? []);
    out.push(...items);
    if (Array.isArray(r) || !r?.pagination?.has_next || !items.length) break;
    offset += limit;
  }
  return out;
}

// ---- Auth ----
export const auth = {
  async signIn(email, password) {
    const b = await request('POST', '/v1/auth/sign-in', { email, password }, { auth: false });
    session.tokens = { access: b.access_token, id: b.id_token, refresh: b.refresh_token, expiresAt: Date.now() + b.expires_in * 1000 };
    session.account = await post('/v1/account').catch(() => null); // idempotent account bootstrap, as in the iOS app
  },
  signUp: (email, password) => request('POST', '/v1/auth/sign-up', { email, password }, { auth: false }),
  confirm: (email, code) => request('POST', '/v1/auth/confirm', { email, code }, { auth: false }),
  resend: (email) => request('POST', '/v1/auth/resend-code', { email }, { auth: false }),
  async signOut() { try { await post('/v1/auth/sign-out'); } catch { /* ignore */ } session.tokens = null; session.account = null; },
  deleteAccount: () => del('/v1/account'),
};

// ---- Domain helpers ----
export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'];
export const INGREDIENT_CATEGORIES = ['MEAT','SEAFOOD','DAIRY','EGGS','VEGETABLE','FRUIT','BREAD_BAKERY','PASTA','RICE_GRAINS','CEREAL','BEANS_LEGUMES','PLANT_PROTEIN','NUT_SEED','HERB_SPICE','OIL_FAT','SAUCE','CONDIMENT','BAKING_COOKING','SWEETS_SNACKS','BEVERAGE','OTHER'];
export const DIETARY_ATTRIBUTES = ['VEGETARIAN','VEGAN','PESCATARIAN','KETO','PALEO','LOW_CARB','GLUTEN_FREE','DAIRY_FREE','HALAL','KOSHER'];
export const UNITS = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl oz', 'each', 'slice', 'rasher'];
export const NOTIFICATION_KEYS = {
  master: 'All notifications', meal_reminder_breakfast: 'Breakfast reminder', meal_reminder_lunch: 'Lunch reminder',
  meal_reminder_dinner: 'Dinner reminder', water_reminders: 'Water reminders', goal_milestones: 'Goal milestones',
  tips_recipes: 'Tips & recipes', shopping_reminder: 'Shopping reminder',
};
export const title = s => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/^\w|\s\w/g, c => c.toUpperCase());
export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const mondayOf = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };
export const todayName = () => DAYS[(new Date().getDay() + 6) % 7];

export const ref = (src, id) => src === 'CATALOG'
  ? { ingredient_source: 'CATALOG', catalog_ingredient_id: id } : { ingredient_source: 'ACCOUNT', ingredient_id: id };
export const refId = x => (x.ingredient_source === 'CATALOG' ? x.catalog_ingredient_id : x.ingredient_id) ?? x.ingredient_id ?? x.catalog_ingredient_id;

export const api = {
  recipes: (q = '') => all(`/v1/recipes${q ? `?query=${encodeURIComponent(q)}` : ''}`),
  catalogRecipes: () => all('/v1/catalog/recipes'),
  recipe: id => get(`/v1/recipes/${id}`),
  catalogRecipe: id => get(`/v1/catalog/recipes/${id}`),
  createRecipe: b => post('/v1/recipes', b),
  updateRecipe: (id, b) => patch(`/v1/recipes/${id}`, b),
  deleteRecipe: id => del(`/v1/recipes/${id}`),
  setRecipeIngredient: (rid, iid, quantity, src = 'ACCOUNT') => put(`/v1/recipes/${rid}/ingredients/${iid}`, { ...ref(src, iid), quantity }),
  removeRecipeIngredient: (rid, iid, src = 'ACCOUNT') => del(`/v1/recipes/${rid}/ingredients/${iid}${src === 'CATALOG' ? '?ingredient_source=CATALOG' : ''}`),
  assignTag: (rid, tid) => put(`/v1/recipes/${rid}/diet-tags/${tid}`),
  removeTag: (rid, tid) => del(`/v1/recipes/${rid}/diet-tags/${tid}`),
  async uploadRecipeImage(id, file) {
    const p = await post(`/v1/recipes/${id}/image/presign`, { filename: file.name, content_type: file.type || 'image/jpeg', content_length: file.size });
    const r = await fetch(p.upload_url, { method: 'PUT', headers: { 'content-type': p.content_type }, body: file });
    if (!r.ok) throw new ApiError(r.status, 'Image upload failed (check S3 CORS)');
    return p;
  },
  dietTags: () => get('/v1/diet-tags').then(r => r.items ?? r),
  createDietTag: name => post('/v1/diet-tags', { name }),
  ingredients: () => all('/v1/ingredients'),
  catalogIngredients: () => all('/v1/catalog/ingredients'),
  createIngredient: b => post('/v1/ingredients', b),
  updateIngredient: (id, b) => patch(`/v1/ingredients/${id}`, b),
  setNutrition: (id, b) => post(`/v1/ingredients/${id}/nutrition`, b),
  deleteIngredient: id => del(`/v1/ingredients/${id}`),
  allergens: () => get('/v1/allergens').then(r => r.items ?? r),
  ingredientTags: () => get('/v1/ingredient-tags').then(r => r.items ?? r),
  pantries: () => get('/v1/pantries').then(r => r.items ?? r),
  pantry: id => get(`/v1/pantries/${id}`),
  createPantry: name => post('/v1/pantries', { name }),
  deletePantry: id => del(`/v1/pantries/${id}`),
  addPantryItem: (pid, src, id, quantity) => post(`/v1/pantries/${pid}/items`, { ...ref(src, id), quantity }),
  reducePantryItem: (pid, src, id, quantity) => post(`/v1/pantries/${pid}/items/reduce`, { ...ref(src, id), quantity }),
  removePantryItem: (pid, src, id) => del(`/v1/pantries/${pid}/items/${id}${src === 'CATALOG' ? '?ingredient_source=CATALOG' : ''}`),
  mealPlans: () => get('/v1/meal-plans').then(r => r.items ?? r),
  mealPlan: id => get(`/v1/meal-plans/${id}`),
  createMealPlan: (name, week_start) => post('/v1/meal-plans', { name, week_start }),
  renameMealPlan: (id, name) => patch(`/v1/meal-plans/${id}`, { name }),
  advanceWeek: (id, week_start) => patch(`/v1/meal-plans/${id}`, { week_start }),
  deleteMealPlan: id => del(`/v1/meal-plans/${id}`),
  addMeal: (id, day, category, recipe, servings = 1, slot = 0) => put(`/v1/meal-plans/${id}/meals`, {
    day, category, servings, slot, recipe_source: recipe.source,
    recipe_id: recipe.source === 'ACCOUNT' ? recipe.id : null, catalog_recipe_id: recipe.source === 'CATALOG' ? recipe.id : null,
  }),
  removeMeal: (id, plannedMealId) => del(`/v1/meal-plans/${id}/meals/${plannedMealId}`),
  setMealServings: (id, plannedMealId, servings) => patch(`/v1/meal-plans/${id}/meals/${plannedMealId}`, { servings }),
  consumptions: (from, to) => all(`/v1/meal-consumptions${from ? `?date_from=${from}&date_to=${to}` : ''}`),
  consumptionsFor: plannedMealId => all(`/v1/meal-consumptions?planned_meal_id=${plannedMealId}`),
  logConsumption: planned_meal_id => post('/v1/meal-consumptions', { planned_meal_id }),
  deleteConsumption: id => del(`/v1/meal-consumptions/${id}`),
  shoppingLists: () => all('/v1/shopping-lists', 'shopping_lists'),
  shoppingList: id => get(`/v1/shopping-lists/${id}`),
  shoppingItems: id => get(`/v1/shopping-lists/${id}/items`).then(r => r.shopping_list_items ?? r.items ?? r),
  generateShopping: (meal_plan_id, pantry_id) => post('/v1/shopping-lists/generate', { meal_plan_id, pantry_id: pantry_id || null }),
  regenerateShopping: id => post(`/v1/shopping-lists/${id}/regenerate`, { strategy: 'FULL_REBUILD' }),
  deleteShopping: id => del(`/v1/shopping-lists/${id}`),
  addShoppingItem: (lid, b) => post(`/v1/shopping-lists/${lid}/items`, b),
  updateShoppingItem: (lid, iid, b) => patch(`/v1/shopping-lists/${lid}/items/${iid}`, b),
  deleteShoppingItem: (lid, iid) => del(`/v1/shopping-lists/${lid}/items/${iid}`),
  checkItem: (lid, iid, on) => patch(`/v1/shopping-lists/${lid}/items/${iid}/${on ? 'check' : 'uncheck'}`),
  quota: () => get('/v1/quota'),
  goal: () => get('/v1/nutrition-goal').catch(e => (e.status === 404 ? null : Promise.reject(e))),
  setGoal: b => put('/v1/nutrition-goal', b),
  water: (from, to) => get(`/v1/water-log?date_from=${from}&date_to=${to}`).then(r => (Array.isArray(r) ? r : Object.values(r ?? {}).find(Array.isArray) ?? [])),
  setWater: (day, ml) => put(`/v1/water-log/${day}`, { ml }),
  dietaryPrefs: () => get('/v1/account/dietary-preferences'),
  setDietaryPrefs: b => put('/v1/account/dietary-preferences', b),
  notifPrefs: () => get('/v1/account/notification-preferences'),
  setNotifPrefs: preferences => patch('/v1/account/notification-preferences', { preferences }),
};

// Water settings are device-local in the iOS app; mirrored here in localStorage.
export const waterSettings = {
  get: () => { try { return JSON.parse(localStorage.getItem('fp.water')) ?? { dailyGoalMilliliters: 2000, glassMilliliters: 250 }; } catch { return { dailyGoalMilliliters: 2000, glassMilliliters: 250 }; } },
  set: v => localStorage.setItem('fp.water', JSON.stringify(v)),
};
