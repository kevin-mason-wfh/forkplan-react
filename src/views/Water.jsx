import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isoDate, mondayOf, waterSettings } from '../api.js';
import { Page, useAsync, useUI } from '../ui.jsx';

const MAX_ML = 10000, DEBOUNCE = 500, PRESETS = [100, 250, 330, 500, 750];
const clamp = v => Math.min(MAX_ML, Math.max(0, Math.round(v)));
const litres = ml => (ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 2).replace(/0+$/, '').replace(/\.$/, '');

function Ring({ ml, goal }) {
  const R = 78, C = 2 * Math.PI * R, pct = goal ? Math.min(1, ml / goal) : 0;
  return (
    <div className="ring wring">
      <svg viewBox="0 0 190 190">
        <circle cx="95" cy="95" r={R} className="ring-bg" />
        <circle cx="95" cy="95" r={R} className="ring-fg" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 95 95)" />
      </svg>
      <div className="ring-mid"><b>{litres(ml)} L</b><span>of {litres(goal)} L</span></div>
    </div>
  );
}

function AddAmount({ left, close, onAdd }) {
  const [v, setV] = useState(Math.min(250, left));
  const amt = Math.min(left, Math.max(0, Math.round(+v || 0)));
  return (<>
    <label>Amount (ml)</label>
    <input type="number" min="50" step="50" max={left} value={v} onChange={e => setV(e.target.value)} autoFocus />
    <div style={{ margin: '10px 0' }}>{PRESETS.filter(p => p <= left).map(p => <button key={p} type="button" className={'chip' + (amt === p ? ' sel' : '')} onClick={() => setV(p)}>{p} ml</button>)}</div>
    <button className="btn" disabled={amt <= 0} onClick={() => { onAdd(amt); close(); }}>Add {amt} ml</button>
  </>);
}

export default function Water() {
  const { run, toast, openModal } = useUI();
  const [today] = useState(() => isoDate(new Date()));   // the day this screen logs to, even if it stays open past midnight
  const monday = mondayOf();
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return isoDate(d); });
  const ws = waterSettings.get();
  const glass = ws.glassMilliliters, goal = ws.dailyGoalMilliliters;
  const goalGlasses = Math.min(20, Math.ceil(goal / glass));

  const state = useAsync(async () => {
    // A failed week query falls back to today only (ring shown, chart hidden).
    try { return { entries: await api.water(week[0], week[6]), weekOk: true }; }
    catch { return { entries: await api.water(today, today), weekOk: false }; }
  });
  const [ml, setMl] = useState(null);                    // live value
  const committed = useRef(0);                           // last value the server confirmed
  const live = useRef(0); const timer = useRef(null);
  useEffect(() => {
    if (!state.data) return;
    const v = state.data.entries.find(e => e.date === today)?.ml ?? 0;
    committed.current = v; live.current = v; setMl(v);
  }, [state.data, today]);

  const save = useCallback(async () => {
    clearTimeout(timer.current); timer.current = null;
    const v = live.current;
    if (v === committed.current) return;
    try { const r = await api.setWater(today, v); committed.current = r?.ml ?? v; }
    catch (e) { live.current = committed.current; setMl(committed.current); toast(`Couldn't save your water: ${e.message}`, true); }
  }, [today, toast]);
  const change = v => { v = clamp(v); live.current = v; setMl(v); clearTimeout(timer.current); timer.current = setTimeout(save, DEBOUNCE); };
  useEffect(() => () => { if (timer.current) save(); }, [save]);   // flush a pending change when leaving the screen

  const tapGlass = n => change(ml === n * glass ? (n - 1) * glass : n * glass);
  const full = Math.floor((ml ?? 0) / glass), part = (ml ?? 0) % glass > 0;
  const weekMl = week.map(d => (d === today ? ml ?? 0 : state.data?.entries.find(e => e.date === d)?.ml ?? 0));
  const top = Math.max(goal, ...weekMl, 1);

  return (
    <Page title="💧 Water Log" state={state} busy={ml == null && !state.error}>
      {ml != null && <div className="water-page">
        <div className="card wcard">
          <Ring ml={ml} goal={goal} />
          <p className="muted" style={{ textAlign: 'center', fontSize: 15 }}>{(ml / glass).toFixed(ml % glass ? 1 : 0)} of {goalGlasses} glasses · {glass} ml each</p>
          <div className="glasses" role="group" aria-label="Glasses of water">
            {Array.from({ length: goalGlasses }, (_, i) => {
              const n = i + 1, st = n <= full ? 'full' : n === full + 1 && part ? 'part' : '';
              return <button key={n} type="button" className={'glass ' + st} aria-label={`Glass ${n}`} aria-pressed={!!st} onClick={() => tapGlass(n)}>
                <i style={st === 'part' ? { height: `${((ml % glass) / glass) * 100}%` } : undefined} />
              </button>;
            })}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn ghost grow" disabled={ml <= 0} onClick={() => change(ml - glass)}>− Remove</button>
            <button className="btn grow" disabled={ml >= MAX_ML} onClick={() => change(ml + glass)}>+ Add glass</button>
          </div>
          <button className="glink linkbtn" disabled={ml >= MAX_ML} onClick={() => openModal('Add water', close => <AddAmount left={MAX_ML - ml} close={close} onAdd={a => change(ml + a)} />)}>Add a different amount</button>
          <p className="muted" style={{ textAlign: 'center', margin: '8px 0 0' }}>Goal and glass size are set in <Link to="/account" className="glink">Account</Link>. Saved on this device.</p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 18 }}>This Week</h2>
          {state.data.weekOk ? (
            <div className="bars" role="img" aria-label="Water this week">
              {week.map((d, i) => (
                <div key={d} className={'bcol' + (d === today ? ' today' : '')} title={`${weekMl[i]} ml`}>
                  <span className="bval">{weekMl[i] ? litres(weekMl[i]) : ''}</span>
                  <div className="btrack"><i className={weekMl[i] >= goal ? 'hit' : ''} style={{ height: `${(weekMl[i] / top) * 100}%` }} /></div>
                  <span className="blab">{new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          ) : <p className="muted">Couldn't load this week's history.</p>}
          <Link to="/nutrition" className="glink" style={{ display: 'block', marginTop: 14 }}>View Nutrition Summary →</Link>
        </div>
      </div>}
    </Page>
  );
}
