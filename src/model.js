export const emptyData = () => ({ version: 1, boards: [], products: [] });
export const validMonth = value => typeof value === 'string' && /^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/.test(value);
export function monthAfter(month, offset) {
  if (!validMonth(month) || !Number.isInteger(offset)) throw Error('Ogiltig månad.');
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const result = date.toISOString().slice(0, 7);
  if (!validMonth(result)) throw Error('Månaden ligger utanför 1900–9999.');
  return result;
}
const fail = message => { throw Error(message); };
const text = (value, label, required = true) => {
  if (typeof value !== 'string' || value.length > 500 || (required && !value.trim())) fail(`Kontrollera ${label}.`);
};
const integer = (n, min, max, label) => {
  if (!Number.isSafeInteger(n) || n < min || n > max) fail(`Kontrollera ${label} (${min}–${max}).`);
};
export function validateData(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.boards) || !Array.isArray(data.products)) fail('Ogiltig Virke-kopia eller version.');
  if (data.boards.length > 10000 || data.products.length > 10000) fail('För många poster.');
  const boardIds = new Set(), productIds = new Set();
  const names = new Set();
  for (const b of data.boards) {
    text(b.id, 'brädans id'); text(b.name, 'brädans namn'); text(b.species, 'träslag', false); text(b.grade, 'kvalitet', false);
    const name = b.name.trim().toLocaleLowerCase('sv');
    if (boardIds.has(b.id) || names.has(name)) fail('Brädor måste ha unika id och namn.');
    boardIds.add(b.id); names.add(name);
    for (const key of ['thickness', 'width', 'length']) integer(b[key], 1, 20000, 'mått i hela mm');
  }
  names.clear();
  for (const p of data.products) {
    text(p.id, 'produktens id'); text(p.name, 'produktens namn'); text(p.notes, 'anteckningar', false);
    const name = p.name.trim().toLocaleLowerCase('sv');
    if (productIds.has(p.id) || names.has(name)) fail('Produkter måste ha unika id och namn.');
    productIds.add(p.id); names.add(name);
    if (!Array.isArray(p.recipe) || !p.recipe.length || p.recipe.length > 1000) fail('Lägg till minst en bräda i receptet.');
    for (const row of p.recipe) {
      if (!boardIds.has(row.boardId)) fail('En bräda i receptet saknas.');
      integer(row.pieces, 1, 1000000, 'antal brädor per produkt');
    }
    if (!p.plans || typeof p.plans !== 'object' || Array.isArray(p.plans)) fail('Ogiltig produktionsplan.');
    for (const [month, quantity] of Object.entries(p.plans)) {
      if (!validMonth(month)) fail('Ogiltig månad i produktionsplanen.');
      integer(quantity, 0, 1000000000, 'produktion');
    }
  }
  return data;
}
export const volume = b => b.thickness * b.width * b.length / 1e9;
export function report(data, from, to, waste = 0) {
  validateData(data);
  if (!validMonth(from) || !validMonth(to) || from > to) fail('Välj ett giltigt månadsintervall.');
  if (!Number.isFinite(waste) || waste < 0 || waste > 100 || Math.abs(waste * 10 - Math.round(waste * 10)) > 1e-8) fail('Spillpåslag måste vara 0–100 %, med högst en decimal.');
  const rows = new Map();
  let planned = 0, quantity = 0;
  for (const p of data.products) {
    for (const [month, count] of Object.entries(p.plans)) {
      if (month < from || month > to) continue;
      planned++; quantity += count;
      for (const r of p.recipe) {
        if (!rows.has(r.boardId)) rows.set(r.boardId, { board: data.boards.find(b => b.id === r.boardId), pieces: 0, sources: [] });
        const row = rows.get(r.boardId), pieces = count * r.pieces;
        if (!Number.isSafeInteger(pieces) || !Number.isSafeInteger(row.pieces + pieces)) fail('För stort behov för säker beräkning.');
        row.pieces += pieces;
        row.sources.push({ product: p.name, month, quantity: count, perProduct: r.pieces, pieces });
      }
    }
  }
  const result = [...rows.values()].map(row => {
    // Integer arithmetic keeps rounding exact even for large production plans.
    const numerator = BigInt(row.pieces) * BigInt(1000 + Math.round(waste * 10));
    const purchase = Number((numerator + 999n) / 1000n);
    if (!Number.isSafeInteger(purchase)) fail('För stort behov för säker beräkning.');
    return { ...row, purchase, meters: purchase * row.board.length / 1000, cubicMeters: purchase * volume(row.board) };
  }).sort((a, b) => a.board.name.localeCompare(b.board.name, 'sv', { numeric: true }));
  const pieces = result.reduce((s, r) => s + r.purchase, 0);
  if (!Number.isSafeInteger(pieces) || !Number.isSafeInteger(quantity)) fail('För stort behov för säker beräkning.');
  return { rows: result, planned, quantity, pieces, cubicMeters: result.reduce((s, r) => s + r.cubicMeters, 0) };
}
export function csv(result) {
  const cell = value => {
    let s = String(value);
    if (/^[=+@\-\t\r\n]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [['Bräda', 'Träslag', 'Kvalitet', 'Tjocklek mm', 'Bredd mm', 'Längd mm', 'Netto st', 'Inkl. spill st', 'Löpmeter', 'm³'], ...result.rows.map(r => [r.board.name, r.board.species, r.board.grade, r.board.thickness, r.board.width, r.board.length, r.pieces, r.purchase, r.meters.toFixed(3).replace('.', ','), r.cubicMeters.toFixed(6).replace('.', ',')])].map(row => row.map(cell).join(';')).join('\r\n');
}
