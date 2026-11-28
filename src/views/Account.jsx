import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetTour } from '../Tour.jsx';
import { api, auth, post, session, NOTIFICATION_KEYS, waterSettings, title } from '../api.js';
import { Chips, Field, Loader, Page, Select, useAsync, useSet, useUI } from '../ui.jsx';

// Lookup lists rarely change: keep them for the tab's lifetime.
const lookups = {};
const cached = (k, f) => (lookups[k] ??= f().catch(e => { delete lookups[k]; return []; }));

// Mifflin–St Jeor + activity multiplier; macro split per goal.
function calc({ sex, age, heightCm, weightKg, activity, goal }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const kcal = Math.round(bmr * activity + { lose: -500, maintain: 0, build: 300 }[goal]);
  const protein = Math.round(weightKg * (goal === 'build' ? 2 : goal === 'lose' ? 1.8 : 1.6));
  const fat = Math.round((kcal * 0.28) / 9);
  return { kcal, protein, fat, carbs: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)) };
}

const Section = ({ icon, name, hint, children }) => (
  <section className="scard">
    <div className="shead"><span className="sico">{icon}</span><div><h3>{name}</h3>{hint && <div className="muted">{hint}</div>}</div></div>
    {children}
  </section>
);

function Goals({ goal }) {
  const { run, toast } = useUI();
  const [g, setG] = useState({ kcal: goal?.kcal ?? 2000, protein: goal?.protein ?? 100, carbs: goal?.carbs ?? 250, fat: goal?.fat ?? 70 });
  const [c, setC] = useState({ sex: 'female', age: 30, height: 170, weight: 70, activity: 1.375, goal: 'maintain' });
  const sg = k => e => setG(s => ({ ...s, [k]: e.target.value })); const sc = k => e => setC(s => ({ ...s, [k]: e.target.value }));
  return (
    <Section icon="🎯" name="Nutrition goals" hint="Daily targets shown on Home and Meal Plan">
      <div className="goalgrid">{[['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']].map(([k, l, u]) => (
        <label key={k} className={`goalin ${k}`}><span>{l}</span><div><input type="number" min="0" step="any" value={g[k]} onChange={sg(k)} /><em>{u}</em></div></label>))}</div>
      <button className="btn" style={{ marginTop: 14 }} onClick={() => run(() => api.setGoal({ kcal: Math.round(+g.kcal), protein: +g.protein, carbs: +g.carbs, fat: +g.fat }), 'Goals saved')}>Save goals</button>
      <details className="calc"><summary>Calorie calculator</summary>
      <div className="field-row">
        <Field label="Sex"><Select value={c.sex} onChange={sc('sex')} options={[['female', 'Female'], ['male', 'Male']]} /></Field>
        <Field label="Age"><input type="number" value={c.age} onChange={sc('age')} /></Field>
        <Field label="Height cm"><input type="number" value={c.height} onChange={sc('height')} /></Field>
        <Field label="Weight kg"><input type="number" value={c.weight} onChange={sc('weight')} /></Field>
        <Field label="Activity"><Select value={c.activity} onChange={sc('activity')} options={[[1.2, 'Sedentary'], [1.375, 'Light'], [1.55, 'Moderate'], [1.725, 'Very active']]} /></Field>
        <Field label="Goal"><Select value={c.goal} onChange={sc('goal')} options={[['lose', 'Lose weight'], ['maintain', 'Maintain weight'], ['build', 'Build muscle']]} /></Field>
      </div>
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => { setG(calc({ sex: c.sex, age: +c.age, heightCm: +c.height, weightKg: +c.weight, activity: +c.activity, goal: c.goal })); toast('Targets filled in — press Save goals'); }}>Suggest targets</button>
      </details>
    </Section>
  );
}

