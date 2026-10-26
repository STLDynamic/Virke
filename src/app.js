import { emptyData, validateData, monthAfter, validMonth, volume, report, csv } from './model.js';

const $ = selector => document.querySelector(selector);
const KEY = 'virke.planning.v1';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, digits = 0) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: digits }).format(n);
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthLabel = m => new Intl.DateTimeFormat('sv-SE', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T12:00:00Z`));
let data = emptyData(), view = 'boards', start = today.slice(0, 7), storageBroken = false;
const drafts = new Map();
function warn(message) { $('#warning').textContent = message; $('#warning').hidden = !message; }
function notify(message) { $('#status').textContent = message; }
try { const raw = localStorage.getItem(KEY); if (raw !== null) data = validateData(JSON.parse(raw)); }
catch { storageBroken = true; warn('Sparade uppgifter kunde inte läsas. Befintlig data skrivs inte över. Återställ en giltig säkerhetskopia för att fortsätta.'); }
function persist(next, recovery = false) {
  try {
    if (storageBroken && !recovery) throw Error('Återställ först en giltig säkerhetskopia.');
    validateData(next); localStorage.setItem(KEY, JSON.stringify(next));
    data = next; storageBroken = false; warn(''); return true;
  } catch (error) { warn(`Kunde inte spara: ${error.message}`); return false; }
}
const dims = b => `${b.thickness} × ${b.width} × ${b.length} mm`;
const boardInfo = b => `${b.name} · ${dims(b)}`;
const findBoard = id => data.boards.find(b => b.id === id);
const field = (form, name) => form.elements.namedItem(name);
function planValue(p, m) { return drafts.get(p.id)?.get(m) ?? (Object.hasOwn(p.plans, m) ? String(p.plans[m]) : ''); }
const validQuantity = value => value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 1e9);
function pending() { return [...drafts.values()].reduce((s, m) => s + m.size, 0); }
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const meta = {
  boards: ['Full koll på ditt virke.', 'Alla brädor, mått och kvaliteter på ett ställe.', 'Dina brädor', 'Registrera de färdiga brädor som används i produktionen.'],
  products: ['Varje pall börjar med ett recept.', 'Koppla brädor till dina produkter. Vi summerar behovet.', 'Dina produkter', 'Brädrecept per färdig produkt.'],
  plan: ['Planera nästa produktion.', 'Ange hela månadens volym per produkt.', 'Månadsplan', 'Sex månader åt gången. Spara planen för att uppdatera materialbehovet.'],
  report: ['Rätt virke. I rätt mängd.', 'Från produktionsplan till ett samlat materialbehov.', 'Materialrapport', 'Summerat per brädartikel, med underlag för varje produkt och månad.'],
};
function stats(values) {
  $('#stats').innerHTML = values.map(([label, value, hint]) => `<div class="stat"><span class="eyebrow">${esc(label)}</span><div class="stat-value">${value}</div><p>${esc(hint)}</p></div>`).join('');
}
function table(head, rows) {
  $('#table').innerHTML = `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="empty">Här är det tomt ännu. Lägg till dina uppgifter eller prova exempeldata.</td></tr>`}</tbody></table>`;
}
function render() {
  const [title, subtitle, section, description] = meta[view];
  $('#title').textContent = title; $('#subtitle').textContent = subtitle;
  $('#section-title').textContent = section; $('#section-description').textContent = description;
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  $('#add').hidden = !['boards', 'products'].includes(view);
  $('#add').textContent = view === 'products' ? '+ Lägg till produkt' : '+ Lägg till bräda';
  $('#catalog-tools').hidden = !['boards', 'products'].includes(view);
  $('#plan-tools').hidden = view !== 'plan'; $('#report-tools').hidden = view !== 'report';
  $('#demo').hidden = data.boards.length > 0 || data.products.length > 0;
  $('#report-caption').textContent = '';
  stats([['Brädartiklar', fmt(data.boards.length), 'Olika mått och kvaliteter'], ['Produkter', fmt(data.products.length), 'Med sparade brädrecept'], ['Planerade månader', fmt(new Set(data.products.flatMap(p => Object.keys(p.plans))).size), 'Månader med produktionsplan']]);
  if (view === 'boards') renderBoards();
  if (view === 'products') renderProducts();
  if (view === 'plan') renderPlan();
  if (view === 'report') renderReport();
}
function matches(value) { return value.toLocaleLowerCase('sv').includes($('#search').value.trim().toLocaleLowerCase('sv')); }
function renderBoards() {
  const rows = data.boards.filter(b => matches(`${b.name} ${b.species} ${b.grade} ${dims(b)}`));
  table(['ARTIKEL', 'MÅTT · T × B × L', 'TRÄSLAG / KVALITET', 'VOLYM / ST', ''], rows.map(b => `<tr><td><strong>${esc(b.name)}</strong></td><td>${dims(b)}</td><td>${esc(b.species || '—')}<span class="muted">${esc(b.grade)}</span></td><td>${fmt(volume(b), 6)} m³</td><td><button data-edit-board="${esc(b.id)}">Redigera</button></td></tr>`).join(''));
}
function renderProducts() {
  table(['PRODUKT', 'BRÄDRECEPT', 'BRÄDOR / PRODUKT', ''], data.products.filter(p => matches(`${p.name} ${p.notes}`)).map(p => `<tr><td><strong>${esc(p.name)}</strong><span class="muted">${esc(p.notes)}</span></td><td>${p.recipe.map(r => `<span class="recipe-summary">${fmt(r.pieces)} st × ${esc(boardInfo(findBoard(r.boardId)))}</span>`).join('')}</td><td>${fmt(p.recipe.reduce((s, r) => s + r.pieces, 0))} st</td><td><button data-edit-product="${esc(p.id)}">Redigera</button></td></tr>`).join(''));
}
function renderPlan() {
  $('#plan-month').value = start;
  $('#prev').disabled = start < '1900-07'; $('#next').disabled = start > '9999-01';
  const months = Array.from({ length: 6 }, (_, i) => monthAfter(start, i));
  table(['PRODUKT', ...months.map(m => esc(monthLabel(m)))], data.products.map(p => `<tr><td><strong>${esc(p.name)}</strong><span class="muted">Antal färdiga produkter</span></td>${months.map(m => { const v = planValue(p, m); return `<td class="plan-cell"><input type="number" min="0" max="1000000000" step="1" inputmode="numeric" placeholder="Ej planerat" data-plan-product="${esc(p.id)}" data-month="${m}" value="${validQuantity(v) ? esc(v) : ''}" aria-invalid="${!validQuantity(v)}" aria-label="${esc(p.name)} ${m}"></td>`; }).join('')}</tr>`).join(''));
  updateDraftStatus();
}
function updateDraftStatus() {
  $('#draft-status').textContent = pending() ? `${pending()} osparade ändringar` : 'Alla ändringar sparade';
  $('#save-plan').disabled = $('#discard-plan').disabled = !pending();
}
function getReport() {
  if ($('#waste').value === '') throw Error('Ange spillpåslag, minst 0 %.');
  return report(data, $('#report-from').value, $('#report-to').value, Number($('#waste').value));
}
function renderReport() {
  try {
    const r = getReport();
    stats([['Produktion', fmt(r.quantity), `${r.planned} produktmånader med plan`], ['Brädor inkl. spill', fmt(r.pieces), `${$('#waste').value} % spillpåslag`], ['Volym inkl. spill', `${fmt(r.cubicMeters, 3)} <small>m³</small>`, 'Färdiga brädmått']]);
    $('#report-caption').textContent = `${$('#report-from').value} – ${$('#report-to').value} · Spill: ${$('#waste').value} % · ${pending() ? 'OBS! Osparade ändringar ingår inte. ' : ''}Endast sparade produktmånader ingår. Kontrollera att alla önskade produkter är planerade.`;
    table(['BRÄDA', 'NETTO', 'INKL. SPILL', 'LÖPMETER', 'VOLYM', 'UNDERLAG'], r.rows.map(row => `<tr><td><strong>${esc(row.board.name)}</strong><span class="muted">${dims(row.board)}</span><span class="muted">${esc(row.board.species)} · ${esc(row.board.grade)}</span></td><td>${fmt(row.pieces)} st</td><td><strong>${fmt(row.purchase)} st</strong></td><td>${fmt(row.meters, 2)} m</td><td>${fmt(row.cubicMeters, 4)} m³</td><td><details><summary>Visa beräkning</summary>${row.sources.map(s => `<p>${esc(s.product)} · ${s.month}<br>${fmt(s.quantity)} × ${fmt(s.perProduct)} = ${fmt(s.pieces)} st</p>`).join('')}</details></td></tr>`).join(''));
    if (!r.planned) $('#report-caption').textContent += ' Ingen produktion är planerad i detta intervall.';
    $('#csv').disabled = $('#print').disabled = false;
  } catch (error) { $('#table').textContent = error.message; $('#csv').disabled = $('#print').disabled = true; }
}
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; render(); });
$('#search').oninput = () => { if (view === 'boards') renderBoards(); else renderProducts(); };
$('#add').onclick = () => view === 'boards' ? editBoard() : editProduct();
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(`#${b.dataset.close}`).close());
$('#table').onclick = e => {
  const b = e.target.closest('[data-edit-board]'), p = e.target.closest('[data-edit-product]');
  if (b) editBoard(b.dataset.editBoard); if (p) editProduct(p.dataset.editProduct);
};
$('#table').oninput = e => {
  const el = e.target; if (!el.matches('[data-plan-product]')) return;
  const p = data.products.find(p => p.id === el.dataset.planProduct), month = el.dataset.month;
  const value = el.validity.badInput ? 'invalid' : el.value;
  const original = Object.hasOwn(p.plans, month) ? String(p.plans[month]) : '';
  if (value === original) { drafts.get(p.id)?.delete(month); if (!drafts.get(p.id)?.size) drafts.delete(p.id); }
  else { if (!drafts.has(p.id)) drafts.set(p.id, new Map()); drafts.get(p.id).set(month, value); }
  el.setAttribute('aria-invalid', String(!validQuantity(value))); updateDraftStatus();
};
function savePlan() {
  for (const entries of drafts.values()) for (const value of entries.values()) if (!validQuantity(value)) { warn('Ange hela produkter mellan 0 och 1 000 000 000.'); return; }
  const next = structuredClone(data);
  for (const p of next.products) for (const [m, value] of drafts.get(p.id) || []) { if (value === '') delete p.plans[m]; else p.plans[m] = Number(value); }
  if (persist(next)) { drafts.clear(); render(); notify('Produktionsplanen har sparats.'); }
}
$('#save-plan').onclick = savePlan;
$('#discard-plan').onclick = () => { if (confirm('Återställ alla osparade planändringar, även i andra månader?')) { drafts.clear(); render(); } };
$('#plan-month').onchange = e => { if (validMonth(e.target.value) && e.target.value <= '9999-07') { start = e.target.value; renderPlan(); } else e.target.value = start; };
$('#prev').onclick = () => { start = monthAfter(start, -6); renderPlan(); };
$('#next').onclick = () => { start = monthAfter(start, 6); renderPlan(); };
$('#report-from').value = $('#report-to').value = start;
$('#generate').onclick = renderReport;
for (const id of ['report-from', 'report-to', 'waste']) $(`#${id}`).onchange = () => { if (view === 'report') renderReport(); };
$('#csv').onclick = () => { try { const r = getReport(); download(`virke-${$('#report-from').value}-${$('#report-to').value}-spill-${$('#waste').value}.csv`, csv(r), 'text/csv;charset=utf-8'); } catch (e) { warn(e.message); } };
$('#print').onclick = () => { renderReport(); if (!$('#print').disabled) window.print(); };

