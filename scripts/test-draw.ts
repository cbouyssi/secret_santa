// Vérifie l'algorithme de tirage sur de nombreux cas aléatoires.
// Lancer avec : npm run test:draw
import { drawSecretSanta } from "../lib/draw";

function check(ids: string[], k: number, excl: { giver: string; receiver: string }[]) {
  const res = drawSecretSanta(ids, k, excl);
  if (!res.ok) return res.error;
  const forb = new Set(excl.map((e) => `${e.giver}>${e.receiver}`));
  const seen = new Set<string>();
  const out = new Map<string, number>(), inn = new Map<string, number>();
  for (const { giver, receiver } of res.pairs) {
    if (giver === receiver) throw new Error("auto-tirage");
    if (forb.has(`${giver}>${receiver}`)) throw new Error("exclusion violée");
    const kk = `${giver}>${receiver}`;
    if (seen.has(kk)) throw new Error("doublon");
    seen.add(kk);
    out.set(giver, (out.get(giver) ?? 0) + 1);
    inn.set(receiver, (inn.get(receiver) ?? 0) + 1);
  }
  for (const p of ids) {
    if (out.get(p) !== k) throw new Error(`${p} tire ${out.get(p)} au lieu de ${k}`);
    if (inn.get(p) !== k) throw new Error(`${p} est tiré ${inn.get(p)} au lieu de ${k}`);
  }
  return null;
}

let ok = 0, impossible = 0;
for (let t = 0; t < 3000; t++) {
  const n = 2 + Math.floor(Math.random() * 14);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const k = 1 + Math.floor(Math.random() * Math.max(1, n - 1));
  const excl: { giver: string; receiver: string }[] = [];
  // couples exclus mutuellement
  const sh = ids.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i + 1 < sh.length && Math.random() < 0.6; i += 2) {
    excl.push({ giver: sh[i], receiver: sh[i + 1] }, { giver: sh[i + 1], receiver: sh[i] });
  }
  const err = check(ids, k, excl);
  if (err) impossible++; else ok++;
}
// Cas de l'exemple : 4 personnes, 2 tirages chacun, 2 couples
const fam = ["A", "B", "C", "D"];
const err = check(fam, 2, [
  { giver: "A", receiver: "B" }, { giver: "B", receiver: "A" },
  { giver: "C", receiver: "D" }, { giver: "D", receiver: "C" },
]);
console.log(`Tirages valides : ${ok}, refusés car impossibles : ${impossible}`);
console.log(`Cas 4 personnes / 2 tirages / 2 couples : ${err ?? "OK"}`);
console.log("Tous les tirages produits respectent les contraintes ✅");
