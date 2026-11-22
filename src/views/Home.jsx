import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session, MEALS, isoDate, mondayOf, todayName, title, recipeImage, waterSettings } from '../api.js';
import { NutriTiles, fmt, mealN, sumN } from '../nutrition.jsx';
import { Page, useAsync, useUI } from '../ui.jsx';

const ICON = { breakfast: '☕', lunch: '🥪', dinner: '🍽', snack: '🍎', dessert: '🍰' };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

function Ring({ value, goal }) {
  const R = 78, C = 2 * Math.PI * R;
  const pct = goal ? Math.min(1, value / goal) : 0;
  const left = goal ? Math.max(0, Math.round(goal - value)) : Math.round(value);
  return (
    <div className="ring">
      <svg viewBox="0 0 190 190">
        <circle cx="95" cy="95" r={R} className="ring-bg" />
        <circle cx="95" cy="95" r={R} className="ring-fg" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 95 95)" />
      </svg>
      <div className="ring-mid"><b>{left.toLocaleString()}</b><span>{goal ? 'left' : 'eaten'}</span></div>
    </div>
  );
}

const MacroBar = ({ k, name, v, goal }) => (
  <div className={`mb ${k}`}>
    <div className="row between" style={{ flexWrap: 'nowrap' }}><span className="mb-n"><i />{name}</span><span className="muted">{fmt(v)}g{goal ? ` / ${fmt(goal)}g` : ''}</span></div>
    <div className="mb-bar"><i style={{ width: `${goal ? Math.min(100, (v / goal) * 100) : 0}%` }} /></div>
  </div>
);

function MealRow({ m, onLog, featured }) {
  const img = recipeImage(m), n = mealN(m);
  return (
    <div className={'upnext' + (featured ? ' feat' : '')}>
      <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        {img ? <img className="mthumb" src={img} alt="" decoding="async" /> : <div className="mthumb ph">{ICON[m.category]}</div>}
        <div className="grow" style={{ minWidth: 0 }}>
          <div className={'mname' + (m.eaten_by_me ? ' done' : '')}>{m.recipe_name}</div>
          <div className={`dot-label cat-t-${m.category}`} style={{ margin: '4px 0' }}><i />{title(m.category)}</div>
          <div className="muted">{fmt(m.servings)} serving{+m.servings === 1 ? '' : 's'}</div>
        </div>
        {m.eaten_by_me ? <span className="pill-btn done">✓ Eaten</span> : <button className="pill-btn" onClick={onLog}>Log</button>}
      </div>
      {n && <div style={{ marginTop: 12 }}><NutriTiles n={n} /></div>}
    </div>
  );
}

const SHORTCUTS = [['/plan', '📅', 'Meal Plan', 'var(--n-kcal-bg)'], ['/recipes', '📖', 'Recipes', 'var(--n-carbs-bg)'], ['/pantry', '🥫', 'Pantry', 'var(--n-protein-bg)'], ['/shopping', '🛒', 'Shopping', 'var(--n-fat-bg)'], ['/ingredients', '🥬', 'Ingredients', 'var(--n-kcal-bg)'], ['/pantry?suggestions=1', '🍳', 'Meal Suggestions', 'var(--n-carbs-bg)'], ['/water', '💧', 'Water Log', 'var(--n-protein-bg)'], ['/nutrition', '📊', 'Nutrition Summary', 'var(--n-carbs-bg)'], ['/data', '⇅', 'Import / Export', 'var(--fill)']];

