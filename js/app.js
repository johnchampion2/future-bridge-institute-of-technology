'use strict';
/* =====================  FBITI SYS – Frontend  ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Number(v) || 0;
const money = v => `${CONFIG.CURRENCY} ${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const split = v => String(v || '').split(' | ').filter(Boolean);
const fmtDate = v => v ? new Date(v).toLocaleString() : '';
const ALL_PROGS = [...CONFIG.PROGRAMMES.Certificate, ...CONFIG.PROGRAMMES.Diploma];
const MONO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0b2a5b"/><text x="50" y="62" font-size="38" font-weight="700" text-anchor="middle" fill="#f2b705" font-family="Arial">FB</text></svg>');
const logo = (c = 'logo-md') => `<img class="${c}" src="${CONFIG.LOGO}" alt="Logo" onerror="this.onerror=null;this.src='${MONO}'">`;

const S = { user: null, token: null, page: 'home', students: [], fees: [], exp: [], users: [], bin: [], sel: new Set(), f: { stProg: 'All', stQ: '', feProg: 'All', feQ: '', ry: 'All' } };
const isAdmin = () => S.user && S.user.role === 'Admin';

/* ---------- UI helpers ---------- */
function toast(msg, type = '') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
}
function modal(html, cls = '') {
  closeModal();
  const m = document.createElement('div'); m.className = 'modal-back';
  m.innerHTML = `<div class="modal ${cls}"><button class="x" data-act="closeModal">✕</button>${html}</div>`;
  document.body.appendChild(m); return m;
}
const closeModal = () => $$('.modal-back').forEach(m => m.remove());
function ask(title, label) {
  return new Promise(res => {
    const m = modal(`<h3 style="color:var(--navy);margin-bottom:12px">${title}</h3><label class="lbl">${label}</label><textarea id="askv" rows="3"></textarea>
      <div class="row end"><button class="btn ghost" id="askc">Cancel</button><button class="btn" id="asko">Confirm</button></div>`, 'sm');
    $('#askc', m).onclick = () => { closeModal(); res(null); };
    $('#asko', m).onclick = () => { const v = $('#askv', m).value.trim(); if (!v) return $('#askv', m).focus(); closeModal(); res(v); };
  });
}
function confirmBox(msg, okLabel = 'Confirm') {
  return new Promise(res => {
    const m = modal(`<h3 style="color:var(--navy);margin-bottom:10px">Please confirm</h3><p style="line-height:1.6">${msg}</p>
      <div class="row end"><button class="btn ghost" id="cc">Cancel</button><button class="btn danger" id="co">${okLabel}</button></div>`, 'sm');
    $('#cc', m).onclick = () => { closeModal(); res(false); };
    $('#co', m).onclick = () => { closeModal(); res(true); };
  });
}
async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = 'Please wait…';
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = t; }
}

/* ---------- API ---------- */
async function api(action, data = {}) {
  const r = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: S.token, data }) });
  const j = await r.json();
  if (!j.ok) {
    if (j.error === 'SESSION_EXPIRED') { logout(true); }
    const e = new Error(j.error === 'SESSION_EXPIRED' ? 'Session expired. Please sign in again.' : j.error); e.server = true; throw e;
  }
  return j.data;
}
const LOADERS = { students: 'listStudents', fees: 'listFees', exp: 'listExpenditure' };
async function load(k, quiet) {
  try {
    S[k] = await api(LOADERS[k]); localStorage.setItem('fbiti_c_' + k, JSON.stringify(S[k]));
  } catch (e) {
    if (e.server) throw e;
    S[k] = JSON.parse(localStorage.getItem('fbiti_c_' + k) || '[]');
    if (!quiet) toast('You are offline – showing the last saved data', 'warn');
  }
}

/* ---------- Offline drafts ---------- */
const DK = 'fbiti_drafts';
const SAVERS = { student: 'saveStudent', fee: 'saveFee', exp: 'saveExpenditure' };
const drafts = () => JSON.parse(localStorage.getItem(DK) || '[]');
const putDrafts = d => { localStorage.setItem(DK, JSON.stringify(d)); updateSync(); };
const pend = kind => drafts().filter(d => d.kind === kind);
function queueDraft(kind, data) {
  const d = drafts(); d.push({ id: data.ClientRef, kind, data, at: Date.now() }); putDrafts(d);
}
let syncing = false;
async function syncDrafts(manual) {
  if (syncing || !S.token) return;
  let list = drafts(); if (!list.length) return;
  if (manual) list.forEach(d => delete d.error);
  syncing = true; let ok = 0;
  for (const d of list) {
    if (d.error) continue;
    try { await api(SAVERS[d.kind], d.data); d.done = true; ok++; }
    catch (e) { if (e.server) d.error = e.message; else break; }
  }
  putDrafts(list.filter(d => !d.done)); syncing = false;
  if (ok) { toast(`${ok} pending record${ok > 1 ? 's' : ''} synchronized`, 'ok'); if (!$('.modal-back')) go(S.page); }
  else if (manual) toast(navigator.onLine ? 'Nothing could be synchronized yet' : 'Still offline', 'warn');
}
function updateSync() {
  const el = $('#sync'); if (!el) return;
  const n = drafts().length, off = !navigator.onLine;
  el.className = 'pill' + (off ? ' off' : n ? ' pend' : '');
  el.textContent = off ? `Offline${n ? ' · ' + n + ' pending' : ''}` : n ? `⏳ ${n} pending sync` : '● Online';
}
window.addEventListener('online', () => { updateSync(); syncDrafts(); });
window.addEventListener('offline', updateSync);
setInterval(() => syncDrafts(), CONFIG.SYNC_INTERVAL_MS);

/* Try to save; if the network is down keep a draft marked "pending synchronization". */
async function saveOrDraft(kind, data) {
  data.ClientRef = data.ClientRef || uid();
  try { await api(SAVERS[kind], data); toast('Saved successfully', 'ok'); return true; }
  catch (e) {
    if (e.server) { toast(e.message, 'err'); return false; }
    queueDraft(kind, data); toast('No connection – saved as a draft (pending synchronization)', 'warn'); return true;
  }
}
const pendingBadge = d => d.error ? `<span class="badge b-bad" title="${esc(d.error)}">Sync failed</span>` : '<span class="badge b-wait">⏳ Pending sync</span>';
const discardBtn = d => `<button class="ic d" title="Discard draft" data-act="discard" data-id="${d.id}">🗑</button>`;

/* ---------- Form helpers ---------- */
function collect(f) {
  const o = {}, arr = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { (arr[el.name] = arr[el.name] || []); if (el.checked) arr[el.name].push(el.value); }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ''; }
    else o[el.name] = el.value.trim();
  }
  for (const k in arr) o[k] = arr[k].join(' | ');
  return o;
}
function fill(f, o) {
  for (const el of f.elements) {
    if (!el.name || o[el.name] === undefined) continue;
    const v = String(o[el.name]);
    if (el.type === 'checkbox') el.checked = v.split(' | ').includes(el.value);
    else if (el.type === 'radio') el.checked = el.value === v;
    else el.value = v;
  }
}
const inp = (l, n, t = 'text', x = '') => `<label class="f"><span>${l}</span><input type="${t}" name="${n}" ${x}></label>`;
const radios = (n, o) => `<div class="opts">${o.map(v => `<label class="chk"><input type="radio" name="${n}" value="${v}">${v}</label>`).join('')}</div>`;
const checks = (n, o) => `<div class="opts">${o.map(v => `<label class="chk"><input type="checkbox" name="${n}" value="${esc(v)}">${v}</label>`).join('')}</div>`;
function calcAge(d) {
  if (!d) return ''; const b = new Date(d), n = new Date(); let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth(); if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--; return a >= 0 ? a : '';
}

