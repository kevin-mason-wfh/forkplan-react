export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const pickFile = (accept) => new Promise(resolve => {
  const i = Object.assign(document.createElement('input'), { type: 'file', accept, onchange: () => resolve(i.files[0] ?? null) });
  i.click();
});
export const readText = f => f.text();

// CSV (RFC 4180-ish)
export const toCSV = (rows) => rows.map(r => r.map(c => {
  const s = c == null ? '' : String(c); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');
export function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const [head, ...rest] = rows.filter(r => r.some(x => x.trim() !== ''));
  return (rest ?? []).map(r => Object.fromEntries((head ?? []).map((k, i) => [k.trim().toLowerCase(), (r[i] ?? '').trim()])));
}
