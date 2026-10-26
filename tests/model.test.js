import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, validateData, monthAfter, validMonth, volume, report, csv } from '../src/model.js';

function fixture() {
  return { version: 1, boards: [
    { id: 'a', name: 'Däck', species: 'Gran', grade: 'Pall', thickness: 22, width: 100, length: 1200 },
    { id: 'b', name: 'Med', species: 'Gran', grade: 'Pall', thickness: 22, width: 100, length: 800 },
  ], products: [
    { id: 'p', name: '1006', notes: '', recipe: [{ boardId: 'a', pieces: 5 }, { boardId: 'a', pieces: 2 }, { boardId: 'b', pieces: 3 }], plans: { '2026-11': 1000, '2026-12': 500 } },
    { id: 'q', name: '1007', notes: '', recipe: [{ boardId: 'a', pieces: 4 }], plans: { '2026-11': 100 } },
  ] };
}
test('sumuje powtarzające się deski i różne produkty, wyklucza inne miesiące', () => {
  const r = report(fixture(), '2026-11', '2026-11');
  assert.equal(r.rows.find(r => r.board.id === 'a').pieces, 7400);
  assert.equal(r.rows.find(r => r.board.id === 'b').pieces, 3000);
  assert.equal(r.quantity, 1100); assert.equal(r.planned, 2);
});
test('sumuje zakres miesięcy z pełnym śladem obliczeń', () => {
  const row = report(fixture(), '2026-11', '2026-12').rows[0];
  assert.equal(row.pieces, 10900); assert.equal(row.sources.length, 5);
  assert.equal(row.sources.reduce((s, r) => s + r.pieces, 0), row.pieces);
});
test('przelicza mm na m³ i metry bieżące', () => {
  const r = report(fixture(), '2026-11', '2026-11').rows[0];
  assert.equal(volume(r.board), 0.00264);
  assert.equal(r.meters, 8880); assert.ok(Math.abs(r.cubicMeters - 19.536) < 1e-10);
});
test('dodaje zapas i zaokrągla sztuki w górę po agregacji', () => {
  const d = fixture(); d.products = [d.products[1]]; d.products[0].plans = { '2026-11': 1 };
  const r = report(d, '2026-11', '2026-11', 10).rows[0];
  assert.equal(r.pieces, 4); assert.equal(r.purchase, 5); assert.equal(r.meters, 6);
});
test('nie dodaje sztuki z powodu błędu zmiennoprzecinkowego', () => {
  const d = fixture(); d.products = [d.products[1]]; d.products[0].plans = { '2026-11': 25 };
  assert.equal(report(d, '2026-11', '2026-11', 10).rows[0].purchase, 110);
});
test('zapas dziesiętny i bardzo duże plany nie tracą precyzji sztuk', () => {
  const d = fixture(); d.products = [d.products[1]];
  d.products[0].plans = { '2026-11': 1000000000 };
  d.products[0].recipe[0].pieces = 999999;
  assert.equal(report(d, '2026-11', '2026-11', 0.1).rows[0].purchase, 1000998999000000);
  assert.throws(() => report(d, '2026-11', '2026-11', 0.01));
});
test('zero to zapisany plan, brak wpisu nie oznacza zerowej produkcji', () => {
  const d = fixture(); d.products[0].plans = { '2026-11': 0 }; d.products[1].plans = {};
  const r = report(d, '2026-11', '2026-11');
  assert.equal(r.planned, 1); assert.equal(r.pieces, 0);
  assert.equal(report(d, '2026-12', '2026-12').planned, 0);
});
test('waliduje kopie i odrzuca brakujące deski oraz ujemne ilości', () => {
  assert.deepEqual(validateData(emptyData()), emptyData());
  const d = fixture(); d.boards = [];
  assert.throws(() => validateData(d), /saknas/);
  const e = fixture(); e.products[0].plans['2026-11'] = -1;
  assert.throws(() => validateData(e));
  assert.throws(() => validateData({ version: 2 }));
});
test('odrzuca duplikaty, błędne wymiary i puste receptury', () => {
  for (const mutate of [d => d.boards.push(d.boards[0]), d => d.boards[0].length = 0, d => d.products[0].recipe = [], d => d.products[0].recipe[0].pieces = 1.5]) {
    const d = fixture(); mutate(d); assert.throws(() => validateData(d));
  }
});
test('sprawdza miesiące, zakres raportu i procent zapasu', () => {
  assert.equal(validMonth('2026-13'), false); assert.equal(validMonth('2026-1'), false);
  assert.equal(monthAfter('2026-12', 1), '2027-01'); assert.equal(monthAfter('2026-01', -1), '2025-12');
  for (const args of [['2026-12', '2026-11', 0], ['bad', '2026-11', 0], ['2026-11', '2026-11', -1], ['2026-11', '2026-11', NaN]]) assert.throws(() => report(fixture(), ...args));
});
test('kopie JSON zachowują receptury i zapisane zera', () => {
  const d = fixture(); d.products[0].plans['2027-01'] = 0;
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(d))), d);
});
test('zmiana receptury przelicza raport bez zmiany zapisanej produkcji', () => {
  const d = fixture(); const before = report(d, '2026-11', '2026-11');
  d.products[0].recipe[0].pieces = 6;
  assert.equal(report(d, '2026-11', '2026-11').pieces, before.pieces + 1000);
  assert.equal(d.products[0].plans['2026-11'], 1000);
});
test('CSV cytuje nazwy i zabezpiecza formuły arkusza', () => {
  const d = fixture(); d.boards[0].name = '=SUM(1;2)"';
  const output = csv(report(d, '2026-11', '2026-11'));
  assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes('"\'=SUM(1;2)"""'));
  assert.ok(output.includes('19,536000'));
});
