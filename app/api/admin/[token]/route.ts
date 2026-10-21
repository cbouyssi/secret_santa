import { db } from "@/lib/supabase";
import { avatar, fail, handle, must, newToken, text } from "@/lib/server";
import { drawSecretSanta, perPersonLoad } from "@/lib/draw";
import type { AdminState } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

type EventRow = { id: string; name: string; draws_per_person: number; drawn_at: string | null };
type PRow = { id: string; pseudo: string; avatar: string | null; token: string; unit_id: string };

async function loadEvent(token: string): Promise<EventRow> {
  const rows = must(
    await db().from("events").select("id, name, draws_per_person, drawn_at").eq("admin_token", token).limit(1),
  ) as EventRow[];
  if (!rows.length) fail(404, "Lien administrateur inconnu.");
  return rows[0];
}

async function participants(eventId: string): Promise<PRow[]> {
  return must(
    await db().from("participants").select("id, pseudo, avatar, token, unit_id").eq("event_id", eventId).order("created_at"),
  ) as PRow[];
}

async function ensureParticipants(eventId: string, ids: unknown): Promise<PRow[]> {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) fail(400, "Participants invalides.");
  const all = await participants(eventId);
  const found = all.filter((p) => (ids as string[]).includes(p.id));
  if (found.length !== new Set(ids as string[]).size) fail(404, "Participant introuvable.");
  return found;
}

const ensureParticipant = async (eventId: string, id: unknown) => (await ensureParticipants(eventId, [id]))[0];

const notDrawn = (ev: EventRow) => {
  if (ev.drawn_at) fail(409, "Le tirage a déjà eu lieu. Réinitialise-le pour modifier ce réglage.");
};

/** Supprime les unités de l'événement qui n'ont plus aucun membre. */
async function deleteEmptyUnits(eventId: string) {
  const [units, ps] = await Promise.all([
    db().from("units").select("id").eq("event_id", eventId),
    participants(eventId),
  ]);
  const used = new Set(ps.map((p) => p.unit_id));
  const empty = (must(units) as { id: string }[]).map((u) => u.id).filter((id) => !used.has(id));
  if (empty.length) must(await db().from("units").delete().in("id", empty));
}

async function newUnit(eventId: string, name: string | null = null): Promise<string> {
  const rows = must(await db().from("units").insert({ event_id: eventId, name }).select("id")) as { id: string }[];
  return rows[0].id;
}

