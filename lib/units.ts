import "server-only";
import { db } from "./supabase";
import { must } from "./server";
import type { Profile, UnitView } from "./types";

type Row = Profile & { unit_id: string };

export const unitName = (name: string | null, members: Profile[]) =>
  (members.length > 1 && name) || members.map((m) => m.pseudo).join(" & ");

/** Construit l'affichage (nom + membres) d'une liste d'unités. */
export async function unitViews(unitIds: string[]): Promise<Map<string, UnitView>> {
  const ids = [...new Set(unitIds)];
  if (!ids.length) return new Map();
  const [units, members] = await Promise.all([
    db().from("units").select("id, name").in("id", ids),
    db().from("participants").select("id, pseudo, avatar, unit_id").in("unit_id", ids).order("created_at"),
  ]);
  const byUnit = new Map<string, Profile[]>();
  for (const m of must(members) as Row[]) {
    const list = byUnit.get(m.unit_id) ?? [];
    list.push({ id: m.id, pseudo: m.pseudo, avatar: m.avatar });
    byUnit.set(m.unit_id, list);
  }
  return new Map(
    (must(units) as Array<{ id: string; name: string | null }>).map((u) => {
      const ms = byUnit.get(u.id) ?? [];
      return [u.id, { id: u.id, name: unitName(u.name, ms), members: ms }];
    }),
  );
}
