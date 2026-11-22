import { useEffect, useRef, useState } from 'react';
import { Chips, Select } from './ui.jsx';

/** Chip group showing the first `limit` options (plus any selected) with a "+N more" toggle. */
export function ChipGroup({ label, options, selected, onToggle, limit = 4 }) {
  const [open, setOpen] = useState(false);
  const shown = open ? options : options.filter(([k], i) => i < limit || selected.has(k));
  const hidden = options.length - shown.length;
  return (
    <div className="chipgroup">
      <label>{label}{selected.size > 0 && <span className="badge">{selected.size}</span>}</label>
      <div>
        <Chips options={shown} selected={selected} onToggle={onToggle} />
        {options.length > limit && (hidden > 0 || open) && <button type="button" className="chip more" onClick={() => setOpen(o => !o)}>{open ? 'Show less ▴' : `+${hidden} more ▾`}</button>}
      </div>
    </div>
  );
}

export const ViewToggle = ({ value, onChange, first = 'cards', second = 'list' }) => (
  <div className="viewtoggle" role="group" aria-label="View">
    <button className={value === first ? 'on' : ''} title="Card view" aria-label="Card view" onClick={() => onChange(first)}>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="2" /><rect x="11" y="2" width="7" height="7" rx="2" /><rect x="2" y="11" width="7" height="7" rx="2" /><rect x="11" y="11" width="7" height="7" rx="2" /></svg>
    </button>
    <button className={value === second ? 'on' : ''} title="List view" aria-label="List view" onClick={() => onChange(second)}>
      <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><rect x="2" y="3" width="16" height="3.5" rx="1.75" /><rect x="2" y="8.25" width="16" height="3.5" rx="1.75" /><rect x="2" y="13.5" width="16" height="3.5" rx="1.75" /></svg>
    </button>
  </div>
);

/**
 * Shared header + filter bar for Recipes, Ingredients and Pantry.
 *  title/actions       compact mode (Recipes / Ingredients): title, source toggle and add button share ONE slim sticky bar
 *                      with the search, sort, view toggle and a Filters dropdown; category chips sit in a thin row beneath.
 *  tabs/tab/onTab      source tabs (Pantry layout)
 *  above               optional node between the tabs and the filter card (e.g. stat tiles)
 *  query/onQuery       search box
 *  sort                { value, onChange, options }              (optional)
 *  view                { value, onChange, first?, second? }      (optional card/list toggle)
 *  cats                [{ key, label, emoji, color, count }]     (optional category chips) + cat / onCat / total
 *  groups              [{ label, options, selected: Set, onToggle }]  (optional chip groups)
 *  toggle              { label, checked, onChange }              (optional checkbox)
 *  filtered/onClear    shows the "Clear filters" button
 */
const Chevron = () => <svg viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1.5l5 5 5-5" /></svg>;

function CatBar({ cats, cat, onCat, total }) {
  return (
    <div className="catbar">
      <button className={'cat' + (cat === 'ALL' ? ' on' : '')} style={{ '--c': '#1f9d4a' }} onClick={() => onCat('ALL')}>✨ All <small>{total}</small></button>
      {cats.map(c => <button key={c.key} className={'cat' + (cat === c.key ? ' on' : '')} style={{ '--c': c.color }} onClick={() => onCat(cat === c.key ? 'ALL' : c.key)}>{c.emoji} {c.label} <small>{c.count}</small></button>)}
    </div>
  );
}

export default function ListToolbar({ title, actions, tabs, tab, onTab, above, query, onQuery, placeholder = 'Search…', sort, view, cats, cat, onCat, total, groups = [], toggle, filtered, onClear }) {
  const [fOpen, setFOpen] = useState(false);
  const pop = useRef(null);
  const active = groups.reduce((n, g) => n + (g.selected?.size ?? 0), 0) + (toggle?.checked ? 1 : 0);
  const compact = title != null || !!actions;

  useEffect(() => {
    if (!fOpen || !compact) return undefined;
    const down = e => { if (pop.current && !pop.current.contains(e.target)) setFOpen(false); };
    const key = e => { if (e.key === 'Escape') setFOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [fOpen, compact]);

  if (compact) {
    return (
      <div className="tb-sticky">
        <div className="tb-bar">
          <h1>{title}</h1>
          <div className="tb-actions">{actions}</div>
          <input className="tb-search" placeholder={`🔍 ${placeholder}`} value={query} onChange={e => onQuery(e.target.value)} />
          <div className="tb-right">
            {sort && <Select value={sort.value} onChange={e => sort.onChange(e.target.value)} style={{ width: 'auto' }} options={sort.options} />}
            {view && <ViewToggle {...view} />}
            {(groups.length > 0 || toggle) && (
              <div className="tb-filter" ref={pop}>
                <button type="button" className={'tb-fbtn' + (fOpen || active ? ' on' : '')} aria-expanded={fOpen} onClick={() => setFOpen(o => !o)}>
                  Filters{active > 0 && <span className="badge">{active}</span>}<Chevron />
                </button>
                {fOpen && (
                  <div className="tb-pop card">
                    <div className="chipgroups">{groups.map(g => <ChipGroup key={g.label} {...g} />)}</div>
                    {toggle && <label className="row" style={{ margin: '10px 0 0', gap: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={toggle.checked} onChange={e => toggle.onChange(e.target.checked)} /> {toggle.label}</label>}
                    {filtered && <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={onClear}>✕ Clear filters</button>}
                  </div>
                )}
              </div>
            )}
            {filtered && <button className="tb-clear" title="Clear all filters" aria-label="Clear all filters" onClick={onClear}>✕</button>}
          </div>
        </div>
        {cats && <CatBar cats={cats} cat={cat} onCat={onCat} total={total} />}
      </div>
    );
  }

  return (
    <>
      {tabs?.length > 0 && <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => onTab(k)}>{l}</button>)}</div>}
      {above}
      <div className="card ing-filters">
        <div className="row">
          <input className="grow" placeholder={`🔍 ${placeholder}`} style={{ minWidth: 200 }} value={query} onChange={e => onQuery(e.target.value)} />
          {(sort || view) && <div className="tb-right">
            {sort && <Select value={sort.value} onChange={e => sort.onChange(e.target.value)} style={{ width: 'auto' }} options={sort.options} />}
            {view && <ViewToggle {...view} />}
          </div>}
        </div>
        {cats && <CatBar cats={cats} cat={cat} onCat={onCat} total={total} />}
        {groups.length > 0 && <>
          <button type="button" className={'fold' + (fOpen ? ' open' : '')} aria-expanded={fOpen} onClick={() => setFOpen(o => !o)}>
            <span>{groups.map(g => g.label).join(' · ')}{active > 0 && <span className="badge">{active}</span>}</span>
            <Chevron />
          </button>
          {fOpen && <div className="chipgroups">{groups.map(g => <ChipGroup key={g.label} {...g} />)}</div>}
        </>}
        {(toggle || filtered) && (
          <div className="row" style={{ marginTop: 6 }}>
            {toggle && <label className="row" style={{ margin: 0, gap: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={toggle.checked} onChange={e => toggle.onChange(e.target.checked)} /> {toggle.label}</label>}
            {filtered && <button className="btn ghost sm" onClick={onClear}>✕ Clear filters</button>}
          </div>
        )}
      </div>
    </>
  );
}