async function state(ev: EventRow): Promise<AdminState> {
  const ps = await participants(ev.id);
  const ids = ps.map((p) => p.id);
  const [units, exclusions, reveals, assignments] = await Promise.all([
    db().from("units").select("id, name").eq("event_id", ev.id).order("created_at"),
    db().from("exclusions").select("id, giver_id, receiver_id").eq("event_id", ev.id),
    ids.length ? db().from("reveals").select("participant_id").in("participant_id", ids) : Promise.resolve({ data: [], error: null }),
    ev.drawn_at ? db().from("assignments").select("giver_unit, receiver_unit").eq("event_id", ev.id) : Promise.resolve({ data: [], error: null }),
  ]);

  const revealed = new Map<string, number>();
  for (const r of must(reveals) as { participant_id: string }[]) {
    revealed.set(r.participant_id, (revealed.get(r.participant_id) ?? 0) + 1);
  }

  const members = new Map<string, string[]>();
  for (const p of ps) members.set(p.unit_id, [...(members.get(p.unit_id) ?? []), p.id]);

  const unitRows = must(units) as Array<{ id: string; name: string | null }>;
  const pairs = (must(assignments) as Array<{ giver_unit: string; receiver_unit: string }>).map((a) => ({
    giver: a.giver_unit,
    receiver: a.receiver_unit,
  }));
  const sizes = unitRows.map((u) => ({ id: u.id, size: members.get(u.id)?.length ?? 0 })).filter((u) => u.size > 0);

  return {
    event: { name: ev.name, drawsPerPerson: ev.draws_per_person, drawnAt: ev.drawn_at },
    participants: ps.map((p) => ({
      id: p.id,
      pseudo: p.pseudo,
      avatar: p.avatar,
      token: p.token,
      unitId: p.unit_id,
      revealed: revealed.get(p.id) ?? 0,
    })),
    groups: unitRows
      .filter((u) => (members.get(u.id)?.length ?? 0) > 1)
      .map((u) => ({ id: u.id, name: u.name, memberIds: members.get(u.id)! })),
    exclusions: (must(exclusions) as Array<{ id: string; giver_id: string; receiver_id: string }>).map((e) => ({
      id: e.id,
      giverId: e.giver_id,
      receiverId: e.receiver_id,
    })),
    // Uniquement des statistiques globales : impossible d'en déduire qui a tiré qui.
    balance: pairs.length ? perPersonLoad(sizes, pairs) : null,
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  return handle(async () => state(await loadEvent(token)));
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  return handle(async () => {
    const ev = await loadEvent(token);
    const body = await req.json().catch(() => ({}));
    const sb = db();

    switch (body.action) {
      case "updateEvent": {
        const patch: Record<string, unknown> = {};
        if (body.name !== undefined) patch.name = text(body.name, 120, "Le nom de l'événement");
        if (body.drawsPerPerson !== undefined && Number(body.drawsPerPerson) !== ev.draws_per_person) {
          notDrawn(ev);
          const k = Number(body.drawsPerPerson);
          if (!Number.isInteger(k) || k < 1 || k > 20) fail(400, "Le nombre de tirages doit être entre 1 et 20.");
          patch.draws_per_person = k;
        }
        if (Object.keys(patch).length) must(await sb.from("events").update(patch).eq("id", ev.id));
        break;
      }

      case "addParticipant": {
        notDrawn(ev);
        const pseudo = text(body.pseudo, 40, "Le pseudo")!;
        const img = avatar(body.avatar);
        const unitId = await newUnit(ev.id);
        must(await sb.from("participants").insert({ event_id: ev.id, unit_id: unitId, pseudo, avatar: img, token: newToken() }));
        break;
      }

      case "updateParticipant": {
        const p = await ensureParticipant(ev.id, body.id);
        const patch: Record<string, unknown> = {};
        if (body.pseudo !== undefined) patch.pseudo = text(body.pseudo, 40, "Le pseudo");
        if (body.avatar !== undefined) patch.avatar = avatar(body.avatar);
        if (Object.keys(patch).length) must(await sb.from("participants").update(patch).eq("id", p.id));
        break;
      }

      case "removeParticipant": {
        notDrawn(ev);
        const p = await ensureParticipant(ev.id, body.id);
        must(await sb.from("participants").delete().eq("id", p.id));
        await deleteEmptyUnits(ev.id);
        break;
      }

      case "newLink": {
        const p = await ensureParticipant(ev.id, body.id);
        must(await sb.from("participants").update({ token: newToken() }).eq("id", p.id));
        break;
      }

      case "createGroup": {
        notDrawn(ev);
        const ms = await ensureParticipants(ev.id, body.memberIds);
        if (ms.length < 2) fail(400, "Choisis au moins deux personnes pour former un groupe.");
        const unitId = await newUnit(ev.id, text(body.name, 60, "Le nom du groupe", false));
        must(await sb.from("participants").update({ unit_id: unitId }).in("id", ms.map((m) => m.id)));
        await deleteEmptyUnits(ev.id);
        break;
      }

      case "renameGroup": {
        if (typeof body.groupId !== "string") fail(400, "Groupe invalide.");
        const name = text(body.name, 60, "Le nom du groupe", false);
        must(await sb.from("units").update({ name }).eq("id", body.groupId).eq("event_id", ev.id));
        break;
      }

      case "dissolveGroup": {
        notDrawn(ev);
        if (typeof body.groupId !== "string") fail(400, "Groupe invalide.");
        const ms = (await participants(ev.id)).filter((p) => p.unit_id === body.groupId);
        if (!ms.length) fail(404, "Groupe introuvable.");
        // Le premier membre garde l'unité (sans nom), les autres repartent seuls
        must(await sb.from("units").update({ name: null }).eq("id", body.groupId));
        for (const m of ms.slice(1)) {
          const unitId = await newUnit(ev.id);
          must(await sb.from("participants").update({ unit_id: unitId }).eq("id", m.id));
        }
        break;
      }

      case "addExclusion": {
        notDrawn(ev);
        const giver = await ensureParticipant(ev.id, body.giverId);
        const receiver = await ensureParticipant(ev.id, body.receiverId);
        if (giver.id === receiver.id) fail(400, "Choisis deux personnes différentes.");
        const rows = [{ event_id: ev.id, giver_id: giver.id, receiver_id: receiver.id }];
        if (body.symmetric) rows.push({ event_id: ev.id, giver_id: receiver.id, receiver_id: giver.id });
        must(await sb.from("exclusions").upsert(rows, { onConflict: "giver_id,receiver_id", ignoreDuplicates: true }));
        break;
      }

      case "removeExclusions": {
        notDrawn(ev);
        const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
        if (ids.length) must(await sb.from("exclusions").delete().eq("event_id", ev.id).in("id", ids));
        break;
      }

      case "draw": {
        notDrawn(ev);
        const ps = await participants(ev.id);
        const unitOf = new Map(ps.map((p) => [p.id, p.unit_id]));
        const sizes = new Map<string, number>();
        for (const p of ps) sizes.set(p.unit_id, (sizes.get(p.unit_id) ?? 0) + 1);

        // Une exclusion entre deux personnes s'applique à leurs unités respectives
        const excl = must(
          await sb.from("exclusions").select("giver_id, receiver_id").eq("event_id", ev.id),
        ) as Array<{ giver_id: string; receiver_id: string }>;
        const unitExcl = excl
          .map((e) => ({ giver: unitOf.get(e.giver_id)!, receiver: unitOf.get(e.receiver_id)! }))
          .filter((e) => e.giver && e.receiver && e.giver !== e.receiver);

        const res = drawSecretSanta(
          [...sizes].map(([id, size]) => ({ id, size })),
          ev.draws_per_person,
          unitExcl,
        );
        if (!res.ok) return fail(422, res.error);

        must(await sb.from("assignments").delete().eq("event_id", ev.id));
        must(
          await sb.from("assignments").insert(
            res.pairs.map((p) => ({ event_id: ev.id, giver_unit: p.giver, receiver_unit: p.receiver })),
          ),
        );
        must(await sb.from("events").update({ drawn_at: new Date().toISOString() }).eq("id", ev.id));
        break;
      }

      case "resetDraw": {
        // Supprime le tirage, les tickets grattés, les réservations et les messages. Les listes sont conservées.
        const ps = await participants(ev.id);
        const ids = ps.map((p) => p.id);
        const unitIds = [...new Set(ps.map((p) => p.unit_id))];
        if (ids.length) {
          must(await sb.from("reveals").delete().in("participant_id", ids));
          must(await sb.from("selections").delete().in("santa_id", ids));
        }
        if (unitIds.length) must(await sb.from("messages").delete().in("room_id", unitIds));
        must(await sb.from("assignments").delete().eq("event_id", ev.id));
        must(await sb.from("events").update({ drawn_at: null }).eq("id", ev.id));
        break;
      }

      default:
        fail(400, "Action inconnue.");
    }

    return state(await loadEvent(token));
  });
}