function Diet({ dp, tags, allergens, itags }) {
  const { run } = useUI();
  const [diet, td] = useSet(dp.diet_tag_ids); const [alg, ta] = useSet(dp.allergen_codes); const [ex, te] = useSet(dp.exclude_ingredient_tags);
  return (
    <Section icon="🥗" name="Dietary preferences" hint="Used when suggesting and generating meals">
      <label>Diets</label><Chips options={tags.map(t => [t.id, t.name])} selected={diet} onToggle={td} />
      <label>Allergens to avoid</label><Chips options={allergens.map(a => [a.code, a.name])} selected={alg} onToggle={ta} />
      {itags.length > 0 && <><label>Exclude ingredient tags</label><Chips options={itags.map(t => [t.id, t.name])} selected={ex} onToggle={te} /></>}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => run(() => api.setDietaryPrefs({ diet_tag_ids: [...diet], allergen_codes: [...alg], exclude_ingredient_tags: [...ex] }), 'Preferences saved')}>Save</button>
    </Section>
  );
}

function Notifications({ initial }) {
  const { run } = useUI();
  const [prefs, setPrefs] = useState({ ...Object.fromEntries(Object.keys(NOTIFICATION_KEYS).map(k => [k, false])), ...initial });
  return (
    <Section icon="🔔" name="Notifications" hint="Saved to your account; reminders are delivered by the iPhone app.">
      <div className="rows">{Object.entries(NOTIFICATION_KEYS).map(([k, l]) => (
        <label key={k} className={'toggle' + (k === 'master' ? ' master' : '')}>
          <span>{l}</span>
          <input type="checkbox" className="switch" checked={prefs[k]} onChange={async e => { const next = { ...prefs, [k]: e.target.checked }; setPrefs(next); await run(() => api.setNotifPrefs(next)); }} />
        </label>))}</div>
    </Section>
  );
}

function Water() {
  const { toast } = useUI(); const ws = waterSettings.get();
  const [goal, setGoal] = useState(ws.dailyGoalMilliliters); const [glass, setGlass] = useState(ws.glassMilliliters);
  return (
    <Section icon="💧" name="Water" hint="Stored on this device">
      <div className="field-row"><Field label="Daily goal (ml)"><input type="number" step="50" value={goal} onChange={e => setGoal(e.target.value)} /></Field>
        <Field label="Glass size (ml)"><input type="number" step="50" value={glass} onChange={e => setGlass(e.target.value)} /></Field></div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => { waterSettings.set({ dailyGoalMilliliters: Math.min(6000, Math.max(500, +goal || 2000)), glassMilliliters: Math.min(1000, Math.max(50, +glass || 250)) }); toast('Saved'); }}>Save</button>
    </Section>
  );
}

