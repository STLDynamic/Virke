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
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
test('sumuje ten sam przekrój mimo różnych długości, artykułów i produktów', () => {
  const r = report(fixture(), '2026-11', '2026-11');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].material, '22 × 100');
  assert.equal(r.rows[0].pieces, 10400);
  close(r.rows[0].netCubicMeters, 24.816);
  assert.equal(r.quantity, 1100); assert.equal(r.planned, 2);
});
test('zakres dat sumuje objętość i zachowuje oddzielne sumy miesięczne', () => {
  const r = report(fixture(), '2026-11', '2026-12'), row = r.rows[0];
  assert.equal(row.sources.length, 7);
  close(row.netCubicMeters, 36.696);
  assert.deepEqual(row.months.map(m => m.month), ['2026-11', '2026-12']);
  close(row.months[0].netCubicMeters, 24.816);
  close(row.months[1].netCubicMeters, 11.88);
  close(row.sources.reduce((s, r) => s + r.netCubicMeters, 0), row.netCubicMeters);
  close(r.netCubicMeters, row.netCubicMeters);
});
test('objętość nadal zależy od długości elementu, mimo wspólnego wiersza', () => {
  const d = fixture();
  assert.equal(volume(d.boards[0]), 0.00264);
  const before = report(d, '2026-11', '2026-11');
  d.boards[1].length = 400;
  const after = report(d, '2026-11', '2026-11');
  assert.equal(after.rows.length, 1);
  close(before.netCubicMeters - after.netCubicMeters, 2.64);
});
test('zapas zwiększa objętość, nie zaokrągla zapotrzebowania do całych desek', () => {
  const d = fixture(); d.products = [d.products[1]]; d.products[0].plans = { '2026-11': 1 };
  const r = report(d, '2026-11', '2026-11', 10).rows[0];
  assert.equal(r.pieces, 4);
  close(r.netCubicMeters, 0.01056); close(r.cubicMeters, 0.011616);
  close(r.months[0].cubicMeters, r.cubicMeters);
});
test('zapas dziesiętny i zerowy zachowują objętość netto', () => {
  const d = fixture();
  const net = report(d, '2026-11', '2026-11');
  const extra = report(d, '2026-11', '2026-11', 0.1);
  close(net.netCubicMeters, net.cubicMeters);
  close(extra.netCubicMeters, net.netCubicMeters);
  close(extra.cubicMeters, net.netCubicMeters * 1.001);
  assert.throws(() => report(d, '2026-11', '2026-11', 0.01));
});
test('przykładowe dwie palety: osobne m³ desek i klocków według przekroju', () => {
  const dimensions = [[16,75,1200], [16,75,800], [75,75,75], [22,100,1200], [22,100,1000], [75,100,100]];
  const boards = dimensions.map(([thickness,width,length], i) => ({ id:String(i), name:`Element ${i}`, thickness,width,length,species:'',grade:'' }));
  const products = [0,1].map(i => ({ id:`p${i}`, name:`Paleta ${i}`, notes:'', recipe:[8,3,9].map((pieces,j) => ({boardId:String(i*3+j),pieces})), plans:{'2026-11':i===0?1000:500} }));
  const r = report({version:1,boards,products}, '2026-11', '2026-11');
  assert.equal(r.rows.length, 4);
  const expected = {'16 × 75':14.4,'22 × 100':13.86,'75 × 75':3.796875,'75 × 100':3.375};
  for (const row of r.rows) close(row.netCubicMeters, expected[row.material]);
  close(r.netCubicMeters, 35.431875);
});
test('kluczem jest przekrój, nie nazwa artykułu, gatunek ani jakość', () => {
  const d = fixture(); d.boards[1].species = 'Tall'; d.boards[1].grade = 'Inna';
  assert.equal(report(d,'2026-11','2026-11').rows.length, 1);
  // A different width must remain a separate material.
  d.boards[1].width = 120;
  assert.equal(report(d,'2026-11','2026-11').rows.length, 2);
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
test('CSV eksportuje przekroje i miesięczne m³ bez podziału na długości', () => {
  const r = report(fixture(), '2026-11', '2026-12', 5);
  const output = csv(r);
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(!output.includes('Längd')); assert.ok(!output.includes('Löpmeter'));
  assert.ok(output.includes('"22 × 100"'));
  assert.ok(output.includes('"2026-11";"24,816000";"26,056800"'));
  assert.ok(output.includes('"2026-12";"11,880000";"12,474000"'));
  assert.ok(output.includes('"36,696000";"38,530800"'));
  assert.equal(output.split('\r\n').length, 3);
});
