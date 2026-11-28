import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { userEmail } from './api.js';

/*
 * First-run onboarding: dims the page and spotlights real buttons (marked with data-tour="…").
 * Each page's tour plays once. "Don't show tips again" turns off every remaining tour.
 *
 * A tour may declare `needs`: a target that only exists once the user has data (e.g. a pantry).
 * Until it exists, the short `starter` tour runs instead, and the full tour plays as soon as it appears.
 * A step whose target isn't on screen is shown as a centred card.
 */
const TOURS = {
  '/': {
    steps: [
      { title: 'Welcome to Forkplan 👋', text: <>Forkplan helps you plan your meals, cook with what you have and make your shopping list. Here's a quick look — it takes under a minute.</> },
      { target: 'home-today', title: "Today's meals", text: <>The meals you've planned for today show here. After you eat one, tap <b>Log</b> and your calories update.</> },
      { target: 'shortcut:/plan', title: '📅 Meal Plan', text: <>Choose what you'll eat each day of the week. <b>This is the best place to start.</b></> },
      { target: 'shortcut:/recipes', title: '📖 Recipes', text: <>Your own recipes, plus a catalog of ready-made ones you can add to your plan.</> },
      { target: 'shortcut:/pantry', title: '🥫 Pantry', text: <>Keep a list of the food you have at home, and get ideas for meals you can cook with it.</> },
      { target: 'shortcut:/shopping', title: '🛒 Shopping', text: <>Turn your meal plan into a shopping list in one tap. Each page shows its own quick tips the first time you open it.</> },
    ],
  },
  '/plan': {
    needs: 'plan-days',
    starter: [
      { target: 'plan-new', title: 'Make your first plan', text: <>Tap <b>+</b> to create a meal plan for this week. Give it a name and tap <b>Create</b>.</> },
    ],
    steps: [
      { target: 'plan-days', title: 'Pick a day', text: <>Tap a day to see its meals. The coloured dots show which meals are already planned.</> },
      { target: 'plan-add', title: 'Add a meal', text: <>Tap <b>Add breakfast</b> (or lunch, dinner…) and choose a recipe. You can change the number of servings before adding it.</> },
      { target: 'plan-eaten', title: 'Mark it as eaten', text: <>Tap the circle when you've eaten a meal. It gets a tick and counts towards today's calories.</>,
        missing: <>Once you've added a meal, tap the circle beside it when you've eaten it. It then counts towards today's calories.</> },
      { target: 'plan-more', title: 'More options', text: <>Tap <b>⋯</b> to see your meal history, print the week, or <b>Move to this week</b> to reuse an old plan.</> },
      { target: 'plan-new', title: 'Plan another week', text: <>Tap <b>+</b> to start a new plan for another week.</> },
    ],
  },
  '/recipes': {
    steps: [
      { target: 'recipes-source', title: 'Your recipes and the catalog', text: <><b>Mine</b> shows recipes you've saved. <b>Catalog</b> has ready-made recipes you can use straight away.</> },
      { target: 'recipes-card', title: 'Open a recipe', text: <>Tap any recipe to see its ingredients and method. Then tap <b>Add to Meal Plan</b> to put it on a day.</>,
        missing: <>Tap any recipe to see its ingredients and method. Then tap <b>Add to Meal Plan</b> to put it on a day.</> },
      { target: 'recipes-new', title: 'Add your own', text: <>Tap <b>+</b> to write your own recipe.</> },
      { title: 'Change a catalog recipe', text: <>Catalog recipes can't be edited directly. Open one and tap <b>Copy to my recipes</b>, then edit your copy.</> },
    ],
  },
  '/pantry': {
    needs: 'pantry-add',
    starter: [
      { target: 'pantry-more', title: 'Set up your pantry', text: <>Your pantry is a list of the food you have at home. To start, tap <b>⋯</b> and choose <b>New pantry</b>.</> },
    ],
    steps: [
      { target: 'pantry-add', title: 'Add food', text: <>Tap <b>+</b> to add something you have at home, like eggs or rice.</> },
      { target: 'pantry-stock', title: 'Update amounts', text: <>Use <b>−</b> and <b>+</b> to change how much you have. When it reaches 0 it shows as <b>Out of stock</b>.</>,
        missing: <>Once you've added food, use <b>−</b> and <b>+</b> on each item to change how much you have.</> },
      { target: 'pantry-more', title: 'What can I cook?', text: <>Tap <b>⋯</b> then <b>Meal suggestions</b> to see recipes you can make with what you have.</> },
    ],
  },
  '/shopping': {
    needs: 'shop-more',
    starter: [
      { target: 'shop-new', title: 'Make your shopping list', text: <>Tap <b>+</b>, choose your meal plan and tap <b>Generate</b>. Forkplan adds up every ingredient for you, and leaves out food already in your pantry.</> },
    ],
    steps: [
      { target: 'shop-tick', title: 'Tick as you shop', text: <>Tap the box next to an item once it's in your basket.</>,
        missing: <>Tap the box next to each item once it's in your basket.</> },
      { target: 'shop-more', title: 'Add or update', text: <>Tap <b>⋯</b> to add an extra item, or <b>Regenerate</b> to update the list after changing your meal plan.</> },
      { target: 'shop-new', title: 'A new list', text: <>Tap <b>+</b> to make a list for another week.</> },
    ],
  },
};

const storeKey = () => 'fp.tour.' + (userEmail() || 'me');
const load = () => { try { return JSON.parse(localStorage.getItem(storeKey())) ?? {}; } catch { return {}; } };
const save = s => { try { localStorage.setItem(storeKey(), JSON.stringify(s)); } catch { /* ignore */ } };
/** Clear seen/off so every tour plays again. */
export const resetTour = () => save({});

/** First visible element with this data-tour name. */
const find = name => name ? [...document.querySelectorAll(`[data-tour="${name}"]`)].find(el => el.getClientRects().length && el.offsetWidth) : null;
const isReady = () => document.querySelector('main .head') && !document.querySelector('main .loader, .overlay');

export default function Tour() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(null); // { id, steps }
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setActive(null);
    const tour = TOURS[pathname];
    if (!tour) return;
    let settled = 0;
    // Wait until the page has finished loading and held still for ~0.8s, so we point at real content.
    const t = setInterval(() => {
      const s = load();
      if (s.off || s.seen?.[pathname]) return clearInterval(t);
      settled = isReady() ? settled + 1 : 0;
      if (settled < 4) return;
      const full = !tour.needs || find(tour.needs);
      const id = full ? pathname : pathname + '#starter';
      if (!full && s.seen?.[id]) return; // starter already shown: keep watching for the full tour's content
      clearInterval(t);
      setActive({ id, steps: (full ? tour.steps : tour.starter).map(st => ({ ...st, text: !st.target || find(st.target) ? st.text : st.missing ?? st.text })) });
    }, 200);
    return () => clearInterval(t);
  }, [pathname, nonce]);
  if (!active) return null;
  const close = off => {
    const s = load();
    save({ ...s, off: s.off || off, seen: { ...s.seen, [active.id]: true } });
    setActive(null);
    setNonce(n => n + 1);
  };
  return <Spotlight key={active.id} steps={active.steps} onClose={close} />;
}

const PAD = 6, GAP = 14, EDGE = 16;
const same = (a, b) => a === b || (a && b && ['left', 'top', 'width', 'height'].every(k => Math.round(a[k]) === Math.round(b[k])));

function Spotlight({ steps, onClose }) {
  const [i, setI] = useState(0);
  const [off, setOff] = useState(false);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const bubble = useRef(null), next = useRef(null);
  const step = steps[i], last = i === steps.length - 1;

  // Track the target's position while it scrolls into view or the layout shifts.
  useEffect(() => {
    const el = find(step.target);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const measure = () => { const e = find(step.target); const r = e?.getBoundingClientRect() ?? null; setRect(p => (same(p, r) ? p : r)); };
    measure();
    const t = setInterval(measure, 150);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    next.current?.focus();
    return () => { clearInterval(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step]);

  // Place the bubble below the target, else above, else pinned to the bottom; always on screen.
  useLayoutEffect(() => {
    const b = bubble.current; if (!b) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = b.offsetWidth, h = b.offsetHeight;
    let left = (vw - w) / 2, top = Math.max(EDGE, (vh - h) / 2);
    if (rect) {
      left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - w / 2), vw - w - EDGE);
      if (rect.bottom + PAD + GAP + h <= vh - EDGE) top = rect.bottom + PAD + GAP;
      else if (rect.top - PAD - GAP - h >= EDGE) top = rect.top - PAD - GAP - h;
      else top = vh - h - EDGE;
    }
    setPos(p => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [rect, step]);

  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(off); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [off, onClose]);

  return (
    <>
      <div className="tour-block" />
      {rect ? <div className="tour-hole" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} /> : <div className="tour-dim" />}
      <div ref={bubble} className="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
        {steps.length > 1 && <div className="tour-step">Step {i + 1} of {steps.length}</div>}
        <h3 id="tour-title">{step.title}</h3>
        <p>{step.text}</p>
        <label className="tour-off"><input type="checkbox" checked={off} onChange={e => setOff(e.target.checked)} />Don't show tips again</label>
        <div className="tour-foot">
          {!last && <button className="tour-skip" onClick={() => onClose(off)}>Skip</button>}
          {last && <span className="grow" />}
          {i > 0 && <button className="btn ghost" onClick={() => setI(i - 1)}>Back</button>}
          <button ref={next} className="btn" onClick={() => (last ? onClose(off) : setI(i + 1))}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </>
  );
}