const SectionLoader = ({ state, name, icon, children }) =>
  state.data ? children(state.data)
    : <Section icon={icon} name={name}>{state.error ? <div className="muted">Couldn't load: {state.error.message}</div> : <Loader size={36} />}</Section>;

function Quotas({ q }) {
  const gen = q.features?.meal_plan_generation;
  const rows = Object.values(q.quotas ?? {});
  return (
    <Section icon="📊" name="Usage & limits" hint={`${title(q.tier)} plan`}>
      <div className="rows">
        {rows.map(r => {
          const full = r.available <= 0;
          return (
            <div key={r.resource} style={{ marginBottom: 10 }}>
              <div className="toggle"><span>{title(String(r.resource).replace(/_/g, ' '))}</span><strong style={full ? { color: 'var(--danger, #c0392b)' } : undefined}>{r.used} / {r.limit}</strong></div>
              <progress value={r.used} max={r.limit || 1} style={{ width: '100%' }} />
            </div>
          );
        })}
        {gen && (
          <div style={{ marginBottom: 10 }}>
            <div className="toggle"><span>Meal plan generations</span>
              <strong>{gen.enabled ? `${gen.used ?? 0} / ${gen.limit}` : 'Not on your plan'}</strong></div>
            {gen.enabled && <><progress value={gen.used ?? 0} max={gen.limit || 1} style={{ width: '100%' }} />
              {gen.resets_at && <div className="muted">Resets {new Date(gen.resets_at).toLocaleDateString()}</div>}</>}
          </div>
        )}
      </div>
    </Section>
  );
}

const APPLE_SUBS_URL = 'https://apps.apple.com/account/subscriptions';

function Subscription({ account }) {
  const a = account;
  const active = a && !['free', 'none'].includes(String(a.tier ?? 'free').toLowerCase());
  const renews = a?.current_period_end ?? a?.expires_at ?? a?.expires_date;
  return (
    <Section icon="⭐" name="Subscription" hint="Subscriptions are billed through the App Store">
      <div className="rows">
        <div className="toggle"><span>Plan</span><strong>{a ? title(a.tier ?? 'free') : '—'}</strong></div>
        <div className="toggle"><span>Status</span><strong>{a ? title(a.subscription_status ?? 'none') : '—'}</strong></div>
        {renews && <div className="toggle"><span>{a.will_renew === false ? 'Ends' : 'Renews'}</span><strong>{new Date(renews).toLocaleDateString()}</strong></div>}
      </div>
      <a className="btn" style={{ marginTop: 12, display: 'inline-block' }} href={a?.management_url || APPLE_SUBS_URL} target="_blank" rel="noreferrer">
        {active ? 'Manage subscription' : 'Subscription settings'}
      </a>
      {!active && <div className="muted" style={{ marginTop: 8 }}>To subscribe, open Forkplan on your iPhone and choose a plan. It will unlock here automatically.</div>}
    </Section>
  );
}

export default function Account({ signOut }) {
  const { run, confirm } = useUI();
  const navigate = useNavigate();
  // Each section loads independently so the page renders instantly and one slow call can't block the rest.
  const acct = useAsync(async () => { const r = await post('/v1/account'); session.account = r; return r; });
  const goal = useAsync(() => api.goal());
  const prefs = useAsync(async () => {
    const [dp, tags, allergens, itags] = await Promise.all([api.dietaryPrefs().catch(() => ({ diet_tag_ids: [], allergen_codes: [], exclude_ingredient_tags: [] })),
      cached('diet-tags', api.dietTags), cached('allergens', api.allergens), cached('itags', api.ingredientTags)]);
    return { dp, tags, allergens, itags };
  });
  const quota = useAsync(() => api.quota());
  const notif = useAsync(() => api.notifPrefs().catch(() => ({ preferences: {} })));
  const a = acct.data ?? session.account;
  const email = a?.email ?? a?.user_email;
  return (
    <Page title="Account">
      <div className="acct">
        <div className="profile">
          <div className="avatar">{(email ?? 'F')[0].toUpperCase()}</div>
          <div className="grow"><h2>{email ?? 'Your account'}</h2>{a && <div className="muted">{title(a.tier)} plan · {title(a.subscription_status)}</div>}</div>
          <button className="btn ghost" onClick={async () => { await auth.signOut(); signOut(); }}>Sign out</button>
        </div>
        <div className="acct-grid">
          <div className="acct-col">
            <Subscription account={a} />
            <SectionLoader state={quota} icon="📊" name="Usage & limits">{q => <Quotas q={q} />}</SectionLoader>
            <SectionLoader state={goal} icon="🎯" name="Nutrition goals">{g => <Goals goal={g} />}</SectionLoader>
            <Water />
          </div>
          <div className="acct-col">
            <SectionLoader state={prefs} icon="🥗" name="Dietary preferences">{d => <Diet dp={d.dp} tags={d.tags} allergens={d.allergens} itags={d.itags} />}</SectionLoader>
            <SectionLoader state={notif} icon="🔔" name="Notifications">{n => <Notifications initial={n.preferences} />}</SectionLoader>
            <Section icon="🧭" name="App tour" hint="See the quick tips for each page again.">
              <button className="btn ghost" onClick={() => { resetTour(); navigate('/'); }}>Replay app tour</button>
            </Section>
          </div>
        </div>
        <section className="scard danger-zone">
          <div className="shead"><span className="sico">⚠️</span><div><h3>Danger zone</h3><div className="muted">Permanently delete your account and all of its data. Deleting does not cancel an App Store subscription — cancel it first.</div></div>
            <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={async () => { if (await confirm('Permanently delete your account and all data? This cannot be undone.', 'Delete my account') && await run(() => auth.deleteAccount())) { await auth.signOut(); signOut(); } }}>Delete account</button></div>
        </section>
      </div>
    </Page>
  );
}