// Stale-while-revalidate: paint the last known dashboard instantly, then refresh it in the background.
const cacheKey = () => { try { return 'fp.home.' + JSON.parse(atob(session.tokens.access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { return null; } };
const readCache = () => { try { const d = JSON.parse(localStorage.getItem(cacheKey())); return d?.day === isoDate(new Date()) ? d : null; } catch { return null; } };

export default function Home() {
  const { run } = useUI();
  const [all, setAll] = useState(false);
  const day = isoDate(new Date());
  const [cached] = useState(readCache);
  const state = useAsync(async () => {
    // Everything starts at once; the plan detail is fetched speculatively using the last known plan id.
    const goalP = api.goal().catch(() => null);
    const waterP = api.water(day, day).catch(() => []);
    const guess = cached?.plan?.id ? api.mealPlan(cached.plan.id).catch(() => null) : null;
    const plans = await api.mealPlans();
    const plan = plans.find(p => p.week_start === isoDate(mondayOf()));
    let detail = null;
    if (plan) detail = (plan.id === cached?.plan?.id && await guess) || await api.mealPlan(plan.id);
    const [goal, w] = await Promise.all([goalP, waterP]);
    return { plan, detail, goal, water: (Array.isArray(w) ? w : []).find(x => x.date === day)?.ml ?? 0 };
  });
  useEffect(() => { if (state.data && cacheKey()) { try { localStorage.setItem(cacheKey(), JSON.stringify({ ...state.data, day })); } catch { /* ignore */ } } }, [state.data, day]);
  const view = state.data ?? cached;
  const { plan, detail, goal } = view ?? {};
  const [localWater, setLocalWater] = useState(null); // optimistic value after the user taps +/−
  const water = localWater ?? view?.water ?? 0;
  const today = todayName();
  const meals = (detail?.planned_meals ?? []).filter(m => m.day === today).sort((a, b) => MEALS.indexOf(a.category) - MEALS.indexOf(b.category) || a.slot - b.slot);
  const eaten = sumN(meals.filter(m => m.eaten_by_me).map(mealN));
  const next = meals.find(m => !m.eaten_by_me);
  const rest = meals.filter(m => m !== next);
  const target = goal ?? detail?.nutrition_targets ?? null;
  const ws = waterSettings.get();
  const wpct = Math.min(100, (water / ws.dailyGoalMilliliters) * 100);
  const addWater = async d => {
    const prev = water, next = Math.min(10000, Math.max(0, Math.round(prev + d)));
    if (next === prev) return;
    setLocalWater(next); // show it immediately
    const r = await run(() => api.setWater(day, next));
    if (r === undefined) setLocalWater(prev); // failed: run() already toasted the error
    else if (r?.ml != null) setLocalWater(r.ml);
  };
  const log = async m => { if (await run(() => api.logConsumption(m.id), 'Logged')) state.reload(); };

  return (
    <Page title="" state={{ ...state, data: view }}>
      <div className="home">
        <div className="hello">
          <div className="muted" style={{ fontSize: 17 }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{greeting()}</h1>
        </div>
        <div className="home-grid">
          <div className="card hcard cal">
            <div className="row between"><h2>Today's Calories</h2><Link to="/account" className="glink">Edit Goals</Link></div>
            <div className="cal-body">
              <Ring value={eaten.kcal} goal={target?.kcal} />
              <div className="mbars">
                <MacroBar k="protein" name="Protein" v={eaten.protein} goal={target?.protein} />
                <MacroBar k="carbs" name="Carbs" v={eaten.carbs} goal={target?.carbs} />
                <MacroBar k="fat" name="Fat" v={eaten.fat} goal={target?.fat} />
              </div>
            </div>
            <p className="muted" style={{ fontSize: 16, margin: '10px 0 0' }}>{fmt(eaten.kcal)} eaten{target?.kcal ? ` of ${Number(target.kcal).toLocaleString()} kcal goal` : ' — set a calorie goal in Account'}</p>
          </div>

          <div className="hcard water">
            <div className="row between"><h2><Link to="/water" className="hlink">Water</Link></h2><span className="muted">Goal {ws.dailyGoalMilliliters} ml</span></div>
            <div className="wval"><b>{water}</b> ml</div>
            <div className="wbar"><i style={{ width: `${wpct}%` }} /></div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn grow" onClick={() => addWater(ws.glassMilliliters)}>+ {ws.glassMilliliters} ml</button>
              <button className="btn ghost" onClick={() => addWater(-ws.glassMilliliters)}>−</button>
            </div>
          </div>

          <div className="hsec upn">
            <div className="row between"><h2>Up Next</h2><Link to="/plan" className="glink">View Plan</Link></div>
            {meals.length ? (
              <>
                {next ? <><div className="glink today">🕒 Today</div><MealRow m={next} featured onLog={() => log(next)} /></> : <div className="card" style={{ textAlign: 'center' }}>🎉 All of today's meals are logged</div>}
                {rest.length > 0 && <button className="showall" onClick={() => setAll(a => !a)}>{all ? 'Hide' : "Show today's meals"} {all ? '⌃' : '⌄'}</button>}
                {all && rest.map(m => <MealRow key={m.id} m={m} onLog={() => log(m)} />)}
              </>
            ) : <div className="card"><p className="muted" style={{ margin: 0 }}>{plan ? 'Nothing planned for today.' : 'No meal plan for this week yet.'} <Link to="/plan" className="glink">Open meal plan →</Link></p></div>}
          </div>

          <div className="hsec short">
            <h2>Shortcuts</h2>
            <div className="shortgrid">
              {SHORTCUTS.map(([to, ic, l, bg]) => <Link key={to} to={to} className="shortcut"><span style={{ background: bg }}>{ic}</span>{l}</Link>)}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
