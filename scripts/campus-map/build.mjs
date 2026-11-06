// Генерирует src/data/campusMap.ts из выгрузки OSM (fetch.mjs).
// Геометрия (граница, контуры зданий) — только из OpenStreetMap (© OpenStreetMap contributors, ODbL).
// Положения номеров на официальной схеме кампуса нужны лишь для того, чтобы сопоставить номера зданиям
// без номера в OSM и поставить ворота; рисунок схемы не переносится.
// Запуск из корня проекта: node scripts/campus-map/build.mjs <campus.json> src/data/campusMap.ts [dry]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [, , inFile, outFile, dryRun] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: node build.mjs <campus.json> <out.ts> [dry]');
  process.exit(1);
}
const els = JSON.parse(readFileSync(inFile, 'utf8')).elements;

// ---- метры ----
const LAT0 = 32.069, LON0 = 34.843;
const MLAT = 110_574, MLON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const toM = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
const r1 = (v) => Math.round(v * 10) / 10;

// ---- граница ----
const uni = els.find((e) => e.tags?.amenity === 'university');
const boundary = uni.geometry.map((p) => toM(p.lat, p.lon));
function inside([x, y], poly) {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}
/** Центр площади многоугольника. */
const centroid = (pts) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return [cx / (3 * a), cy / (3 * a)];
};

// ---- здания ----
const numberOf = (t) => {
  for (const v of [t.ref, t['addr:housenumber'], t.name, t['name:en'], t['name:he']]) {
    const m = v && /(?:^|\D)(\d{3,4}[AB]?)(?:\D|$)/.exec(v);
    if (m) return m[1];
  }
  return null;
};
const all = els
  .filter((e) => e.type === 'way' && e.tags?.building && e.geometry)
  .map((e) => {
    const poly = e.geometry.map((p) => toM(p.lat, p.lon));
    if (poly.length > 1 && poly[0][0] === poly.at(-1)[0] && poly[0][1] === poly.at(-1)[1]) poly.pop();
    return { osm: e.id, tags: e.tags, poly, c: centroid(poly), num: numberOf(e.tags) };
  });

// ---- положения номеров на официальной схеме кампуса (px страницы ~1006×1204), сняты на глаз ----
const PDF = {
  1102: [612, 52], 1103: [638, 63], 1104: [663, 77], 1105: [689, 90], 1005: [511, 74], 1004: [484, 91], 1002: [452, 111],
  '1300A': [777, 128], '1300B': [805, 222], 1501: [568, 152], 906: [441, 186], 905: [398, 212], 902: [465, 211], 901: [437, 237],
  1401: [591, 331], 802: [382, 355], 1502: [438, 369], 510: [336, 398], 509: [322, 420], 801: [377, 429], 507: [413, 442],
  506: [453, 447], 508: [338, 448], 502: [350, 480], 505: [446, 500], 606: [330, 530], 605: [371, 540], 604: [400, 534],
  504: [460, 559], 503: [411, 576], 501: [330, 625], 411: [493, 620], 410: [436, 636], 407: [549, 643], 409: [380, 660],
  408: [372, 686], 404: [414, 687], 405: [476, 691], 217: [326, 692], 403: [434, 719], 306: [559, 737], 402: [455, 747],
  216: [338, 742], 305: [581, 783], 401: [434, 792], 213: [370, 785], 307: [481, 808], 212: [375, 815], 303: [602, 814],
  215: [326, 834], 304: [504, 843], 302: [613, 842], 211: [393, 843], 300: [572, 849], 214: [297, 853], 210: [426, 853],
  301: [549, 862], 206: [364, 874], 207: [418, 877], 209: [325, 880], 203: [431, 898], 208: [327, 910], 202: [393, 916],
  108: [550, 915], 110: [483, 926], 205: [338, 929], 204: [351, 945], 109: [427, 943], 201: [376, 957], 107: [520, 951],
  105: [445, 970], 106: [478, 971], 103: [296, 993], 104: [352, 989], 102: [397, 1011], 101: [313, 1047], 100: [398, 1066],
};
const PDF_GATES = {
  'gate-20': [549, 47], 'gate-15': [789, 180], 'gate-10': [643, 241], 'gate-5': [453, 333], 'gate-25': [333, 347],
  'gate-2': [560, 681], 'gate-1': [579, 693], 'gate-30': [281, 925], 'gate-40': [620, 905],
};

