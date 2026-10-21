/**
 * Tirage au sort Secret Santa avec groupes.
 *
 * Une « unité » est soit une personne seule, soit un groupe (ses membres
 * tirent ensemble et sont tirés ensemble). Tirer une unité de 3 personnes,
 * c'est préparer 3 cadeaux.
 *
 * Contraintes strictes :
 *  - chaque unité tire exactement k unités distinctes et est tirée exactement k fois ;
 *  - une unité ne se tire pas elle-même ;
 *  - les exclusions sont respectées.
 *
 * Objectif d'équilibre : chaque personne devrait avoir environ k cadeaux à
 * préparer. Une unité de taille s devrait donc tirer environ k × s personnes
 * au total. On minimise Σ (charge − k × s)² / s (écart pondéré par personne),
 * puis la charge maximale par personne.
 *
 * Méthode : plusieurs tirages aléatoires valides (k appariements parfaits
 * successifs), chacun amélioré par échanges de destinataires entre deux
 * donneurs (l'échange préserve toutes les contraintes strictes). On garde le
 * meilleur ; à égalité, on en choisit un au hasard.
 */

export type Unit = { id: string; size: number };
export type Pair = { giver: string; receiver: string };

export type DrawResult =
  | { ok: true; pairs: Pair[]; perPerson: { min: number; max: number } }
  | { ok: false; error: string };

const key = (g: string, r: string) => `${g}>${r}`;

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPerfectMatching(
  ids: string[],
  allowed: (g: string, r: string) => boolean,
  rand: () => number,
): Map<string, string> | null {
  const giverOf = new Map<string, string>();
  const candidates = new Map<string, string[]>();
  for (const g of ids) candidates.set(g, shuffle(ids.filter((r) => allowed(g, r)), rand));

  const tryAssign = (g: string, visited: Set<string>): boolean => {
    for (const r of candidates.get(g)!) {
      if (visited.has(r)) continue;
      visited.add(r);
      const current = giverOf.get(r);
      if (current === undefined || tryAssign(current, visited)) {
        giverOf.set(r, g);
        return true;
      }
    }
    return false;
  };

  for (const g of shuffle(ids, rand)) if (!tryAssign(g, new Set())) return null;
  const receiverOf = new Map<string, string>();
  for (const [r, g] of giverOf) receiverOf.set(g, r);
  return receiverOf;
}

/** Un tirage aléatoire valide (sans souci d'équilibre), ou null si impasse. */
function randomDraw(ids: string[], k: number, allowed: (g: string, r: string) => boolean, rand: () => number) {
  const used = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (let round = 0; round < k; round++) {
    const m = randomPerfectMatching(ids, (g, r) => allowed(g, r) && !used.has(key(g, r)), rand);
    if (!m) return null;
    for (const [g, r] of m) {
      used.add(key(g, r));
      pairs.push([g, r]);
    }
  }
  return pairs;
}

