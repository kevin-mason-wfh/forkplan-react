import { api } from './api.js';

/** Ingredient lookup across the user's own and catalog ingredients. */
export async function loadIngredients() {
  const [mine, cat] = await Promise.all([api.ingredients(), api.catalogIngredients().catch(() => [])]);
  const byKey = new Map();
  mine.forEach(i => byKey.set(`ACCOUNT:${i.id}`, { ...i, source: 'ACCOUNT' }));
  cat.forEach(i => byKey.set(`CATALOG:${i.id}`, { ...i, source: 'CATALOG' }));
  const list = [...byKey.values()];
  const byName = new Map();
  [...list.filter(i => i.source === 'CATALOG'), ...list.filter(i => i.source === 'ACCOUNT')].forEach(i => byName.set(i.name.trim().toLowerCase(), i)); // account wins
  return {
    list, mine, catalog: cat, byKey, byName,
    get: (src, id) => byKey.get(`${src}:${id}`),
    find: name => byName.get(String(name).trim().toLowerCase()),
  };
}

export const recipeNutrition = r => r.nutrition?.per_serving ?? null;