// Аффинное px → метры по зданиям, у которых номер есть в OSM.
const osmNumbered = new Map();
for (const b of all) if (b.num && !osmNumbered.has(b.num)) osmNumbered.set(b.num, b);
const anchors = Object.keys(PDF).filter((id) => osmNumbered.has(id));
function fitAffine(pairs) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], vx = [0, 0, 0], vy = [0, 0, 0];
  for (const [[px, py], [mx, my]] of pairs) {
    const row = [px, py, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j]; vx[i] += row[i] * mx; vy[i] += row[i] * my; }
  }
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const solve = (v) => [0, 1, 2].map((col) => det(m.map((row, r) => row.map((x, c) => (c === col ? v[r] : x)))) / det(m));
  const ax = solve(vx), ay = solve(vy);
  return ([px, py]) => [ax[0] * px + ax[1] * py + ax[2], ay[0] * px + ay[1] * py + ay[2]];
}
const pdfToM = fitAffine(anchors.map((id) => [PDF[id], osmNumbered.get(id).c]));
const err = (id) => Math.hypot(...pdfToM(PDF[id]).map((v, i) => v - osmNumbered.get(id).c[i]));
console.log('anchors', anchors.length, 'RMS', Math.sqrt(anchors.reduce((s, id) => s + err(id) ** 2, 0) / anchors.length).toFixed(1), 'm');
for (const id of anchors) if (err(id) > 35) console.log('  big error', id, err(id).toFixed(0), 'm');

// ---- сопоставление номеров без OSM-номера с контурами без номера (ближайший, ≤ 35 м) ----
const pos = {};
const assigned = new Map();
for (const id of Object.keys(PDF)) {
  const b = osmNumbered.get(id);
  if (b) { pos[id] = b.c; assigned.set(b.osm, id); }
}
const free = all.filter((b) => !b.num);
// Сопоставления по названию в OSM (ближайший контур тут ошибается).
const OVERRIDES = { 214: 135308625 /* Energy Center */, 411: 135308514 /* Beit Shaul – Advanced Torah Studies */, 100: 135308520 /* Pre-clinical */ };
for (const [id, osmId] of Object.entries(OVERRIDES)) {
  const b = all.find((x) => x.osm === osmId);
  if (b) { pos[id] = b.c; assigned.set(b.osm, id); console.log('override', id, '←', osmId); }
}
const candidates = [];
for (const id of Object.keys(PDF)) {
  if (pos[id]) continue;
  const est = pdfToM(PDF[id]);
  for (const b of free) candidates.push({ id, b, d: Math.hypot(b.c[0] - est[0], b.c[1] - est[1]) });
}
candidates.sort((a, b) => a.d - b.d);
const estimated = [];
for (const c of candidates) {
  if (pos[c.id] || assigned.has(c.b.osm) || c.d > 35) continue;
  pos[c.id] = c.b.c;
  assigned.set(c.b.osm, c.id);
  console.log('match', c.id, '←', c.b.osm, c.d.toFixed(0) + 'm', c.b.tags['name:en'] ?? c.b.tags.name ?? c.b.tags.building);
}
for (const id of Object.keys(PDF)) if (!pos[id]) { pos[id] = pdfToM(PDF[id]); estimated.push(id); }
console.log('estimated only (no footprint):', estimated.join(' '));

// ---- ворота: OSM «Jabotinsky Gate» для 20, остальное — по схеме ----
const gates = {};
for (const [id, px] of Object.entries(PDF_GATES)) gates[id] = pdfToM(px);
const jab = els.find((e) => e.type === 'node' && e.tags?.['name:en'] === 'Jabotinsky Gate');
if (jab) gates['gate-20'] = toM(jab.lat, jab.lon);