/* ---------- Logo & watermark ---------- */
let LOGO_DATA = MONO, WM = 'none';
async function loadLogo() {
  try {
    const r = await fetch(CONFIG.LOGO); if (!r.ok) throw 0;
    const b = await r.blob();
    LOGO_DATA = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
  } catch (e) { LOGO_DATA = MONO; }
  const w = CONFIG.INSTITUTION.split(' '), mid = Math.ceil(w.length / 2);
  const l1 = w.slice(0, mid).join(' '), l2 = w.slice(mid).join(' ') + ' (' + CONFIG.SHORT + ')';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="520" height="420" viewBox="0 0 520 420"><g opacity="0.07" transform="rotate(-18 260 210)"><image x="190" y="70" width="140" height="140" href="${LOGO_DATA}" xlink:href="${LOGO_DATA}"/><text x="260" y="250" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="21" fill="#0b2a5b">${esc(l1)}</text><text x="260" y="278" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="21" fill="#0b2a5b">${esc(l2)}</text></g></svg>`;
  WM = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  document.documentElement.style.setProperty('--wm', WM);
}

/* ---------- Phone numbers: digits only, auto-dashed ---------- */
const PH = CONFIG.PHONE_GROUPS, PH_LEN = PH.reduce((a, b) => a + b, 0), PH_MASK = PH.map(g => 'X'.repeat(g)).join('-');
function fmtPhone(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, PH_LEN), o = []; let i = 0;
  for (const g of PH) { if (i >= d.length) break; o.push(d.slice(i, i + g)); i += g; }
  return o.join('-');
}
const phoneOk = v => String(v || '').replace(/\D/g, '').length === PH_LEN;
const phoneInp = (l, n) => inp(l, n, 'tel', `data-phone inputmode="numeric" placeholder="${PH_MASK}" maxlength="${PH_LEN + PH.length - 1}" autocomplete="off"`);
document.addEventListener('input', e => { const t = e.target; if (t.matches && t.matches('[data-phone]')) t.value = fmtPhone(t.value); });

/* ---------- Acceptance letters ---------- */
const honorific = s => s.Gender === 'Female' ? 'Miss' : 'Mr';
const titleCase = n => {
  n = String(n || '').trim().replace(/\s+/g, ' ');
  return (n === n.toUpperCase() || n === n.toLowerCase()) ? n.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : n;
};
const longDate = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
function letterHtml(s) {
  const name = `${honorific(s)} ${titleCase(s.FullName)}`, inst = esc(CONFIG.INSTITUTION), progs = split(s.Programmes), per = split(s.StudyPeriod);
  return `<div class="letter"><div class="lh"><img src="${CONFIG.LOGO}" alt="" onerror="this.onerror=null;this.src='${MONO}'"><div><h1>${inst} (${CONFIG.SHORT})</h1><small>Admissions Office</small></div></div>
  <div class="ld">${longDate()}</div>
  <div class="la"><b>${esc(name)}</b><br>Student ID: ${esc(s.StudentID)}</div>
  <div class="ls">LETTER OF ACCEPTANCE</div>
  <p>Dear ${esc(name)},</p>
  <p>On behalf of the management and staff of <b>${inst}</b>, I am pleased to inform you that your application has been reviewed and you have been <b>accepted</b> as a student of the institution. Congratulations!</p>
  <table class="lt"><tr><td>Student ID</td><td><b>${esc(s.StudentID)}</b></td></tr><tr><td>Programme${progs.length > 1 ? 's' : ''}</td><td>${progs.map(esc).join('<br>') || '—'}</td></tr>
  <tr><td>Academic Year</td><td>${esc(s.AcademicYear) || '—'}</td></tr>${per.length ? `<tr><td>Study Period</td><td>${per.map(esc).join(', ')}</td></tr>` : ''}</table>
  <p>Please keep this letter safe and present it, together with your Student ID, whenever you visit the administration office. Kindly use your Student ID for all fee payments and correspondence with the institution.</p>
  <p>Once again, congratulations on your admission. We look forward to welcoming you and wish you every success in your studies.</p>
  <div class="sig">Yours sincerely,<i>Admissions Officer</i>${inst}</div></div>`;
}
function showLetters(list) {
  if (!list.length) return toast('No students to print', 'warn');
  docModal(list.length === 1 ? `Acceptance Letter – ${list[0].StudentID}` : `Acceptance Letters (${list.length})`,
    list.map(s => `<div class="pg">${letterHtml(s)}</div>`).join(''), { portrait: true, letters: true });
}

/* ---------- Documents: preview, print, PDF and image (one design everywhere) ---------- */
const DOCW = { portrait: 794, landscape: 1123, app: 940 };
const PAPER_CSS = `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#fff}body{font-family:Arial,Helvetica,sans-serif;color:#10213f;font-size:12px}
.sheet{padding:28px;background:#fff var(--wm) repeat center/520px 420px}
.hd{display:flex;align-items:center;gap:16px;border-bottom:4px solid #f2b705;padding-bottom:10px;margin-bottom:14px}
.hd img{width:64px;height:64px;object-fit:contain}.hd h1{font-size:19px;color:#0b2a5b;margin:0}.hd h2{font-size:14px;margin:3px 0 0}.hd small{color:#5b6b86}
.meta{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px;font-weight:bold}.meta span{background:#eef2f9;padding:6px 12px;border-radius:6px}
table{width:100%;border-collapse:collapse;margin-bottom:18px}thead{display:table-header-group}tr{page-break-inside:avoid}
th{background:#0b2a5b;color:#fff;text-align:left;padding:7px;font-size:11px;text-transform:uppercase}
td{padding:6px 7px;border-bottom:1px solid #d9e0ec}tbody tr:nth-child(even) td{background:rgba(238,242,249,.6)}
.num{text-align:right}tfoot td{font-weight:bold;background:#eef2f9}h3{color:#0b2a5b;margin:10px 0 6px}.empty{text-align:center;color:#5b6b86}
.ft{margin-top:20px;color:#5b6b86;font-size:10px;text-align:center}
.pg{width:794px;min-height:1123px;padding:56px 64px;background:#fff var(--wm) no-repeat center 52%/460px;page-break-after:always}
.letter{font-family:Georgia,'Times New Roman',serif;color:#10213f;font-size:14px;line-height:1.7}
.letter .lh{display:flex;align-items:center;gap:16px;border-bottom:4px solid #f2b705;padding-bottom:12px;margin-bottom:24px}
.letter .lh img{width:78px;height:78px;object-fit:contain}.letter .lh h1{font:700 20px/1.25 Arial,sans-serif;color:#0b2a5b;margin:0}.letter .lh small{font-family:Arial,sans-serif;color:#5b6b86}
.letter .ld{text-align:right;margin-bottom:14px}.letter .la{margin-bottom:12px}
.letter .ls{text-align:center;font:700 15px Arial,sans-serif;letter-spacing:3px;color:#0b2a5b;border-top:1px solid #d9e0ec;border-bottom:1px solid #d9e0ec;padding:9px 0;margin:16px 0}
.letter p{margin:0 0 12px;text-align:justify}
.letter table.lt{margin:14px 0 16px;font:13px Arial,sans-serif}.letter .lt td{border:1px solid #d9e0ec;padding:8px 12px;background:rgba(255,255,255,.6)!important}
.letter .lt td:first-child{background:#eef2f9!important;font-weight:700;width:32%;color:#0b2a5b}
.letter .sig{margin-top:30px}.letter .sig i{display:block;border-top:1px solid #10213f;width:230px;margin-top:44px;padding-top:4px;font-style:normal;font-weight:700}
@media print{.sheet{padding:0}.pg{width:210mm;height:297mm;min-height:0;overflow:hidden}.pg:last-child{page-break-after:auto}}`;
let CSS_TEXT = '';
function appCss() {
  if (!CSS_TEXT) for (const sh of document.styleSheets) { try { CSS_TEXT += [...sh.cssRules].map(r => r.cssText).join('\n'); } catch (e) { } }
  return CSS_TEXT;
}
function docHtml(inner, o = {}) {
  const css = o.mode === 'app' ? appCss() + 'body{background:#fff!important;margin:0}.appwrap{padding:20px;background:#fff}'
    : PAPER_CSS + `@page{size:A4 ${o.landscape ? 'landscape' : 'portrait'};margin:${o.letters ? '0' : '12mm'}}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title || '')}</title><style>:root{--wm:${o.nowm ? 'none' : WM}}${css}</style></head><body>${inner}</body></html>`
    .split(`src="${CONFIG.LOGO}"`).join(`src="${LOGO_DATA}"`);
}
const docWidth = o => o.mode === 'app' ? DOCW.app : o.landscape ? DOCW.landscape : DOCW.portrait;
const fileName = t => String(t).replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
async function mkFrame(html, w) {            // renders the document at a fixed width, off-screen, so phones & desktops give the same result
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = `position:fixed;left:-30000px;top:0;width:${w}px;height:1200px;border:0;opacity:0;pointer-events:none`;
  document.body.appendChild(f);
  await new Promise(res => { f.onload = res; f.srcdoc = html; });
  const d = f.contentDocument;
  await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  if (d.fonts && d.fonts.ready) await d.fonts.ready;
  f.style.height = d.documentElement.scrollHeight + 'px';
  return f;
}
const libsMissing = () => (!window.html2canvas || !(window.jspdf && window.jspdf.jsPDF)) && (toast('Document tools not loaded – connect to the internet once, then try again', 'err'), true);
async function withWm(fn) { try { return await fn(false); } catch (e) { return await fn(true); } }   // retry without watermark if a browser blocks it
const shootOpts = (W, H) => ({ scale: Math.max(1, Math.min(2, Math.sqrt(16000000 / (W * H)), 12000 / H)), backgroundColor: '#ffffff', useCORS: true, logging: false, scrollX: 0, scrollY: 0 });
function saveBlob(b, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function imageOut(el, name) {
  const c = await html2canvas(el, shootOpts(el.scrollWidth, el.scrollHeight));
  const b = await new Promise((res, rej) => { try { c.toBlob(x => x ? res(x) : rej(new Error('Could not create image')), 'image/png'); } catch (e) { rej(e); } });
  saveBlob(b, name);
}
async function pdfOut(frame, name, land) {
  const pdf = new window.jspdf.jsPDF({ orientation: land ? 'l' : 'p', unit: 'mm', format: 'a4' });
  const pw = land ? 297 : 210, ph = land ? 210 : 297, d = frame.contentDocument, pgs = [...d.querySelectorAll('.pg')];
  if (pgs.length) {                                       // letters: one page each
    for (let i = 0; i < pgs.length; i++) {
      const c = await html2canvas(pgs[i], shootOpts(pgs[i].scrollWidth, pgs[i].scrollHeight));
      let w = pw, h = pw * c.height / c.width; if (h > ph) { w = w * ph / h; h = ph; }
      if (i) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, w, h);
    }
  } else {                                                // lists / reports / receipts: split between rows
    const t = d.querySelector('.sheet,.appwrap') || d.body, W = t.scrollWidth, H = t.scrollHeight, m = 8;
    const opts = shootOpts(W, H), c = await html2canvas(t, opts), sc = c.width / W;
    const pageH = Math.floor(W * (ph - 2 * m) / pw), top = t.getBoundingClientRect().top;
    const br = [...t.querySelectorAll('tr,.hd,.meta,h3,h4,.kv,.totals,.snap-hd,.ft')].map(e => Math.ceil(e.getBoundingClientRect().bottom - top)).filter(b => b > 0).sort((a, b) => a - b);
    let y = 0;
    while (y < H - 1) {
      let end = Math.min(y + pageH, H);
      if (end < H) { const ok = br.filter(b => b > y + pageH * 0.5 && b <= end); if (ok.length) end = ok[ok.length - 1]; }
      const pc = document.createElement('canvas'); pc.width = c.width; pc.height = Math.max(1, Math.round((end - y) * sc));
      const g = pc.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pc.width, pc.height); g.drawImage(c, 0, Math.round(y * sc), c.width, pc.height, 0, 0, c.width, pc.height);
      if (y) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.93), 'JPEG', 0, m, pw, (end - y) * pw / W);
      y = end;
    }
  }
  pdf.save(name);
}
let CUR = null;
function docModal(title, inner, o = {}) {
  CUR = { title, inner, o };
  const m = modal(`<h3 style="color:var(--navy);margin-bottom:12px;padding-right:36px">${esc(title)}</h3>
    <div class="row" style="margin-bottom:12px"><button class="btn" data-act="docPrint">🖨 Print</button><button class="btn gold" data-act="docPdf">📄 Save as PDF</button><button class="btn ghost" data-act="closeModal">Close</button></div>
    <div class="docprev" id="dp"><div id="dps"><iframe id="dpf" title="Preview"></iframe></div></div>`, 'lg');
  const f = $('#dpf', m), w = docWidth(o);
  f.style.width = w + 'px';
  f.onload = () => {
    const H = f.contentDocument.documentElement.scrollHeight, sc = Math.min(1, $('#dp', m).clientWidth / w);
    f.style.height = H + 'px'; f.style.transform = `scale(${sc})`;
    $('#dps', m).style.cssText = `position:relative;width:${w * sc}px;height:${H * sc}px`;
  };
  f.srcdoc = docHtml(inner, { ...o, title });
}
/* Existing call sites: printDoc(title, body) → landscape sheet with institution header */
function printDoc(title, body, o = { landscape: true }) {
  docModal(title, `<div class="sheet"><div class="hd"><img src="${CONFIG.LOGO}" alt="" onerror="this.onerror=null;this.src='${MONO}'"><div><h1>${esc(CONFIG.INSTITUTION)} (${CONFIG.SHORT})</h1><h2>${esc(title)}</h2><small>Printed ${new Date().toLocaleString()} by ${esc(S.user.fullName)}</small></div></div>${body}<div class="ft">${esc(CONFIG.INSTITUTION)} · FBITI SYS</div></div>`, o);
}

/* =====================  BOOT & AUTH  ===================== */
window.addEventListener('DOMContentLoaded', () => {
  loadLogo();
  $('#splash').innerHTML = `${logo('logo-xl')}<h1>${CONFIG.INSTITUTION}</h1><p>${CONFIG.SHORT}</p><div class="bar"><i></i></div>`;
  const saved = JSON.parse(localStorage.getItem('fbiti_session') || 'null');
  setTimeout(() => {
    $('#splash').classList.add('out'); setTimeout(() => $('#splash').remove(), 600);
    $('#app').hidden = false;
    if (saved) { S.token = saved.token; S.user = saved.user; showApp(); syncDrafts(); } else showAuth('login');
  }, CONFIG.SPLASH_MS);
});

function showAuth(mode) {
  $('#app').innerHTML = `<div class="auth">
  <aside class="brand">${logo('logo-xl')}<h1>${CONFIG.INSTITUTION}</h1><div class="tag">${CONFIG.SHORT}</div>
    <p>Student registration, fees and expenditure management – secure, simple and always available.</p></aside>
  <main class="authform"><div class="card"><div class="mini-brand">${logo('logo-sm')}<span>${CONFIG.SHORT}</span></div>
  ${mode === 'login' ? `<h2>Welcome back</h2><p class="sub">Sign in to continue</p><div id="am"></div>
    <form id="lf" autocomplete="on">
      ${inp('Username', 'username', 'text', 'required autocomplete="username"')}
      ${inp('Password', 'password', 'password', 'required autocomplete="current-password"')}
      <label class="f"><span>Role</span><select name="role"><option>Admin</option><option>Bursar</option></select></label>
      <button class="btn block" type="submit">Sign In</button></form>
    <div class="switch">Don't have an account? <a data-act="auth" data-id="register">Create account</a></div>`
  : `<h2>Create account</h2><p class="sub">Your account will be reviewed by an administrator</p><div id="am"></div>
    <form id="rf">
      ${inp('Full Name', 'fullName', 'text', 'required')}${inp('Email', 'email', 'email', 'required')}
      ${inp('Username', 'username', 'text', 'required minlength="3"')}${inp('Password', 'password', 'password', 'required minlength="6"')}
      <label class="f"><span>Role</span><select name="role"><option>Bursar</option><option>Admin</option></select></label>
      <button class="btn block" type="submit">Create Account</button></form>
    <div class="switch">Already have an account? <a data-act="auth" data-id="login">Sign in</a></div>`}
  </div></main></div>`;
  const msg = (t, c = 'err') => $('#am').innerHTML = `<div class="msg ${c}">${esc(t)}</div>`;
  if (mode === 'login') $('#lf').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target);
    try {
      const r = await busy(b, () => api('login', collect(e.target)));
      S.token = r.token; S.user = r.user; localStorage.setItem('fbiti_session', JSON.stringify(r)); showApp(); syncDrafts();
    } catch (x) { msg(x.server ? x.message : 'Cannot reach the server. Check your internet connection.'); }
  };
  else $('#rf').onsubmit = async e => {
    e.preventDefault(); const b = $('button', e.target);
    try {
      const r = await busy(b, () => api('register', collect(e.target)));
      showAuth('login');
      $('#am').innerHTML = `<div class="msg ok">${r.autoApproved ? 'Account created. You are the first user, so you were approved as Admin – sign in now.' : 'Account created. Please wait for administrator approval – you will receive an email.'}</div>`;
    } catch (x) { msg(x.server ? x.message : 'Cannot reach the server. Check your internet connection.'); }
  };
}

async function logout(silent) {
  if (!silent && S.token) { try { await api('logout'); } catch (e) { } }
  S.token = null; S.user = null; localStorage.removeItem('fbiti_session'); showAuth('login');
}

/* =====================  SHELL  ===================== */
const NAV = [['home', 'Home', '🏠'], ['students', 'Student Registration', '🎓'], ['fees', 'Fees Payment', '💳'], ['exp', 'Expenditure', '🧾'], ['report', 'Report', '📊'],
['admin', 'Admin Control Panel', '🛡', 1], ['bin', 'Recycle Bin', '♻️', 1], ['profile', 'Profile', '👤']];

function showApp() {
  const nav = NAV.filter(n => !n[3] || isAdmin());
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side"><div class="hd">${logo('logo-sm')}<b>${CONFIG.INSTITUTION}<small>${CONFIG.SHORT}</small></b></div>
  <nav>${nav.map(n => `<a data-act="go" data-id="${n[0]}" id="n-${n[0]}"><span>${n[2]}</span>${n[1]}</a>`).join('')}<div class="sep"></div>
  <a data-act="logout"><span>⎋</span>Logout</a></nav></aside>
  <div class="main"><div class="stickyhead"><header class="top"><button class="burger" data-act="menu">☰</button><h3 id="ptitle"></h3>
  <button id="installBtn" class="pill pend" data-act="install" hidden>⬇ Install App</button><span id="sync" class="pill" data-act="syncNow" title="Click to synchronize now"></span>
  <div class="chip"><i>${esc(S.user.fullName[0].toUpperCase())}</i><span><b>${esc(S.user.fullName)}</b><br><small>${S.user.role}</small></span></div></header>
  <div class="verse">✝ JESUS IS COMING AGAIN ✝</div></div><div id="view"></div></div></div>`;
  updateSync(); initInstall(); go('home');
}
function go(p) {
  S.page = p; $('#side')?.classList.remove('open');
  $$('.side a').forEach(a => a.classList.toggle('on', a.id === 'n-' + p));
  const n = NAV.find(x => x[0] === p); $('#ptitle').textContent = n ? n[1] : '';
  const fn = PAGES[p]; $('#view').innerHTML = '<div class="panel">Loading…</div>';
  Promise.resolve(fn()).catch(e => { $('#view').innerHTML = `<div class="panel msg err">${esc(e.message)}</div>`; });
}

/* =====================  HOME  ===================== */
const progIcon = n => {
  const k = [['ICT', '💻'], ['Graphics', '🎨'], ['Marketing', '📣'], ['Commerce', '🛒'], ['Electrical', '⚡'], ['Solar', '☀️'], ['Networking', '🌐'], ['Web', '🕸️'],
  ['Software', '🧑‍💻'], ['CCTV', '📹'], ['Printer', '🖨️'], ['Fashion', '🧵'], ['Photography', '📷'], ['Information Technology', '🖥️'], ['Computer Science', '🧠'], ['Innovation', '💡'], ['Business', '💼']];
  return (k.find(([w]) => n.includes(w)) || [0, '🎓'])[1];
};
async function pageHome() {
  const qa = [['students', '🎓', 'Student Registration', 'Admit students, view records and print acceptance letters.'], ['fees', '💳', 'Fees Payment', 'Record instalments, see balances and receipts.'],
  ['exp', '🧾', 'Expenditure', 'Record spending by academic year and print statements.'], ['report', '📊', 'Report', 'Summaries by academic year, programme and user.'], ['profile', '👤', 'Profile', 'Change your username or password.']];
  if (isAdmin()) qa.splice(4, 0, ['admin', '🛡️', 'Admin Control Panel', 'Approve, deny or remove users.'], ['bin', '♻️', 'Recycle Bin', 'Restore deleted students and users.']);
  $('#view').innerHTML = `<div class="hero">${logo('logo-xl')}<div><h4>${CONFIG.SHORT}</h4><h2 style="font-size:16px;font-weight:600">Welcome, ${esc(S.user.fullName)} 👋</h2><h1>${CONFIG.INSTITUTION}</h1><p>Signed in as ${S.user.role} · ${longDate()}</p></div></div>
  <div class="tiles" id="tiles"><div class="tile"><i>🎓</i><div><small>Students</small><b id="tS">–</b></div></div><div class="tile"><i>👨</i><div><small>Male</small><b id="tM">–</b></div></div><div class="tile"><i>👩</i><div><small>Female</small><b id="tF">–</b></div></div>
  <div class="tile"><i>📚</i><div><small>Programmes</small><b>${ALL_PROGS.length}</b></div></div><div class="tile"><i>💰</i><div><small>Fees Paid</small><b id="tP">–</b></div></div><div class="tile"><i>⏳</i><div><small>Outstanding</small><b id="tB">–</b></div></div></div>
  <div class="panel about"><h3>🏛️ About ${CONFIG.SHORT}</h3>${CONFIG.ABOUT.map(p => `<p>${esc(p)}</p>`).join('')}<div class="chips"><span>🌅 Morning</span><span>☀️ Afternoon</span><span>🌙 Evening</span><span>📅 Weekend</span></div></div>
  <h3 class="sech">🎓 Certificate Programmes</h3><div class="pgrid">${CONFIG.PROGRAMMES.Certificate.map(p => `<div class="pcard"><i>${progIcon(p)}</i>${esc(p)}</div>`).join('')}</div>
  <h3 class="sech">📘 Diploma Programmes</h3><div class="pgrid">${CONFIG.PROGRAMMES.Diploma.map(p => `<div class="pcard dip"><i>${progIcon(p)}</i>${esc(p)}</div>`).join('')}</div>
  <h3 class="sech">⚡ Quick Actions</h3><div class="qa">${qa.map(q => `<a data-act="go" data-id="${q[0]}"><i>${q[1]}</i><b>${q[2]}</b><span>${q[3]}</span></a>`).join('')}</div>
  <div class="panel" style="margin-top:20px"><h3 style="color:var(--navy);margin-bottom:8px">✨ Good to know</h3><p style="line-height:1.8;color:var(--mute)">⏳ Working without internet? Forms are saved on this device as drafts and sent automatically when you reconnect. &nbsp; 🧾 Financial records are never erased – they are voided with a reason. &nbsp; 📱 FBITI SYS works on phones, tablets and computers.</p></div>`;
  try {
    await Promise.all([load('students', true), load('fees', true)]);
    const a = S.fees.filter(feActive), p = a.reduce((x, r) => x + num(r.TotalPaid), 0), b = a.reduce((x, r) => x + num(r.Balance), 0);
    const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = v; };
    set('tS', S.students.length); set('tM', S.students.filter(s => s.Gender === 'Male').length); set('tF', S.students.filter(s => s.Gender === 'Female').length); set('tP', money(p)); set('tB', money(b));
  } catch (e) { }
}

/* =====================  STUDENTS  ===================== */
const progOpts = sel => `<option value="All">All Programmes</option>` + ALL_PROGS.map(p => `<option ${p === sel ? 'selected' : ''}>${esc(p)}</option>`).join('');
const stList = () => S.students.filter(s => S.f.stProg === 'All' || split(s.Programmes).includes(S.f.stProg));

async function pageStudents() {
  await load('students');
  $('#view').innerHTML = `<div class="tool"><input class="grow" id="stQ" placeholder="🔍 Search by Student ID or name…" value="${esc(S.f.stQ)}">
    <select id="stP">${progOpts(S.f.stProg)}</select>
    <button class="btn gold" data-act="addStudent">＋ Add Student</button><button class="btn ghost" data-act="printStudents">🖨 Print PDF</button><button class="btn ghost" id="btnLet" data-act="printLetters"></button></div>
    <div class="stats" id="stStats"></div><div class="wrap"><table class="tbl"><thead><tr><th class="chkcol"><input type="checkbox" id="selAll" data-act="selAll" title="Select all shown"></th><th>ID</th><th>Full Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Programmes</th><th>Period</th><th>Actions</th></tr></thead><tbody id="stBody"></tbody></table></div>`;
  $('#stQ').oninput = e => { S.f.stQ = e.target.value; drawStudents(); };
  $('#stP').onchange = e => { S.f.stProg = e.target.value; drawStudents(); };
  drawStudents();
}
function updSel() {
  const b = $('#btnLet'); if (b) b.textContent = `✉ Acceptance Letters (${S.sel.size ? S.sel.size + ' selected' : 'all shown'})`;
  const a = $('#selAll'); if (a) { const l = stList(); a.checked = l.length > 0 && l.every(s => S.sel.has(s.StudentID)); }
}
function drawStudents() {
  const list = stList(), q = S.f.stQ.trim().toLowerCase();
  const hit = s => q && (String(s.StudentID).toLowerCase().includes(q) || String(s.FullName).toLowerCase().includes(q));
  const rows = q ? [...list.filter(hit), ...list.filter(s => !hit(s))] : list;
  const m = list.filter(s => s.Gender === 'Male').length, f = list.filter(s => s.Gender === 'Female').length;
  $('#stStats').innerHTML = `<div class="stat"><small>Total Students</small><b>${list.length}</b></div><div class="stat"><small>Male</small><b>${m}</b></div><div class="stat y"><small>Female</small><b>${f}</b></div>`;
  const pr = pend('student').map(d => `<tr class="pending"><td></td><td>—</td><td>${esc(d.data.FullName)} ${pendingBadge(d)}</td><td>${esc(d.data.Gender)}</td><td>${esc(d.data.Age)}</td><td>${esc(d.data.Mobile)}</td><td>${esc(split(d.data.Programmes).join(', '))}</td><td>${esc(split(d.data.StudyPeriod).join(', '))}</td><td>${discardBtn(d)}</td></tr>`).join('');
  $('#stBody').innerHTML = pr + (rows.length ? rows.map(s => `<tr class="${hit(s) ? 'flash' : ''}"><td><input type="checkbox" data-act="selOne" data-id="${s.StudentID}" ${S.sel.has(s.StudentID) ? 'checked' : ''}></td><td><b>${esc(s.StudentID)}</b></td><td>${esc(s.FullName)}</td><td>${esc(s.Gender)}</td><td>${esc(s.Age)}</td><td>${esc(s.Mobile)}</td>
    <td>${esc(split(s.Programmes).join(', '))}</td><td>${esc(split(s.StudyPeriod).join(', '))}</td>
    <td><button class="ic v" title="View" data-act="viewStudent" data-id="${s.StudentID}">👁</button><button class="ic a" title="Acceptance letter" data-act="letter" data-id="${s.StudentID}">✉</button><button class="ic e" title="Edit" data-act="editStudent" data-id="${s.StudentID}">✏️</button><button class="ic d" title="Delete" data-act="delStudent" data-id="${s.StudentID}">🗑</button></td></tr>`).join('')
    : (pr ? '' : '<tr><td colspan="9" class="empty">No students found</td></tr>'));
  updSel();
}
const progBoxes = lvl => lvl ? checks('Programmes', CONFIG.PROGRAMMES[lvl]) : '<p class="hint" style="color:var(--mute)">Select a programme level first.</p>';

function studentForm(s) {
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>STUDENT ADMISSION FORM</p></div></div>
  <form id="sf" novalidate>
  <div class="g3"><label class="f"><span>Student ID</span><input name="StudentID" readonly value="${s ? esc(s.StudentID) : ''}" placeholder="Auto-generated"></label>
  <label class="f"><span>Academic Year *</span><input name="AcademicYear" placeholder="2026/2027" maxlength="9" inputmode="text" oninput="this.value=this.value.replace(/[^0-9\\/]/g,'')"></label></div>
  <div class="sec">SECTION A: PERSONAL INFORMATION</div>
  <div class="g2">${inp('1. Full Name *', 'FullName')}
  <div><span class="lbl">2. Gender *</span>${radios('Gender', ['Male', 'Female'])}</div>
  <label class="f"><span>3. Date of Birth *</span><input type="date" name="DOB" id="dob" max="${today()}"></label>${inp('Age', 'Age', 'text', 'readonly id="age"')}
  ${inp('4. Nationality *', 'Nationality')}<div><span class="lbl">5. Marital Status</span>${radios('MaritalStatus', ['Single', 'Married', 'Other'])}</div>
  ${inp('6. Home Address', 'HomeAddress')}${inp('7. District', 'District')}${inp('8. Chiefdom / Community', 'Chiefdom')}${phoneInp('9. Mobile Number *', 'Mobile')}
  ${phoneInp('10. Alternative Number', 'AltMobile')}${inp('11. Email Address', 'Email', 'email')}
  <div class="full">${inp('12. National ID / School ID / Driver\'s Licence (if available)', 'NationalID')}</div></div>
  <div class="sec">SECTION B: EDUCATIONAL BACKGROUND</div>
  <span class="lbl">Highest Qualification Obtained</span>${radios('Qualification', ['Primary School', 'JSS', 'BECE', 'SSS', 'WASSCE', 'Certificate', 'Diploma', 'Degree', 'Other'])}
  <div class="g3">${inp('If Other, specify', 'QualOther')}${inp('Last School / Institution Attended', 'LastSchool')}${inp('Year Completed', 'YearCompleted', 'text', 'maxlength="4" inputmode="numeric"')}</div>
  <div class="sec">SECTION C: PROGRAMME OF INTEREST</div>
  <label class="f" style="max-width:340px"><span>Programme Level *</span><select name="ProgrammeLevel" id="plvl"><option value="">— Select —</option><option>Certificate</option><option>Diploma</option></select></label>
  <span class="lbl">Programmes (select one or more) *</span><div id="pbox">${progBoxes('')}</div>
  <span class="lbl">Preferred Study Period</span>${checks('StudyPeriod', ['Morning', 'Afternoon', 'Evening', 'Weekend'])}
  <div class="sec">SECTION D: PARENT / GUARDIAN INFORMATION <small>(required for applicants under 18)</small></div>
  <div class="g2">${inp('Parent/Guardian Name', 'GuardianName')}${inp('Relationship to Applicant', 'GuardianRelation')}${inp('Address', 'GuardianAddress')}${phoneInp('Contact Number', 'GuardianContact')}${inp('Email', 'GuardianEmail', 'email')}</div>
  <div class="sec">SECTION E: EMERGENCY CONTACT INFORMATION</div>
  <div class="g2">${inp('Name', 'EmergencyName')}${inp('Relationship', 'EmergencyRelation')}${inp('Address', 'EmergencyAddress')}${phoneInp('Telephone Number', 'EmergencyPhone')}</div>
  <div class="sec">SECTION F: MEDICAL INFORMATION (OPTIONAL)</div>
  <span class="lbl">Do you have any medical condition that may require special attention?</span>
  <div class="opts"><label class="chk"><input type="radio" name="MedicalCondition" value="Yes">Yes</label><label class="chk"><input type="radio" name="MedicalCondition" value="No">No</label></div>
  <div id="medBox" hidden>${inp('If yes, please specify', 'MedicalDetails')}</div>
  <div class="sec">SECTION G: HOW DID YOU HEAR ABOUT FBITI?</div>
  ${checks('HeardAbout', ['Social Media', 'Friend/Relative', 'Radio', 'Flyer/Banner', 'School Visit', 'Website', 'Other'])}
  <div style="max-width:340px">${inp('If Other, specify', 'HeardOther')}</div>
  <div id="sfMsg"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">${s ? 'Update Student' : 'Save Student'}</button></div></form>`, 'student-form');
  const f = $('#sf', m);
  const toggleMed = () => $('#medBox', m).hidden = f.elements.MedicalCondition.value !== 'Yes';
  $$('[name=MedicalCondition]', f).forEach(r => r.onchange = toggleMed);
  $('#dob', m).onchange = e => $('#age', m).value = calcAge(e.target.value);
  $('#plvl', m).onchange = e => $('#pbox', m).innerHTML = progBoxes(e.target.value);
  if (s) {
    const o = { ...s };
    if (String(o.Qualification).startsWith('Other')) { o.QualOther = String(o.Qualification).replace(/^Other:?\s*/, ''); o.Qualification = 'Other'; }
    f.elements.ProgrammeLevel.value = o.ProgrammeLevel; $('#pbox', m).innerHTML = progBoxes(o.ProgrammeLevel); fill(f, o); $$('[data-phone]', f).forEach(i => i.value = fmtPhone(i.value)); toggleMed();
  }
  f.onsubmit = async e => {
    e.preventDefault();
    const d = collect(f); d.Age = calcAge(d.DOB);
    if (d.Qualification === 'Other') d.Qualification = 'Other: ' + d.QualOther;
    const badPh = [['AltMobile', 'Alternative number'], ['GuardianContact', 'Guardian contact number'], ['EmergencyPhone', 'Emergency telephone']].find(([k]) => d[k] && !phoneOk(d[k]));
    const err = !/^\d{4}\/\d{4}$/.test(d.AcademicYear) ? 'Academic year must look like 2026/2027'
      : !d.FullName ? 'Full name is required' : !d.Gender ? 'Select a gender' : !d.DOB ? 'Date of birth is required'
      : !d.Nationality ? 'Nationality is required' : !d.Mobile ? 'Mobile number is required' : !phoneOk(d.Mobile) ? `Mobile number must be ${PH_LEN} digits (${PH_MASK})` : badPh ? `${badPh[1]} must be ${PH_LEN} digits (${PH_MASK})`
      : !d.ProgrammeLevel || !d.Programmes ? 'Select at least one programme'
      : (d.Age !== '' && d.Age < 18 && (!d.GuardianName || !d.GuardianContact)) ? 'Parent/Guardian name and contact are required for applicants under 18' : '';
    if (err) return $('#sfMsg', m).innerHTML = `<div class="msg err">${esc(err)}</div>`;
    const b = $('button[type=submit]', f);
    if (await busy(b, () => saveOrDraft('student', d))) { closeModal(); go('students'); }
  };
}
function studentView(s) {
  const k = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '—'}</b></div>`;
  const m = modal(`<div id="snap" class="snap" data-sid="${esc(s.StudentID)}"><div class="snap-hd">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>STUDENT ADMISSION FORM</p></div><div class="idtag">${esc(s.StudentID)}</div></div>
  <div class="g3">${k('Academic Year', s.AcademicYear)}${k('Recorded by', s.RecordedBy)}${k('Date registered', fmtDate(s.CreatedAt))}</div>
  <h4>SECTION A: PERSONAL INFORMATION</h4><div class="g3">${k('Full Name', s.FullName)}${k('Gender', s.Gender)}${k('Date of Birth', s.DOB)}${k('Age', s.Age)}${k('Nationality', s.Nationality)}${k('Marital Status', s.MaritalStatus)}
  ${k('Home Address', s.HomeAddress)}${k('District', s.District)}${k('Chiefdom/Community', s.Chiefdom)}${k('Mobile', s.Mobile)}${k('Alternative Number', s.AltMobile)}${k('Email', s.Email)}${k('National / School ID / Licence', s.NationalID)}</div>
  <h4>SECTION B: EDUCATIONAL BACKGROUND</h4><div class="g3">${k('Highest Qualification', s.Qualification)}${k('Last School', s.LastSchool)}${k('Year Completed', s.YearCompleted)}</div>
  <h4>SECTION C: PROGRAMME OF INTEREST</h4><div class="g3">${k('Level', s.ProgrammeLevel)}${k('Programmes', split(s.Programmes).join(', '))}${k('Study Period', split(s.StudyPeriod).join(', '))}</div>
  <h4>SECTION D: PARENT / GUARDIAN</h4><div class="g3">${k('Name', s.GuardianName)}${k('Relationship', s.GuardianRelation)}${k('Address', s.GuardianAddress)}${k('Contact', s.GuardianContact)}${k('Email', s.GuardianEmail)}</div>
  <h4>SECTION E: EMERGENCY CONTACT</h4><div class="g3">${k('Name', s.EmergencyName)}${k('Relationship', s.EmergencyRelation)}${k('Address', s.EmergencyAddress)}${k('Telephone', s.EmergencyPhone)}</div>
  <h4>SECTION F: MEDICAL INFORMATION</h4><div class="g3">${k('Medical condition', s.MedicalCondition)}${k('Details', s.MedicalDetails)}</div>
  <h4>SECTION G: HOW DID YOU HEAR ABOUT FBITI?</h4><div class="g3">${k('Source', split(s.HeardAbout).join(', '))}${k('Other', s.HeardOther)}</div></div>
  <div class="row end"><button class="btn gold" data-act="snap">📷 Save as Picture</button><button class="btn" data-act="snapPdf">📄 Save as PDF</button><button class="btn ghost" data-act="letter" data-id="${esc(s.StudentID)}">✉ Acceptance Letter</button><button class="btn ghost" data-act="closeModal">Close</button></div>`);
}
function printStudents() {
  const l = stList(), m = l.filter(s => s.Gender === 'Male').length;
  printDoc(`Student Register – ${S.f.stProg === 'All' ? 'All Programmes' : S.f.stProg}`,
    `<div class="meta"><span>Total: ${l.length}</span><span>Male: ${m}</span><span>Female: ${l.filter(s => s.Gender === 'Female').length}</span></div>
    <table><thead><tr><th>#</th><th>ID</th><th>Full Name</th><th>Gender</th><th>Age</th><th>Mobile</th><th>Programmes</th><th>Period</th><th>Year</th></tr></thead><tbody>
    ${l.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.StudentID)}</td><td>${esc(s.FullName)}</td><td>${esc(s.Gender)}</td><td>${esc(s.Age)}</td><td>${esc(s.Mobile)}</td><td>${esc(split(s.Programmes).join(', '))}</td><td>${esc(split(s.StudyPeriod).join(', '))}</td><td>${esc(s.AcademicYear)}</td></tr>`).join('')}</tbody></table>`);
}

/* =====================  FEES  ===================== */
const feActive = r => r.Status !== 'Voided';
const feList = () => S.fees.filter(r => (S.f.feProg === 'All' || split(r.Program).includes(S.f.feProg)) && (feActive(r) || S.f.feVoid));
async function pageFees() {
  await Promise.all([load('fees'), load('students').catch(() => { })]);
  $('#view').innerHTML = `<div class="tool"><input class="grow" id="feQ" placeholder="🔍 Search by Student ID or name…" value="${esc(S.f.feQ)}"><select id="feP">${progOpts(S.f.feProg)}</select>
  <label class="chk"><input type="checkbox" id="feV" ${S.f.feVoid ? 'checked' : ''}>Show deleted</label><button class="btn gold" data-act="addFee">＋ Add Payment</button></div><div class="stats" id="feStats"></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Student ID</th><th>Name</th><th>Programme</th><th class="num">Amount Paid</th><th class="num">Balance</th><th>Actions</th></tr></thead><tbody id="feBody"></tbody></table></div>`;
  $('#feQ').oninput = e => { S.f.feQ = e.target.value; drawFees(); };
  $('#feP').onchange = e => { S.f.feProg = e.target.value; drawFees(); };
  $('#feV').onchange = e => { S.f.feVoid = e.target.checked; drawFees(); };
  drawFees();
}
function drawFees() {
  const list = feList(), act = list.filter(feActive), q = S.f.feQ.trim().toLowerCase();
  const hit = r => q && (String(r.StudentID).toLowerCase().includes(q) || String(r.Name).toLowerCase().includes(q));
  const rows = q ? [...list.filter(hit), ...list.filter(r => !hit(r))] : list;
  const sum = k => act.reduce((a, r) => a + num(r[k]), 0);
  $('#feStats').innerHTML = `<div class="stat"><small>Total Fees</small><b>${money(sum('TotalFees'))}</b></div><div class="stat g"><small>Total Fees Paid</small><b>${money(sum('TotalPaid'))}</b></div><div class="stat r"><small>Balance</small><b>${money(sum('Balance'))}</b></div>`;
  const pr = pend('fee').map(d => { const p = [1, 2, 3, 4, 5].reduce((a, i) => a + num(d.data['P' + i + '_Amount']), 0);
    return `<tr class="pending"><td>${esc(d.data.StudentID)}</td><td>${esc(d.data.Name || '')} ${pendingBadge(d)}</td><td>—</td><td class="num">${money(p)}</td><td class="num">${money(num(d.data.TotalFees) - p)}</td><td>${discardBtn(d)}</td></tr>`; }).join('');
  const viewB = r => `<button class="ic v" title="View" data-act="viewFee" data-id="${r.FeeID}">👁</button>`;
  $('#feBody').innerHTML = pr + (rows.length ? rows.map(r => `<tr class="${feActive(r) ? '' : 'void'} ${hit(r) ? 'flash' : ''}"><td><b>${esc(r.StudentID)}</b></td>
    <td>${esc(r.Name)}${feActive(r) ? '' : ` <span class="badge b-bad" title="${esc(r.VoidReason)}">Deleted</span>`}</td><td>${esc(split(r.Program).join(', '))}</td>
    <td class="num">${money(r.TotalPaid)}</td><td class="num">${money(r.Balance)}</td>
    <td>${feActive(r) ? `${viewB(r)}<button class="ic e" title="Edit / add payment" data-act="editFee" data-id="${r.FeeID}">✏️</button><button class="ic d" title="Delete" data-act="voidFee" data-id="${r.FeeID}">🗑</button>`
      : viewB(r) + (isAdmin() ? `<button class="ic a" title="Restore" data-act="reinstateFee" data-id="${r.FeeID}">↩</button>` : '')}</td></tr>`).join('') : (pr ? '' : '<tr><td colspan="6" class="empty">No payment records</td></tr>'));
}
function feeForm(rec) {
  const pays = [1, 2, 3, 4, 5].map(i => `<div class="pay"><b>Payment ${i} <small class="by" data-by="${i}"></small></b><div class="g4">
    ${inp('Amount', 'P' + i + '_Amount', 'number', 'min="0" step="0.01" data-i="' + i + '"')}${inp('Date (auto)', 'P' + i + '_Date', 'text', 'readonly')}
    ${inp('Bank Name (optional)', 'P' + i + '_Bank')}${inp('Bank Slip No. (optional)', 'P' + i + '_Slip')}</div></div>`).join('');
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>FEES PAYMENT</p></div></div>
  <div class="userline">Recorded by: <b>${esc(S.user.fullName)}</b></div>
  <form id="ff" novalidate><div class="g3"><label class="f"><span>Student ID</span><div class="idp"><b>FBITI-</b><input id="fSid" inputmode="numeric" placeholder="001" maxlength="6" autocomplete="off"><input type="hidden" name="StudentID"></div></label>
  <label class="f"><span>Name</span><input id="fName" readonly></label><label class="f"><span>Programme</span><input id="fProg" readonly></label></div><div id="fMsg" class="hint"></div>
  ${inp('TOTAL FEES', 'TotalFees', 'number', 'min="0" step="0.01"')}${pays}
  <div class="totals"><div><small>Total Fees</small><b id="tF">0.00</b></div><div><small>Total Fees Paid</small><b id="tP">0.00</b></div><div><small>Balance</small><b id="tB">0.00</b></div></div>
  <div id="ffMsg" style="margin-top:12px"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">Save Payment</button></div></form>`, 'md');
  const f = $('#ff', m);
  let exRec = null;
  const byOf = (i, a) => (exRec && num(exRec['P' + i + '_Amount']) === a) ? (exRec['P' + i + '_By'] || exRec.RecordedBy) : S.user.fullName;
  const calc = () => {
    let paid = 0;
    for (let i = 1; i <= 5; i++) {
      const a = num(f.elements['P' + i + '_Amount'].value), d = f.elements['P' + i + '_Date'];
      if (a > 0) { if (!d.value) d.value = today(); paid += a; } else d.value = '';
      $(`[data-by="${i}"]`, m).textContent = a > 0 ? '· recorded by ' + byOf(i, a) : '';
    }
    const t = num(f.elements.TotalFees.value);
    $('#tF', m).textContent = money(t); $('#tP', m).textContent = money(paid); $('#tB', m).textContent = money(t - paid);
    $('#tB', m).style.color = t - paid > 0 ? 'var(--bad)' : 'var(--ok)'; return { t, paid };
  };
  const lookup = () => {
    const dg = $('#fSid', m).value.replace(/\D/g, ''); $('#fSid', m).value = dg;
    const id = dg ? 'FBITI-' + dg.padStart(3, '0') : ''; f.elements.StudentID.value = id;
    const st = S.students.find(s => String(s.StudentID).toUpperCase() === id);
    $('#fName', m).value = st ? st.FullName : ''; $('#fProg', m).value = st ? split(st.Programmes).join(', ') : '';
    $('#fMsg', m).textContent = id && !st ? 'No registered student with this ID' : '';
    if (f.dataset.loaded !== id) {
      f.dataset.loaded = id; $$('input[type=number],[name$=_Date],[name$=_Bank],[name$=_Slip]', f).forEach(i => i.value = '');
      const ex = st && S.fees.find(r => r.StudentID === st.StudentID && feActive(r)); exRec = ex || null; if (ex) fill(f, ex);
    }
    calc();
  };
  $('#fSid', m).oninput = lookup; f.oninput = e => { if (e.target.type === 'number') calc(); };
  if (rec) { $('#fSid', m).value = String(rec.StudentID).replace(/^FBITI-/i, ''); lookup(); }
  f.onsubmit = async e => {
    e.preventDefault(); const d = collect(f), { t, paid } = calc();
    const st = S.students.find(s => String(s.StudentID).toUpperCase() === d.StudentID);
    const err = !st ? 'Enter a valid, registered Student ID' : t <= 0 ? 'Enter the total fees' : paid > t ? 'Total paid cannot exceed total fees' : '';
    if (err) return $('#ffMsg', m).innerHTML = `<div class="msg err">${err}</div>`;
    d.Name = st.FullName; const b = $('button[type=submit]', f);
    if (await busy(b, () => saveOrDraft('fee', d))) { closeModal(); go('fees'); }
  };
}

function feeView(r) {
  const k = (l, v) => `<div class="kv"><span>${l}</span><b>${esc(v) || '—'}</b></div>`;
  const pl = [1, 2, 3, 4, 5].filter(n => num(r['P' + n + '_Amount']) > 0).map(n => `<tr><td>Payment ${n}</td><td>${esc(r['P' + n + '_Date'])}</td><td class="num">${money(r['P' + n + '_Amount'])}</td><td>${esc(r['P' + n + '_By'] || r.RecordedBy)}</td></tr>`).join('');
  modal(`<div id="snap" class="snap" data-sid="${esc(r.StudentID)}-fees"><div class="snap-hd">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>FEES PAYMENT</p></div><div class="idtag">${esc(r.StudentID)}</div></div>
  ${feActive(r) ? '' : `<div class="msg err">DELETED – ${esc(r.VoidReason)} (by ${esc(r.VoidedBy)})</div>`}
  <div class="g2">${k('Student ID', r.StudentID)}${k('Name', r.Name)}${k('Programme', split(r.Program).join(', '))}${k('Date recorded', fmtDate(r.CreatedAt))}</div>
  <table class="tbl" style="min-width:0;margin:12px 0"><thead><tr><th>Payment</th><th>Date</th><th class="num">Amount</th><th>Recorded by</th></tr></thead><tbody>${pl || '<tr><td colspan="4" class="empty">No payments yet</td></tr>'}</tbody></table><div class="totals" style="grid-template-columns:repeat(2,1fr)"><div><small>Amount Paid</small><b>${money(r.TotalPaid)}</b></div><div><small>Balance</small><b style="color:${num(r.Balance) > 0 ? 'var(--bad)' : 'var(--ok)'}">${money(r.Balance)}</b></div></div></div>
  <div class="row end"><button class="btn gold" data-act="snap">📷 Save as Image</button><button class="btn" data-act="snapPdf">📄 Save as PDF</button><button class="btn ghost" data-act="closeModal">Close</button></div>`, 'sm');
}

/* =====================  EXPENDITURE  ===================== */
async function pageExp() {
  await load('exp');
  const act = S.exp.filter(feActive), total = act.reduce((a, r) => a + num(r.Amount), 0);
  $('#view').innerHTML = `<div class="tool"><div class="stat y" style="flex:1"><small>Total Expenditure</small><b>${money(total)}</b></div>
  <button class="btn gold" data-act="addExp">＋ Add Exp</button><button class="btn ghost" data-act="printExp">🖨 Print</button></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>ID</th><th>Date</th><th>Academic Year</th><th>Name</th><th>Description</th><th class="num">Amount</th><th>Recorded by</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${pend('exp').map(d => `<tr class="pending"><td>—</td><td>${esc(d.data.Date)}</td><td>${esc(d.data.AcademicYear)}</td><td>${esc(d.data.Name)}</td><td>${esc(d.data.Description)}</td><td class="num">${money(d.data.Amount)}</td><td>${esc(S.user.fullName)}</td><td>${pendingBadge(d)}</td><td>${discardBtn(d)}</td></tr>`).join('')}
  ${S.exp.length ? S.exp.map(r => `<tr class="${feActive(r) ? '' : 'void'}"><td><b>${esc(r.ExpID)}</b></td><td>${esc(r.Date)}</td><td>${esc(r.AcademicYear) || '—'}</td><td>${esc(r.Name)}</td><td>${esc(r.Description)}</td><td class="num">${money(r.Amount)}</td><td>${esc(r.RecordedBy)}</td>
  <td>${feActive(r) ? '<span class="badge b-ok">Active</span>' : `<span class="badge b-bad" title="${esc(r.VoidReason)}">Voided</span>`}</td>
  <td>${feActive(r) ? `<button class="ic d" title="Void" data-act="voidExp" data-id="${r.ExpID}">⛔</button>` : (isAdmin() ? `<button class="ic a" title="Reinstate" data-act="reinstateExp" data-id="${r.ExpID}">↩</button>` : '')}</td></tr>`).join('') : '<tr><td colspan="9" class="empty">No expenditure recorded</td></tr>'}
  </tbody></table></div>`;
}
function expForm() {
  const total = S.exp.filter(feActive).reduce((a, r) => a + num(r.Amount), 0);
  const m = modal(`<div class="mh">${logo()}<div><h3>${CONFIG.INSTITUTION} (${CONFIG.SHORT})</h3><p>EXPENDITURE</p></div></div>
  <div class="userline">Recorded by: <b>${esc(S.user.fullName)}</b> &nbsp;|&nbsp; Total expenditure so far: <b>${money(total)}</b></div>
  <form id="ef" novalidate>${inp('Date (auto)', 'Date', 'text', 'readonly value="' + today() + '"')}${inp('Academic Year *', 'AcademicYear', 'text', 'placeholder="2026/2027" maxlength="9" inputmode="numeric" value="' + esc([...S.students.map(s => s.AcademicYear)].filter(Boolean).sort().pop() || '') + '" oninput="this.value=this.value.replace(/[^0-9\\/]/g,\'\')"')}${inp('Name', 'Name')}
  <label class="f"><span>Description</span><textarea name="Description" rows="3"></textarea></label>${inp('Amount', 'Amount', 'number', 'min="0" step="0.01"')}
  <div id="efMsg"></div><div class="row end"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" type="submit">Save</button></div></form>`, 'sm');
  $('#ef', m).onsubmit = async e => {
    e.preventDefault(); const d = collect(e.target);
    if (!/^\d{4}\/\d{4}$/.test(d.AcademicYear) || !d.Name || num(d.Amount) <= 0) return $('#efMsg', m).innerHTML = '<div class="msg err">Enter the academic year (e.g. 2026/2027), a name and a valid amount</div>';
    if (await busy($('button[type=submit]', e.target), () => saveOrDraft('exp', d))) { closeModal(); go('exp'); }
  };
}
function printExp() {
  const a = S.exp.filter(feActive);
  printDoc('Expenditure Statement', `<div class="meta"><span>Total Expenditure: ${money(a.reduce((x, r) => x + num(r.Amount), 0))}</span><span>Records: ${a.length}</span></div>
  <table><thead><tr><th>ID</th><th>Date</th><th>Academic Year</th><th>Name</th><th>Description</th><th class="num">Amount</th><th>Recorded by</th></tr></thead><tbody>
  ${a.map(r => `<tr><td>${esc(r.ExpID)}</td><td>${esc(r.Date)}</td><td>${esc(r.AcademicYear) || '—'}</td><td>${esc(r.Name)}</td><td>${esc(r.Description)}</td><td class="num">${money(r.Amount)}</td><td>${esc(r.RecordedBy)}</td></tr>`).join('')}</tbody></table>`);
}

/* =====================  REPORT  ===================== */
const NOYR = 'Not specified';
const sortYears = ks => ks.sort((a, b) => a === NOYR ? 1 : b === NOYR ? -1 : b.localeCompare(a));
const ryOk = y => !S.f.ry || S.f.ry === 'All' || (y || NOYR) === S.f.ry;
const yearOfFee = r => (S.students.find(s => s.StudentID === r.StudentID) || {}).AcademicYear || NOYR;
const yrs = () => sortYears([...new Set([...S.students.map(s => s.AcademicYear || NOYR), ...S.exp.map(e => e.AcademicYear || NOYR), ...S.fees.map(yearOfFee)])]);
const rtable = (head, rows, foot, numFrom = 1) => `<table class="tbl"><thead><tr>${head.map((h, i) => `<th${i >= numFrom ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="empty">No data</td></tr>`}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table>`;
const rrow = (cells, numFrom = 1) => `<tr>${cells.map((c, i) => `<td${i >= numFrom ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`;

function repStudents() {
  const by = {}; S.students.forEach(s => { const y = s.AcademicYear || NOYR, o = by[y] = by[y] || { m: 0, f: 0 }; s.Gender === 'Male' ? o.m++ : o.f++; });
  const ys = sortYears(Object.keys(by)), M = ys.reduce((a, y) => a + by[y].m, 0), F = ys.reduce((a, y) => a + by[y].f, 0);
  const t1 = rtable(['Academic Year', 'Total Student', 'Male', 'Female'], ys.map(y => rrow([esc(y), by[y].m + by[y].f, by[y].m, by[y].f])), rrow(['Total', M + F, M, F]));
  const map = {}; S.students.filter(s => ryOk(s.AcademicYear)).forEach(s => split(s.Programmes).forEach(p => { const o = map[p] = map[p] || { m: 0, f: 0 }; s.Gender === 'Male' ? o.m++ : o.f++; }));
  const list = S.students.filter(s => ryOk(s.AcademicYear)), m = list.filter(s => s.Gender === 'Male').length, f = list.filter(s => s.Gender === 'Female').length;
  const t2 = rtable(['Programmes', 'Male', 'Female', 'Total'], Object.entries(map).map(([p, v]) => rrow([esc(p), v.m, v.f, v.m + v.f])), rrow(['Total (unique students)', m, f, m + f]));
  return `<h3>Students by Academic Year</h3>${t1}<h3>Students by Programme${S.f.ry && S.f.ry !== 'All' ? ' – ' + esc(S.f.ry) : ''}</h3>${t2}`;
}
function repFees() {
  const act = S.fees.filter(feActive), acc = (o, r) => { o.t += num(r.TotalFees); o.p += num(r.TotalPaid); o.b += num(r.Balance); return o; };
  const by = {}, yp = {};
  act.forEach(r => { const y = yearOfFee(r), p = split(r.Program)[0] || 'Unassigned'; acc(by[y] = by[y] || { t: 0, p: 0, b: 0 }, r); acc(yp[y + '|' + p] = yp[y + '|' + p] || { y, prog: p, t: 0, p: 0, b: 0 }, r); });
  const money3 = o => [money(o.t), money(o.p), money(o.b)];
  const T = Object.values(by).reduce((a, o) => ({ t: a.t + o.t, p: a.p + o.p, b: a.b + o.b }), { t: 0, p: 0, b: 0 });
  const t1 = rtable(['Academic Year', 'Total Fees', 'Total Fees Pay', 'Balance'], sortYears(Object.keys(by)).map(y => rrow([esc(y), ...money3(by[y])])), rrow(['Total', ...money3(T)]));
  const rows = Object.values(yp).filter(o => ryOk(o.y)).sort((a, b) => (a.y === NOYR) - (b.y === NOYR) || b.y.localeCompare(a.y) || a.prog.localeCompare(b.prog));
  const T2 = rows.reduce((a, o) => ({ t: a.t + o.t, p: a.p + o.p, b: a.b + o.b }), { t: 0, p: 0, b: 0 });
  const t2 = rtable(['Academic Year', 'Programs', 'Total Fees', 'Total Fees Pay', 'Balance'], rows.map(o => rrow([esc(o.y), esc(o.prog), ...money3(o)], 2)), rrow(['Total', '', ...money3(T2)], 2), 2);
  const col = {}; act.filter(r => ryOk(yearOfFee(r))).forEach(r => [1, 2, 3, 4, 5].forEach(n => { const a = num(r['P' + n + '_Amount']); if (a > 0) { const u = r['P' + n + '_By'] || r.RecordedBy || 'Unknown', o = col[u] = col[u] || { a: 0, n: 0 }; o.a += a; o.n++; } }));
  const CT = Object.values(col).reduce((x, o) => ({ a: x.a + o.a, n: x.n + o.n }), { a: 0, n: 0 });
  const t3 = rtable(['User Name', 'Payments Recorded', 'Total Fees Collected'], Object.entries(col).sort((a, b) => b[1].a - a[1].a).map(([u, o]) => rrow([esc(u), o.n, money(o.a)])), rrow(['Total', CT.n, money(CT.a)]));
  return `<h3>Fees by Academic Year</h3>${t1}<h3>Fees by Academic Year &amp; Programme</h3>${t2}<h3>Fees Collected by User${S.f.ry && S.f.ry !== 'All' ? ' – ' + esc(S.f.ry) : ''}</h3>${t3}<p style="color:#5b6b86;font-size:12px">Each student's fees are counted under their first selected programme and the academic year of their admission.</p>`;
}
function repExp() {
  const act = S.exp.filter(feActive), by = {};
  act.forEach(r => { const y = r.AcademicYear || NOYR, o = by[y] = by[y] || { t: 0, n: 0 }; o.t += num(r.Amount); o.n++; });
  const ys = sortYears(Object.keys(by)), T = ys.reduce((a, y) => a + by[y].t, 0), N = ys.reduce((a, y) => a + by[y].n, 0);
  const t1 = rtable(['Academic Year', 'Total Expenditure', 'Records'], ys.map(y => rrow([esc(y), money(by[y].t), by[y].n])), rrow(['Total', money(T), N]));
  const u = {}; act.filter(r => ryOk(r.AcademicYear)).forEach(r => u[r.RecordedBy] = (u[r.RecordedBy] || 0) + num(r.Amount));
  const T2 = Object.values(u).reduce((a, b) => a + b, 0);
  const t2 = rtable(['User Name', 'Total Expenditure Recorded'], Object.entries(u).map(([n, v]) => rrow([esc(n), money(v)])), rrow(['Total', money(T2)]));
  return `<h3>Expenditure by Academic Year</h3>${t1}<h3>Expenditure by User${S.f.ry && S.f.ry !== 'All' ? ' – ' + esc(S.f.ry) : ''}</h3>${t2}`;
}
const REPORTS = { students: ['Student', repStudents], fees: ['Fees', repFees], exp: ['Expenditure', repExp] };
async function pageReport() {
  await Promise.all([load('students'), load('fees'), load('exp')]);
  $('#view').innerHTML = `<div class="tool"><select id="rt">${Object.entries(REPORTS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>
  <select id="ry"><option value="All">All Academic Years</option>${yrs().map(y => `<option ${S.f.ry === y ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select>
  <button class="btn ghost" data-act="printReport">🖨 Print / Save PDF (Landscape)</button></div><div class="panel" id="rb"></div>`;
  const draw = () => $('#rb').innerHTML = REPORTS[$('#rt').value][1]();
  $('#rt').onchange = draw; $('#ry').onchange = e => { S.f.ry = e.target.value; draw(); }; draw();
}

/* =====================  ADMIN  ===================== */
async function pageAdmin() {
  S.users = await api('listUsers');
  const st = { Approved: 'b-ok', Pending: 'b-wait', Denied: 'b-bad' };
  $('#view').innerHTML = `<div class="stats"><div class="stat"><small>Users</small><b>${S.users.length}</b></div><div class="stat y"><small>Pending</small><b>${S.users.filter(u => u.Status === 'Pending').length}</b></div></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Full Name</th><th>Email</th><th>Username</th><th>Role</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>
  ${S.users.map(u => `<tr><td>${esc(u.FullName)}</td><td>${esc(u.Email)}</td><td>${esc(u.Username)}</td><td>${esc(u.Role)}</td><td><span class="badge ${st[u.Status]}">${u.Status}</span></td><td>${esc(fmtDate(u.CreatedAt))}</td>
  <td>${u.UserID === S.user.id ? '<small>You</small>' : `<button class="ic a" title="Approve" data-act="approve" data-id="${u.UserID}">✔</button><button class="ic e" title="Deny" data-act="deny" data-id="${u.UserID}">✖</button><button class="ic d" title="Delete" data-act="delUser" data-id="${u.UserID}">🗑</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}
async function setStatus(id, status) {
  try { const r = await api('setUserStatus', { id, status }); toast(`User ${status.toLowerCase()}${r.emailed ? ' – email sent' : ' (email could not be sent)'}`, r.emailed ? 'ok' : 'warn'); go('admin'); }
  catch (e) { toast(e.message, 'err'); }
}

async function pageBin() {
  S.bin = await api('listBin');
  $('#view').innerHTML = `<div class="panel"><b>Recycle Bin</b><p style="color:var(--mute);margin-top:6px;line-height:1.6">Deleted students and users are kept for 30 days and can be restored. Financial records (fees and expenditure) are never deleted – they are <b>voided</b> with a reason and can be reinstated from their own pages.</p></div>
  <div class="wrap"><table class="tbl"><thead><tr><th>Type</th><th>Record</th><th>Deleted by</th><th>Deleted</th><th>Auto-removal</th><th>Actions</th></tr></thead><tbody>
  ${S.bin.length ? S.bin.map(b => `<tr><td><span class="badge b-info">${esc(b.Type)}</span></td><td>${esc(b.Label)}</td><td>${esc(b.DeletedBy)}</td><td>${esc(fmtDate(b.DeletedAt))}</td><td>${Math.max(0, Math.ceil((Date.parse(b.ExpiresAt) - Date.now()) / 86400000))} day(s)</td>
  <td><button class="btn sm" data-act="restore" data-id="${b.BinID}">↩ Restore</button> <button class="btn sm danger" data-act="purge" data-id="${b.BinID}">Delete forever</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">The recycle bin is empty</td></tr>'}</tbody></table></div>`;
}

/* =====================  PROFILE  ===================== */
function pageProfile() {
  $('#view').innerHTML = `<div class="g2"><div class="panel"><h3 style="color:var(--navy);margin-bottom:4px">Change username</h3><p class="sub" style="color:var(--mute);margin-bottom:14px">Signed in as <b>${esc(S.user.username)}</b></p><div id="pm1"></div>
  <form id="pf1">${inp('New username', 'newUsername', 'text', 'required minlength="3"')}<button class="btn">Update username</button></form></div>
  <div class="panel"><h3 style="color:var(--navy);margin-bottom:14px">Change password</h3><div id="pm2"></div>
  <form id="pf2">${inp('Old password', 'oldPassword', 'password', 'required')}${inp('New password', 'newPassword', 'password', 'required minlength="6"')}${inp('Confirm new password', 'confirm', 'password', 'required')}<button class="btn">Update password</button></form></div></div>`;
  const send = async (e, box, payload, after) => {
    e.preventDefault(); const m = t => $(box).innerHTML = `<div class="msg ${t[0]}">${esc(t[1])}</div>`;
    try { const r = await busy($('button', e.target), () => api('updateProfile', payload)); after(r); m(['ok', 'Saved successfully']); }
    catch (x) { m(['err', x.server ? x.message : 'No connection']); }
  };
  $('#pf1').onsubmit = e => send(e, '#pm1', { newUsername: collect(e.target).newUsername }, r => { S.user.username = r.username; localStorage.setItem('fbiti_session', JSON.stringify({ token: S.token, user: S.user })); e.target.reset(); });
  $('#pf2').onsubmit = e => {
    const d = collect(e.target);
    if (d.newPassword !== d.confirm) { e.preventDefault(); return $('#pm2').innerHTML = '<div class="msg err">New passwords do not match</div>'; }
    send(e, '#pm2', { oldPassword: d.oldPassword, newPassword: d.newPassword }, () => e.target.reset());
  };
}

/* ---------- Install as app (PWA) ---------- */
let deferredInstall = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
function initInstall() {
  const b = $('#installBtn'); if (!b) return;
  b.hidden = isStandalone() || !(deferredInstall || isIOS);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; initInstall(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; initInstall(); toast('FBITI SYS installed', 'ok'); });

const PAGES = { home: pageHome, students: pageStudents, fees: pageFees, exp: pageExp, report: pageReport, admin: pageAdmin, bin: pageBin, profile: pageProfile };

/* =====================  ACTIONS (click delegation)  ===================== */
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.server ? e.message : 'Action failed – check your connection', 'err'); } };
const ACT = {
  install: async () => {
    if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; initInstall(); }
    else if (isIOS) modal(`<h3 style="color:var(--navy);margin-bottom:10px">Install FBITI SYS</h3><p style="line-height:1.8">1. Tap the <b>Share</b> button in Safari.<br>2. Choose <b>Add to Home Screen</b>.<br>3. Tap <b>Add</b>.</p><div class="row end"><button class="btn" data-act="closeModal">Got it</button></div>`, 'sm');
  },
  letter: id => showLetters([S.students.find(s => s.StudentID === id)]),
  printLetters: guard(async () => {
    let l = S.students.filter(s => S.sel.has(s.StudentID));
    if (!l.length) { l = stList(); if (!l.length) return toast('No students to print', 'warn'); if (!await confirmBox(`No students are selected. Create acceptance letters for all ${l.length} student(s) shown?`, 'Continue')) return; }
    showLetters(l);
  }),
  selOne: (id, b) => { b.checked ? S.sel.add(id) : S.sel.delete(id); updSel(); },
  selAll: (_, b) => { stList().forEach(s => b.checked ? S.sel.add(s.StudentID) : S.sel.delete(s.StudentID)); drawStudents(); },
  docPrint: guard(async () => { const { title, inner, o } = CUR; const f = await mkFrame(docHtml(inner, { ...o, title }), docWidth(o)); f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 180000); }),
  docPdf: guard(async () => {
    if (libsMissing()) return; const { title, inner, o } = CUR;
    await withWm(async nowm => { const f = await mkFrame(docHtml(inner, { ...o, title, nowm }), docWidth(o)); try { await pdfOut(f, fileName(title) + '.pdf', !!o.landscape); } finally { f.remove(); } });
    toast('PDF saved', 'ok');
  }),
  snap: guard(async () => {
    if (libsMissing()) return; const el = $('#snap'), name = el.dataset.sid;
    await withWm(async nowm => { const f = await mkFrame(docHtml(`<div class="appwrap">${el.outerHTML}</div>`, { mode: 'app', nowm }), DOCW.app); try { await imageOut(f.contentDocument.getElementById('snap'), name + '.png'); } finally { f.remove(); } });
    toast('Picture saved', 'ok');
  }),
  snapPdf: guard(async () => {
    if (libsMissing()) return; const el = $('#snap'), name = el.dataset.sid;
    await withWm(async nowm => { const f = await mkFrame(docHtml(`<div class="appwrap">${el.outerHTML}</div>`, { mode: 'app', nowm }), DOCW.app); try { await pdfOut(f, name + '.pdf', false); } finally { f.remove(); } });
    toast('PDF saved', 'ok');
  }),
  closeModal, auth: showAuth, go, logout: () => logout(), menu: () => $('#side').classList.toggle('open'), syncNow: () => syncDrafts(true),
  discard: id => { putDrafts(drafts().filter(d => d.id !== id)); go(S.page); },
  addStudent: () => studentForm(), editStudent: id => studentForm(S.students.find(s => s.StudentID === id)), viewStudent: id => studentView(S.students.find(s => s.StudentID === id)),
  delStudent: guard(async id => {
    const s = S.students.find(x => x.StudentID === id);
    if (!await confirmBox(`Move <b>${esc(s.FullName)}</b> (${esc(id)}) to the Recycle Bin? An administrator can restore it within 30 days. Fee records are kept.`, 'Delete')) return;
    await api('deleteStudent', { id }); toast('Moved to Recycle Bin', 'ok'); go('students');
  }),
  printStudents,
  addFee: () => feeForm(), viewFee: id => feeView(S.fees.find(r => r.FeeID === id)), editFee: id => feeForm(S.fees.find(r => r.FeeID === id)),
  voidFee: guard(async id => { const r = await ask('Delete payment record', 'Reason for deleting'); if (!r) return; await api('voidFee', { id, reason: r }); toast('Payment record deleted (kept in the audit trail)', 'ok'); go('fees'); }),
  reinstateFee: guard(async id => { await api('reinstateFee', { id }); toast('Record reinstated', 'ok'); go('fees'); }),
  addExp: () => expForm(), printExp,
  voidExp: guard(async id => { const r = await ask('Void expenditure record', 'Reason for voiding'); if (!r) return; await api('voidExpenditure', { id, reason: r }); toast('Record voided', 'ok'); go('exp'); }),
  reinstateExp: guard(async id => { await api('reinstateExpenditure', { id }); toast('Record reinstated', 'ok'); go('exp'); }),
  printReport: () => { const k = $('#rt').value; printDoc(REPORTS[k][0] + ' Report', REPORTS[k][1]()); },
  approve: id => setStatus(id, 'Approved'), deny: id => setStatus(id, 'Denied'),
  delUser: guard(async id => { if (!await confirmBox('Move this user to the Recycle Bin?', 'Delete')) return; await api('deleteUser', { id }); toast('User moved to Recycle Bin', 'ok'); go('admin'); }),
  restore: guard(async id => { await api('restoreBin', { id }); toast('Record restored', 'ok'); go('bin'); }),
  purge: guard(async id => { if (!await confirmBox('Permanently delete this item? This cannot be undone.', 'Delete forever')) return; await api('purgeBin', { id }); go('bin'); })
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = ACT[b.dataset.act]; if (f) { if (b.type !== 'checkbox') e.preventDefault(); f(b.dataset.id, b); }
});