export function drawSecretSanta(
  units: Unit[],
  k: number,
  exclusions: Pair[],
  options: { rand?: () => number; restarts?: number; maxAttempts?: number } = {},
): DrawResult {
  const rand = options.rand ?? Math.random;
  const restarts = options.restarts ?? 60;
  const maxAttempts = options.maxAttempts ?? 2000;
  const ids = units.map((u) => u.id);
  const size = new Map(units.map((u) => [u.id, u.size]));
  const n = ids.length;

  if (n < 2) return { ok: false, error: "Il faut au moins 2 personnes ou groupes au tirage." };
  if (!Number.isInteger(k) || k < 1) return { ok: false, error: "Le nombre de tirages doit être au moins 1." };
  if (k > n - 1) {
    return {
      ok: false,
      error: `Avec ${n} personnes ou groupes au tirage, chacun peut en tirer au maximum ${n - 1}.`,
    };
  }

  const forbidden = new Set(exclusions.map((e) => key(e.giver, e.receiver)));
  const allowed = (g: string, r: string) => g !== r && !forbidden.has(key(g, r));

  for (const p of ids) {
    const out = ids.filter((r) => allowed(p, r)).length;
    const inn = ids.filter((g) => allowed(g, p)).length;
    if (out < k) return { ok: false, error: `Trop d'exclusions : une personne ou un groupe n'a que ${out} possibilité(s) de tirage, il en faut ${k}.` };
    if (inn < k) return { ok: false, error: `Trop d'exclusions : une personne ou un groupe ne peut être tiré que par ${inn} autre(s), il en faut ${k}.` };
  }

  const target = (u: string) => k * size.get(u)!;
  const cost = (u: string, load: number) => (load - target(u)) ** 2 / size.get(u)!;

  let best: { pairs: Array<[string, string]>; sq: number; max: number } | null = null;
  let ties = 0;
  let attempts = 0;
  let found = 0;

  while (found < restarts && attempts < maxAttempts) {
    attempts++;
    const pairs = randomDraw(ids, k, allowed, rand);
    if (!pairs) continue;
    found++;

    // Amélioration locale par échanges de destinataires
    const edges = new Set(pairs.map(([g, r]) => key(g, r)));
    const load = new Map(ids.map((u) => [u, 0]));
    for (const [g, r] of pairs) load.set(g, load.get(g)! + size.get(r)!);

    let improved = true;
    let passes = 0;
    while (improved && passes++ < 50) {
      improved = false;
      const order = shuffle(
        pairs.map((_, i) => i),
        rand,
      );
      for (const i of order) {
        for (const j of order) {
          if (i >= j) continue;
          const [a, x] = pairs[i];
          const [b, y] = pairs[j];
          if (a === b || x === y) continue;
          const d = size.get(y)! - size.get(x)!;
          if (d === 0) continue;
          if (!allowed(a, y) || !allowed(b, x) || edges.has(key(a, y)) || edges.has(key(b, x))) continue;
          const la = load.get(a)!;
          const lb = load.get(b)!;
          const delta = cost(a, la + d) + cost(b, lb - d) - cost(a, la) - cost(b, lb);
          if (delta < -1e-9) {
            edges.delete(key(a, x));
            edges.delete(key(b, y));
            edges.add(key(a, y));
            edges.add(key(b, x));
            pairs[i] = [a, y];
            pairs[j] = [b, x];
            load.set(a, la + d);
            load.set(b, lb - d);
            improved = true;
          }
        }
      }
    }

    let sq = 0;
    let max = 0;
    for (const u of ids) {
      sq += cost(u, load.get(u)!);
      max = Math.max(max, load.get(u)! / size.get(u)!);
    }
    const better = !best || sq < best.sq - 1e-9 || (Math.abs(sq - best.sq) < 1e-9 && max < best.max - 1e-9);
    const tie = best && Math.abs(sq - best.sq) < 1e-9 && Math.abs(max - best.max) < 1e-9;
    if (better) {
      best = { pairs: pairs.slice(), sq, max };
      ties = 1;
    } else if (tie) {
      // Tirage au sort équitable parmi les solutions aussi bonnes
      ties++;
      if (rand() < 1 / ties) best = { pairs: pairs.slice(), sq, max };
    }
  }

  if (!best) {
    return {
      ok: false,
      error: "Aucun tirage possible avec ces exclusions. Retire une exclusion ou baisse le nombre de tirages.",
    };
  }

  return {
    ok: true,
    pairs: best.pairs.map(([giver, receiver]) => ({ giver, receiver })),
    perPerson: perPersonLoad(units, best.pairs.map(([giver, receiver]) => ({ giver, receiver }))),
  };
}

/** Nombre de cadeaux à préparer par personne (charge d'une unité / sa taille). */
export function perPersonLoad(units: Unit[], pairs: Pair[]): { min: number; max: number } {
  const size = new Map(units.map((u) => [u.id, u.size]));
  const load = new Map(units.map((u) => [u.id, 0]));
  for (const p of pairs) load.set(p.giver, (load.get(p.giver) ?? 0) + (size.get(p.receiver) ?? 0));
  const values = units.map((u) => load.get(u.id)! / u.size);
  return { min: Math.min(...values), max: Math.max(...values) };
}
