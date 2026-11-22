import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { activity } from './api.js';

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

const FOODS = ['🥕', '🍳', '🥑', '🍋', '🧅', '🍅'];
/** Visual loader: orbiting food emoji around a ring. */
export const Loader = ({ label, size = 56 }) => (
  <div className="loader" role="status" aria-live="polite" style={{ '--s': size + 'px' }}>
    <div className="loader-ring"><i /><span>{FOODS.map((f, i) => <b key={i} style={{ '--i': i }}>{f}</b>)}</span></div>
    {label && <div className="loader-label">{label}</div>}
  </div>
);

/** Global activity indicator: top shimmer bar for any request, floating pill for saves. */
function Busy() {
  const [a, setA] = useState({ reads: 0, writes: 0 });
  const [pill, setPill] = useState(false);
  useEffect(() => activity.subscribe(setA), []);
  useEffect(() => {
    if (!a.writes) { setPill(false); return; }
    const t = setTimeout(() => setPill(true), 150); // skip flicker for instant calls
    return () => clearTimeout(t);
  }, [a.writes]);
  const on = a.reads + a.writes > 0;
  return (<>
    <div className={'topbar' + (on ? ' on' : '')} aria-hidden="true"><i /></div>
    {pill && <div className="busy-pill" role="status" aria-live="polite"><Loader size={28} /><span>Working…</span></div>}
  </>);
}

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [modals, setModals] = useState([]);
  const toast = useCallback((message, err = false) => {
    const id = Math.random();
    setToasts(t => [...t, { id, message, err }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), err ? 6000 : 3000);
  }, []);
  /** Run an async action; toast errors. Returns result (or true), undefined on failure. */
  const run = useCallback(async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
    catch (e) { toast(e.message || String(e), true); return undefined; }
  }, [toast]);
  const openModal = useCallback((title, render, opts = {}) => {
    const id = Math.random();
    const close = () => setModals(m => m.filter(x => x.id !== id));
    setModals(m => [...m, { id, title, render, close, sheet: !!opts.sheet }]);
    return close;
  }, []);
  const confirm = useCallback((message, label = 'Delete') => new Promise(resolve => {
    openModal('Are you sure?', close => (
      <>
        <p>{message}</p>
        <div className="row">
          <button className="btn danger" onClick={() => { close(); resolve(true); }}>{label}</button>
          <button className="btn ghost" onClick={() => { close(); resolve(false); }}>Cancel</button>
        </div>
      </>
    ));
  }), [openModal]);

  return (
    <Ctx.Provider value={{ toast, run, openModal, confirm }}>
      {children}
      <Busy />
      <div id="toasts">{toasts.map(t => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.message}</div>)}</div>
      {modals.map(m => (
        <div key={m.id} className="overlay" onClick={e => { if (e.target === e.currentTarget) m.close(); }}>
          {m.sheet ? <div className="sheet">{m.render(m.close)}</div> : <div className="modal"><h2>{m.title}</h2>{m.render(m.close)}</div>}
        </div>
      ))}
    </Ctx.Provider>
  );
}

/** Load async data; returns {data, error, loading, reload}. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true, error: null }));
    fn().then(data => live && setState({ data, error: null, loading: false }), error => live && setState({ data: null, error, loading: false }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick(t => t + 1) };
}

/** `state` may be one useAsync result or an array of them; the single global Loader shows until all have data. `busy` forces it on. */
const FillWrap = ({ children }) => <div className="fillpage">{children}</div>;
const Frag = ({ children }) => <>{children}</>;
/** True only once `on` has been true for `ms`, so fast loads never flash the loader. */
function useDelayed(on, ms = 200) {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!on) { setV(false); return; }
    const t = setTimeout(() => setV(true), ms);
    return () => clearTimeout(t);
  }, [on, ms]);
  return v;
}
export function Page({ title, actions, state, busy, fill, sticky, children }) {
  const stickRef = useRef(null);
  useEffect(() => {
    const el = stickRef.current; if (!el) return;
    const set = () => el.parentElement.style.setProperty('--stickh', el.offsetHeight + 'px');
    set(); const ro = new ResizeObserver(set); ro.observe(el); return () => ro.disconnect();
  });
  const Wrap = fill ? FillWrap : Frag;
  const states = [].concat(state ?? []);
  const error = states.find(s => s?.error)?.error;
  const loading = busy || states.some(s => s?.loading && !s.data);
  const showLoader = useDelayed(loading);
  return (
    <Wrap>
      {sticky && !error && !loading
        ? <div className="pg-sticky" ref={stickRef}><div className="head"><h1>{title}</h1>{actions}</div>{sticky}</div>
        : <div className="head"><h1>{title}</h1>{actions}</div>}
      {error ? <div className="card"><p>Couldn't load: {error.message}</p></div> : loading ? (showLoader ? <Loader label="Loading…" /> : null) : children}
    </Wrap>
  );
}

export const Field = ({ label, children }) => <div><label>{label}</label>{children}</div>;
export const Select = ({ options, ...props }) => (
  <select {...props}>{options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}</select>
);
export const Chips = ({ options, selected, onToggle }) => (
  <div>{options.map(([k, l]) => <button type="button" key={k} className={'chip' + (selected.has(k) ? ' sel' : '')} onClick={() => onToggle(k)}>{l}</button>)}</div>
);
export const num = v => (v == null || Number.isNaN(+v) ? '—' : (Math.round(+v * 100) / 100).toString());
export function useSet(initial) {
  const [s, set] = useState(() => new Set(initial));
  return [s, k => set(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }), () => set(new Set())];
}

export const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  </svg>
);
export const PencilIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
);
