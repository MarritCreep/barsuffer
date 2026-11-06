// Выгрузка кампуса Бар-Илана из OpenStreetMap (Overpass API): граница, контуры зданий, ворота.
// © OpenStreetMap contributors, ODbL. Запуск: node scripts/campus-map/fetch.mjs <out.json>
// Сырой файл в репозиторий не кладём — из него build.mjs делает src/data/campusMap.ts.
import { writeFileSync } from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node fetch.mjs <out.json>');
  process.exit(1);
}
const bbox = '32.0630,34.8350,32.0775,34.8545';
const query = `
[out:json][timeout:90];
(
  way["amenity"="university"](${bbox});
  relation["amenity"="university"](${bbox});
)->.u;
.u out geom;
way["building"](${bbox});
out geom;
(
  node["barrier"~"gate|entrance|lift_gate"](${bbox});
  node["entrance"](${bbox});
);
out;
`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let json = null;
let wait = 5000;
for (let attempt = 0; attempt < 6 && !json; attempt++) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BarSuffer-dev/1.0' },
      body: 'data=' + encodeURIComponent(query),
      signal: AbortSignal.timeout(100_000),
    });
    if (res.ok) json = await res.json();
    else console.error(url, 'HTTP', res.status);
  } catch (e) {
    console.error(url, String(e));
  }
  if (!json) {
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
}
if (!json) process.exit(1);
writeFileSync(out, JSON.stringify(json));
const els = json.elements;
console.log('elements', els.length, 'buildings', els.filter((e) => e.tags?.building).length);
