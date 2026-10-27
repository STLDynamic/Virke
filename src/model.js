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
  const boards = new Map(data.boards.map(b => [b.id, b]));
  let planned = 0, quantity = 0;
  for (const p of data.products) {
    for (const [month, count] of Object.entries(p.plans)) {
      if (month < from || month > to) continue;
      planned++; quantity += count;
      for (const r of p.recipe) {
        const board = boards.get(r.boardId);
        // Material identity is the cross-section only; length is used for volume.
        const key = `${board.thickness}x${board.width}`;
        if (!rows.has(key)) rows.set(key, {
          thickness: board.thickness, width: board.width,
          material: `${board.thickness} × ${board.width}`,
          pieces: 0, netCubicMeters: 0, months: new Map(), sources: [],
        });
        const row = rows.get(key), pieces = count * r.pieces;
        if (!Number.isSafeInteger(pieces) || !Number.isSafeInteger(row.pieces + pieces)) fail('För stort behov för säker beräkning.');
        const netCubicMeters = pieces * volume(board);
        row.pieces += pieces;
        row.netCubicMeters += netCubicMeters;
        row.months.set(month, (row.months.get(month) || 0) + netCubicMeters);
        row.sources.push({ board, product: p.name, month, quantity: count, perProduct: r.pieces, pieces, netCubicMeters });
      }
    }
  }
  const multiplier = (1000 + Math.round(waste * 10)) / 1000;
  const result = [...rows.values()].map(row => ({
    ...row,
    cubicMeters: row.netCubicMeters * multiplier,
    months: [...row.months].sort(([a], [b]) => a.localeCompare(b)).map(([month, netCubicMeters]) => ({ month, netCubicMeters, cubicMeters: netCubicMeters * multiplier })),
  })).sort((a, b) => a.thickness - b.thickness || a.width - b.width);
  const pieces = result.reduce((s, r) => s + r.pieces, 0);
  if (!Number.isSafeInteger(pieces) || !Number.isSafeInteger(quantity)) fail('För stort behov för säker beräkning.');
  return { rows: result, planned, quantity, pieces, netCubicMeters: result.reduce((s, r) => s + r.netCubicMeters, 0), cubicMeters: result.reduce((s, r) => s + r.cubicMeters, 0) };
}
export function csv(result) {
  const cell = value => {
    let s = String(value);
    if (/^[=+@\-\t\r\n]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const decimal = n => n.toFixed(6).replace('.', ',');
  // One row per material and planned month, including the selected period total.
  return '\uFEFF' + [['Material', 'Tjocklek mm', 'Bredd mm', 'Månad', 'Förbrukning m³', 'Inkl. spill m³', 'Period totalt netto m³', 'Period totalt inkl. spill m³'], ...result.rows.flatMap(r => r.months.map(m => [r.material, r.thickness, r.width, m.month, decimal(m.netCubicMeters), decimal(m.cubicMeters), decimal(r.netCubicMeters), decimal(r.cubicMeters)]))].map(row => row.map(cell).join(';')).join('\r\n');
}
