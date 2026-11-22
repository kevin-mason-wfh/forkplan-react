import { useRef, useState } from 'react';
import { gather, CSV, TEMPLATES, FORMAT, stamp, csvToBundle, importBundle } from '../transfer.js';
import { download, pickFile, readText } from '../util.js';
import { Field, Page, Select, useUI } from '../ui.jsx';

const LABELS = { ingredients: 'Ingredients', recipes: 'Recipes', pantries: 'Pantries', mealPlans: 'Meal plans', shoppingLists: 'Shopping lists' };
const count = (b, k) => b[k]?.length ?? 0;

export default function Transfer() {
  const { run, toast } = useUI();
  const [log, setLog] = useState('Ready.');
  const logRef = useRef();
  const say = m => { setLog(l => `${l}\n${m}`); setTimeout(() => logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight)); };
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('json');
  const [bundle, setBundle] = useState(null);
  const [fileName, setFileName] = useState('');
  const [secs, setSecs] = useState({});
  const [over, setOver] = useState(false);

  const exportJSON = async () => { setBusy(true); const b = await run(() => gather(say)); setBusy(false); if (b) { download(`forkplan-backup-${stamp()}.json`, JSON.stringify(b, null, 2)); say('✓ Backup downloaded'); } };
  const exportCSV = async k => { const b = await run(() => gather(say)); if (b) { download(`forkplan-${k}-${stamp()}.csv`, CSV[k](b), 'text/csv'); say(`✓ ${k}.csv downloaded`); } };

  const load = async file => {
    if (!file) return;
    const text = await readText(file); let b;
    try {
      if (kind === 'json') { b = JSON.parse(text); if (b.format !== FORMAT) throw new Error('This file is not a Forkplan backup'); } else b = csvToBundle(kind, text);
    } catch (e) { setBundle(null); return toast(`Couldn't read file: ${e.message}`, true); }
    const s = Object.fromEntries(Object.keys(LABELS).filter(k => count(b, k)).map(k => [k, true]));
    if (kind === 'json' && (b.goal || b.dietaryPrefs || b.notificationPrefs || b.waterSettings)) s.settings = true;
    setBundle(b); setSecs(s); setFileName(file.name);
  };
  const go = async () => {
    setBusy(true); say('— Import started —');
    const s = await run(() => importBundle(bundle, secs, say)); setBusy(false);
    if (s) { say(`— Done: ${s.created} created, ${s.skipped} skipped, ${s.failed} failed —`); toast(`Import finished: ${s.created} created, ${s.failed} failed`, s.failed > 0); }
  };
  const keys = bundle ? Object.keys(secs) : [];

  return (
    <Page title="Import / Export">
      <div className="grid cols-2">
        <div className="card"><h3>Export</h3>
          <p className="muted">Download your data. The full backup (JSON) can be re-imported into any Forkplan account; CSVs open in Excel / Sheets.</p>
          <div className="row"><button className="btn" disabled={busy} onClick={exportJSON}>Full backup (JSON)</button></div>
          <div className="row" style={{ marginTop: 10 }}>{Object.keys(CSV).map(k => <button key={k} className="btn ghost" onClick={() => exportCSV(k)}>{k[0].toUpperCase() + k.slice(1)} CSV</button>)}</div>
          <p className="muted" style={{ marginTop: 12 }}>Tip: shopping lists and meal plans also have a Print button on their pages.</p>
        </div>
        <div className="card"><h3>Import</h3>
          <p className="muted">Existing items with the same name are skipped, so importing is safe to repeat. Missing ingredients referenced by recipes are created automatically.</p>
          <div className="row">
            <Field label="File type"><Select style={{ width: 'auto' }} value={kind} onChange={e => { setKind(e.target.value); setBundle(null); }} options={[['json', 'Full backup (.json)'], ['recipes', 'Recipes (.csv)'], ['ingredients', 'Ingredients (.csv)'], ['pantry', 'Pantry (.csv)'], ['mealplans', 'Meal plan (.csv)'], ['shopping', 'Shopping items (.csv)']]} /></Field>
            <div style={{ alignSelf: 'end' }}><a href="#" onClick={e => { e.preventDefault(); kind !== 'json' ? download(`forkplan-${kind}-template.csv`, TEMPLATES[kind], 'text/csv') : toast('Use “Full backup (JSON)” export as the template'); }}>Download template</a></div>
          </div>
          <div className={'drop' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); load(e.dataTransfer.files[0]); }}>
            Drop a file here or <a href="#" onClick={async e => { e.preventDefault(); load(await pickFile(kind === 'json' ? '.json,application/json' : '.csv,text/csv')); }}>choose one</a>
          </div>
          {bundle && <div>
            <p>Found in {fileName}:</p>
            {keys.map(k => <label key={k} className="check" style={{ color: 'var(--ink)', fontSize: 14, margin: 0 }}>
              <input type="checkbox" checked={secs[k]} onChange={e => setSecs(s => ({ ...s, [k]: e.target.checked }))} />{k === 'settings' ? 'Goals, preferences & settings' : `${LABELS[k]} — ${count(bundle, k)}`}</label>)}
            {!keys.length && <p className="muted">Nothing importable found — check the columns against the template.</p>}
          </div>}
          <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={busy || !keys.length} onClick={go}>Import selected</button></div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}><h3>Activity</h3><pre className="log" ref={logRef}>{log}</pre></div>
    </Page>
  );
}
