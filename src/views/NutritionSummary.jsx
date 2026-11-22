import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isoDate } from '../api.js';
import { fmt } from '../nutrition.jsx';
import { Page, useAsync } from '../ui.jsx';
import { currentStreak, periodBounds, summarize, totalsByDay } from '../stats.js';

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Fetch consumptions from the comparison period's start (padded a day for UTC/local skew), then extend back for the streak. */
async function load(period) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [goal] = await Promise.all([api.goal().catch(() => null)]);
  const floor = addDays(today, -365);
  let from = periodBounds(period, today).prevStart;
  let rows = await api.consumptions(isoDate(addDays(from, -1)), isoDate(addDays(today, 1)));
  let days = totalsByDay(rows);
  // Extend 28 days at a time while the streak still reaches the earliest covered day.
  while (from > floor && currentStreak(days, today) >= Math.round((today - from) / 864e5)) {
    const next = addDays(from, -28);
    rows = rows.concat(await api.consumptions(isoDate(addDays(next, -1)), isoDate(addDays(from, -1))));
    from = next; days = totalsByDay(rows);
  }
  return { goal, days };
}

const MACROS = [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']];

export default function NutritionSummary() {
  const [period, setPeriod] = useState('week');
  const state = useAsync(() => load(period), [period]);
  const { goal, days } = state.data ?? {};
  const s = days ? summarize(days, period) : null;
  const target = goal?.kcal ? +goal.kcal : null;
  const top = s ? Math.max(target ?? 0, ...s.bars.map(b => b.value), 1) : 1;
  const trend = s?.trendPercent;

  return (
    <Page title="📊 Nutrition Summary" state={state} actions={<div className="seg srctoggle" style={{ margin: 0 }}>{[['week', 'Week'], ['month', 'Month']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>}>
      {s && !s.hasLogs ? (
        <div className="card" style={{ textAlign: 'center' }}><div style={{ fontSize: 40 }}>🍽</div><h3>No meals logged yet</h3>
          <p className="muted">Log meals to see your averages for this {period}.</p><Link to="/plan" className="btn">Go to Meal Plan</Link></div>
      ) : s && (
        <div className="summary">
          <div className="card">
            <div className="row between"><h2 style={{ fontSize: 18 }}>Average calories</h2>
              {trend != null && <span className="muted" title={`vs previous ${period}`}>{trend > 0 ? '↑' : trend < 0 ? '↓' : ''}{Math.abs(trend)}% vs last {period}</span>}</div>
            <div className="wval"><b>{Math.round(s.avg.kcal).toLocaleString()}</b> kcal / logged day</div>
            <p className="muted" style={{ margin: '0 0 12px' }}>{target ? `Daily target ${target.toLocaleString()} kcal` : 'No daily target set'}</p>
            <div className="bars" role="img" aria-label={`Calories this ${period}`}>
              {s.bars.map(b => (
                <div key={b.label} className="bcol" title={`${Math.round(b.value)} kcal`}>
                  <span className="bval">{b.value ? Math.round(b.value) : ''}</span>
                  <div className="btrack"><i className={target && b.value > target ? 'over' : 'hit'} style={{ height: `${(b.value / top) * 100}%` }} /></div>
                  <span className="blab">{b.label}</span>
                </div>
              ))}
            </div>
            {period === 'month' && <p className="muted" style={{ margin: '8px 0 0' }}>Bars show each week's average over logged days.</p>}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 18 }}>Average macros</h2>
            <div className="mbars" style={{ marginTop: 12 }}>
              {MACROS.map(([k, l]) => (
                <div key={k} className={`mb ${k}`}>
                  <div className="row between" style={{ flexWrap: 'nowrap' }}><span className="mb-n"><i />{l}</span>
                    <span className="muted">{fmt(s.avg[k])}g{goal?.[k] ? ` / ${fmt(goal[k])}g` : ' avg'}</span></div>
                  <div className="mb-bar"><i style={{ width: `${goal?.[k] ? Math.min(100, (s.avg[k] / goal[k]) * 100) : 0}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="stat-tiles">
            <div className="card stat"><b>🔥 {s.streak}</b><span>day{s.streak === 1 ? '' : 's'} logging streak</span></div>
            <div className="card stat"><b>{s.daysLoggedPercent}%</b><span>Days logged</span></div>
          </div>
        </div>
      )}
    </Page>
  );
}
