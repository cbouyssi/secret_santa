// Vérifie l'algorithme de tirage : contraintes strictes + équilibre optimal (comparé à une recherche exhaustive).
// Lancer avec : npm run test:draw
import { drawSecretSanta, type Unit, type Pair } from "../lib/draw";

const cost = (units: Unit[], pairs: Pair[], k: number) => {
  const s = new Map(units.map((u) => [u.id, u.size]));
  const L = new Map(units.map((u) => [u.id, 0]));
  for (const p of pairs) L.set(p.giver, L.get(p.giver)! + s.get(p.receiver)!);
  return units.reduce((a, u) => a + (L.get(u.id)! - k * u.size) ** 2 / u.size, 0);
};

function* perms(a: string[]): Generator<string[]> {
  if (a.length <= 1) return yield a;
  for (let i = 0; i < a.length; i++) for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}

const randomUnits = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `u${i}`, size: Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1 }));

// 1. Contraintes strictes
for (let t = 0; t < 2000; t++) {
  const n = 2 + Math.floor(Math.random() * 12);
  const units = randomUnits(n);
  const k = 1 + Math.floor(Math.random() * Math.min(4, n - 1));
  const excl: Pair[] = [];
  for (let e = 0; e < Math.floor(Math.random() * n); e++) {
    const a = Math.floor(Math.random() * n), b = Math.floor(Math.random() * n);
    if (a !== b) excl.push({ giver: `u${a}`, receiver: `u${b}` });
  }
  const r = drawSecretSanta(units, k, excl);
  if (!r.ok) continue;
  const forb = new Set(excl.map((e) => `${e.giver}>${e.receiver}`));
  const out = new Map<string, number>(), inn = new Map<string, number>(), seen = new Set<string>();
  for (const p of r.pairs) {
    const kk = `${p.giver}>${p.receiver}`;
    if (p.giver === p.receiver) throw new Error("auto-tirage");
    if (forb.has(kk)) throw new Error("exclusion violée");
    if (seen.has(kk)) throw new Error("doublon");
    seen.add(kk);
    out.set(p.giver, (out.get(p.giver) ?? 0) + 1);
    inn.set(p.receiver, (inn.get(p.receiver) ?? 0) + 1);
  }
  for (const u of units) if (out.get(u.id) !== k || inn.get(u.id) !== k) throw new Error("nombre de tirages incorrect");
}
console.log("✓ contraintes strictes respectées sur 2000 tirages");

// 2. Équilibre : comparaison avec l'optimum exact (k = 1, petites tailles)
let optimal = 0, total = 0;
for (let t = 0; t < 300; t++) {
  const n = 3 + Math.floor(Math.random() * 5);
  const units = randomUnits(n);
  const ids = units.map((u) => u.id);
  let best = Infinity;
  for (const p of perms(ids)) {
    if (p.some((r, i) => r === ids[i])) continue;
    best = Math.min(best, cost(units, p.map((r, i) => ({ giver: ids[i], receiver: r })), 1));
  }
  const r = drawSecretSanta(units, 1, []);
  if (!r.ok) throw new Error(r.error);
  total++;
  if (Math.abs(cost(units, r.pairs, 1) - best) < 1e-9) optimal++;
}
console.log(`✓ équilibre optimal dans ${optimal}/${total} cas`);