// ---- кафе: берутся из уже сгенерированного файла (точки сняты на глаз, OSM их не знает) ----
const cafes = {};
if (existsSync(outFile)) {
  const prev = readFileSync(outFile, 'utf8');
  const block = /CAFE_POS[^{]*\{([\s\S]*?)\};/.exec(prev)?.[1] ?? '';
  for (const m of block.matchAll(/'(cafe-[\w-]+)': \[(-?[\d.]+), (-?[\d.]+)\]/g)) cafes[m[1]] = [Number(m[2]), Number(m[3])];
}
console.log('cafes', Object.keys(cafes).join(' ') || '(none — add CAFE_POS by hand)');

// ---- поворот для показа: как на официальной схеме (верх схемы = верх экрана) ----
const up = (() => { const a = pdfToM([500, 900]), b = pdfToM([500, 100]); return [b[0] - a[0], b[1] - a[1]]; })();
const rotation = Math.atan2(up[0], up[1]);
console.log('view rotation (deg, clockwise from north):', ((rotation * 180) / Math.PI).toFixed(1));

// Контуры: все здания внутри границы + сопоставленные снаружи.
const shown = all.filter((b) => inside(b.c, boundary) || assigned.has(b.osm));
const simplify = (poly) => poly.map(([x, y]) => [r1(x), r1(y)]);
const fmt = (p) => `[${p[0]}, ${p[1]}]`;

if (dryRun) process.exit(0);
const lines = [];
lines.push('/**');
lines.push(' * Карта кампуса в метрах (восток, север) от точки 32.069 N, 34.843 E. Сгенерировано из OpenStreetMap');
lines.push(' * (© OpenStreetMap contributors, ODbL; выгрузка Overpass): граница кампуса и контуры зданий.');
lines.push(' * Номера зданий без номера в OSM сопоставлены по официальной схеме кампуса (по ближайшему контуру);');
lines.push(' * `ESTIMATED_BUILDINGS` — контура нет, центр поставлен по схеме. Рисунок схемы не переносится.');
lines.push(' * Не править руками: node scripts/campus-map/fetch.mjs, затем build.mjs (см. scripts/campus-map).');
lines.push(' */');
lines.push('export type XY = [number, number];');
lines.push('');
lines.push('/** Поворот показа: на сколько градусов по часовой «верх» официальной схемы отклонён от севера. */');
lines.push(`export const VIEW_ROTATION_DEG = ${r1((rotation * 180) / Math.PI)};`);
lines.push('');
lines.push(`export const CAMPUS_BOUNDARY: XY[] = [${simplify(boundary).map(fmt).join(', ')}];`);
lines.push('');
lines.push('/** Контуры зданий; `id` — номер здания, если известен. */');
lines.push('export const BUILDING_SHAPES: { id?: string; poly: XY[] }[] = [');
for (const b of shown) {
  const id = assigned.get(b.osm);
  lines.push(`  { ${id ? `id: '${id}', ` : ''}poly: [${simplify(b.poly).map(fmt).join(', ')}] },`);
}
lines.push('];');
lines.push('');
lines.push('/** Центр каждого здания по номеру (центр контура или оценка по схеме). */');
lines.push('export const BUILDING_POS: Record<string, XY> = {');
for (const id of Object.keys(pos).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b))) lines.push(`  '${id}': ${fmt(pos[id].map(r1))},`);
lines.push('};');
lines.push('');
lines.push('/** Здания без контура — центр оценён по официальной схеме. */');
lines.push(`export const ESTIMATED_BUILDINGS: string[] = [${estimated.map((s) => `'${s}'`).join(', ')}];`);
lines.push('');
lines.push('/** Ворота (שער): 20 — по OSM (Jabotinsky Gate), остальные — по официальной схеме. */');
lines.push('export const GATE_POS: Record<string, XY> = {');
for (const [id, p] of Object.entries(gates)) lines.push(`  '${id}': ${fmt(p.map(r1))},`);
lines.push('};');
lines.push('');
lines.push('/** Еда и кофе (ЭКСПЕРИМЕНТ: точки сняты на глаз со схемы кампуса). */');
lines.push('export const CAFE_POS: Record<string, XY> = {');
for (const [id, p] of Object.entries(cafes)) lines.push(`  '${id}': ${fmt(p.map(r1))},`);
lines.push('};');
lines.push('');
writeFileSync(outFile, lines.join('\n'));
console.log('written', outFile, 'shapes', shown.length);