const bf = $('#board-form'), pf = $('#product-form');
function editBoard(id) {
  const b = data.boards.find(b => b.id === id); bf.reset();
  for (const k of ['id', 'name', 'species', 'grade', 'thickness', 'width', 'length']) field(bf, k).value = b?.[k] ?? '';
  $('#board-title').textContent = b ? 'Redigera bräda' : 'Ny bräda';
  $('#delete-board').hidden = !b; $('#board-error').textContent = ''; $('#board-dialog').showModal();
}
bf.onsubmit = e => {
  e.preventDefault(); const old = field(bf, 'id').value;
  const b = { id: old || crypto.randomUUID() };
  for (const k of ['name', 'species', 'grade']) b[k] = field(bf, k).value.trim();
  for (const k of ['thickness', 'width', 'length']) b[k] = Number(field(bf, k).value);
  const next = { ...data, boards: old ? data.boards.map(x => x.id === old ? b : x) : [...data.boards, b] };
  try { validateData(next); if (persist(next)) { $('#board-dialog').close(); render(); notify('Brädan har sparats.'); } } catch (e) { $('#board-error').textContent = e.message; }
};
$('#delete-board').onclick = () => {
  const id = field(bf, 'id').value;
  if (data.products.some(p => p.recipe.some(r => r.boardId === id))) { $('#board-error').textContent = 'Brädan används i ett recept. Ändra produkten först.'; return; }
  if (confirm('Ta bort den här brädan?') && persist({ ...data, boards: data.boards.filter(b => b.id !== id) })) { $('#board-dialog').close(); render(); }
};
function recipeRow(row = {}) {
  const el = document.createElement('div'); el.className = 'recipe-row';
  el.innerHTML = `<label>Bräda<select name="board" required><option value="">Välj bräda</option>${data.boards.map(b => `<option value="${esc(b.id)}" ${b.id === row.boardId ? 'selected' : ''}>${esc(boardInfo(b))}</option>`).join('')}</select></label><label>Antal / produkt<input name="pieces" type="number" min="1" max="1000000" step="1" value="${row.pieces || 1}" required></label><button type="button" aria-label="Ta bort receptrad">✕</button>`;
  el.querySelector('button').onclick = () => el.remove(); $('#recipe').append(el);
}
function editProduct(id) {
  if (!data.boards.length) { warn('Lägg till en bräda innan du skapar en produkt.'); return; }
  const p = data.products.find(p => p.id === id); pf.reset();
  for (const k of ['id', 'name', 'notes']) field(pf, k).value = p?.[k] || '';
  $('#recipe').replaceChildren(); (p?.recipe || [{}]).forEach(recipeRow);
  $('#product-title').textContent = p ? 'Redigera produkt' : 'Ny produkt';
  $('#delete-product').hidden = !p; $('#product-error').textContent = ''; $('#product-dialog').showModal();
}
$('#add-recipe').onclick = () => recipeRow();
pf.onsubmit = e => {
  e.preventDefault(); const old = data.products.find(p => p.id === field(pf, 'id').value);
  const p = { id: old?.id || crypto.randomUUID(), name: field(pf, 'name').value.trim(), notes: field(pf, 'notes').value.trim(), plans: old?.plans || {}, recipe: [...$('#recipe').children].map(row => ({ boardId: row.querySelector('select').value, pieces: Number(row.querySelector('input').value) })) };
  const next = { ...data, products: old ? data.products.map(x => x.id === p.id ? p : x) : [...data.products, p] };
  try { validateData(next); if (persist(next)) { $('#product-dialog').close(); render(); notify('Produkten har sparats.'); } } catch (e) { $('#product-error').textContent = e.message; }
};
$('#delete-product').onclick = () => {
  const id = field(pf, 'id').value;
  if (confirm('Ta bort produkten och alla dess produktionsplaner?') && persist({ ...data, products: data.products.filter(p => p.id !== id) })) { drafts.delete(id); $('#product-dialog').close(); render(); }
};
$('#backup').onclick = () => {
  if (storageBroken) { warn('Sparade data kunde inte läsas. Återställ en giltig säkerhetskopia.'); return; }
  if (pending()) { warn('Spara eller återställ planändringarna före export.'); return; }
  download(`virke-backup-${today}.json`, JSON.stringify(data, null, 2), 'application/json');
};
$('#restore').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 10000000) throw Error('Kopian är för stor (max 10 MB).');
    const next = validateData(JSON.parse(await file.text()));
    if (confirm('Ersätt alla aktuella data och osparade planer med säkerhetskopian?') && persist(next, true)) { drafts.clear(); render(); notify('Säkerhetskopian har importerats.'); }
  } catch (error) { warn(`Import misslyckades: ${error.message}`); }
  e.target.value = '';
};
$('#demo').onclick = () => {
  if (data.boards.length || data.products.length) return;
  const boards = [
    { id: 'deck', name: 'Däckbräda 22×100×1200', species: 'Gran', grade: 'Pallvirke', thickness: 22, width: 100, length: 1200 },
    { id: 'runner', name: 'Medbräda 22×100×800', species: 'Gran', grade: 'Pallvirke', thickness: 22, width: 100, length: 800 },
  ];
  const products = [{ id: 'p1006', name: '1006 · Exempelpall', notes: 'Exempeldata — ersätt med egna uppgifter.', recipe: [{ boardId: 'deck', pieces: 7 }, { boardId: 'runner', pieces: 3 }], plans: { [today.slice(0, 7)]: 1000 } }];
  if (persist({ version: 1, boards, products })) { render(); notify('Exempeldata har lagts till. Du kan redigera eller ta bort dem.'); }
};
window.addEventListener('beforeunload', e => { if (pending()) { e.preventDefault(); e.returnValue = ''; } });
$('#date').textContent = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'long', timeZone: 'Europe/Stockholm' }).format(new Date());
render();
