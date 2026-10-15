/**
 * Tirage au sort Secret Santa.
 *
 * Contraintes :
 *  - chacun tire exactement k personnes distinctes ;
 *  - chacun est tiré exactement k fois ;
 *  - personne ne se tire soi-même ;
 *  - les exclusions (giver -> receiver interdit) sont respectées.
 *
 * Méthode : on construit k « tours ». Chaque tour est un appariement parfait
 * aléatoire donneurs -> receveurs (algorithme de Kuhn avec ordre mélangé),
 * en interdisant les paires déjà utilisées aux tours précédents.
 * L'union de k appariements disjoints donne exactement les contraintes ci-dessus
 * (et toute solution valide se décompose ainsi, théorème de König).
 * Si un tour échoue, on recommence depuis zéro avec un nouveau hasard.
 */

export type DrawResult =
  | { ok: true; pairs: Array<{ giver: string; receiver: string }> }
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
  const giverOf = new Map<string, string>(); // receiver -> giver
  const candidates = new Map<string, string[]>();
  for (const g of ids) {
    candidates.set(g, shuffle(ids.filter((r) => allowed(g, r)), rand));
  }

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

  for (const g of shuffle(ids, rand)) {
    if (!tryAssign(g, new Set())) return null;
  }

  const receiverOf = new Map<string, string>();
  for (const [r, g] of giverOf) receiverOf.set(g, r);
  return receiverOf;
}

export function drawSecretSanta(
  ids: string[],
  k: number,
  exclusions: Array<{ giver: string; receiver: string }>,
  options: { maxAttempts?: number; rand?: () => number } = {},
): DrawResult {
  const rand = options.rand ?? Math.random;
  const maxAttempts = options.maxAttempts ?? 2000;
  const n = ids.length;

  if (n < 2) return { ok: false, error: "Il faut au moins 2 participants." };
  if (!Number.isInteger(k) || k < 1) return { ok: false, error: "Le nombre de tirages par personne doit être au moins 1." };
  if (k > n - 1) {
    return { ok: false, error: `Avec ${n} participants, chacun peut tirer au maximum ${n - 1} personne(s).` };
  }

  const forbidden = new Set(exclusions.map((e) => key(e.giver, e.receiver)));
  const allowed = (g: string, r: string) => g !== r && !forbidden.has(key(g, r));

  // Vérification rapide : assez de choix possibles pour chacun ?
  for (const p of ids) {
    const out = ids.filter((r) => allowed(p, r)).length;
    const inn = ids.filter((g) => allowed(g, p)).length;
    if (out < k) return { ok: false, error: `Trop d'exclusions : une personne n'a que ${out} personne(s) possible(s) à tirer, il en faut ${k}.` };
    if (inn < k) return { ok: false, error: `Trop d'exclusions : une personne ne peut être tirée que par ${inn} personne(s), il en faut ${k}.` };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const used = new Set<string>();
    const pairs: Array<{ giver: string; receiver: string }> = [];
    let failed = false;

    for (let round = 0; round < k; round++) {
      const m = randomPerfectMatching(ids, (g, r) => allowed(g, r) && !used.has(key(g, r)), rand);
      if (!m) {
        failed = true;
        break;
      }
      for (const [g, r] of m) {
        used.add(key(g, r));
        pairs.push({ giver: g, receiver: r });
      }
    }
    if (!failed) return { ok: true, pairs };
  }

  return {
    ok: false,
    error: "Aucun tirage possible avec ces exclusions. Retire une exclusion ou baisse le nombre de tirages par personne.",
  };
}
