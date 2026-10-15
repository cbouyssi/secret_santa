import { db } from "@/lib/supabase";
import { avatar, fail, handle, must, newToken, text } from "@/lib/server";
import { drawSecretSanta } from "@/lib/draw";
import type { AdminState } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

type EventRow = { id: string; name: string; draws_per_person: number; drawn_at: string | null };

async function loadEvent(token: string): Promise<EventRow> {
  const rows = must(
    await db().from("events").select("id, name, draws_per_person, drawn_at").eq("admin_token", token).limit(1),
  ) as EventRow[];
  if (!rows.length) fail(404, "Lien administrateur inconnu.");
  return rows[0];
}

async function participantIds(eventId: string): Promise<string[]> {
  const rows = must(await db().from("participants").select("id").eq("event_id", eventId)) as { id: string }[];
  return rows.map((r) => r.id);
}

async function ensureParticipant(eventId: string, id: unknown) {
  if (typeof id !== "string") fail(400, "Participant invalide.");
  const ids = await participantIds(eventId);
  if (!ids.includes(id as string)) fail(404, "Participant introuvable.");
  return id as string;
}

const notDrawn = (ev: EventRow) => {
  if (ev.drawn_at) fail(409, "Le tirage a déjà eu lieu. Réinitialise-le pour modifier ce réglage.");
};

async function state(ev: EventRow): Promise<AdminState> {
  const [participants, exclusions, assignments] = await Promise.all([
    db().from("participants").select("id, pseudo, avatar, token").eq("event_id", ev.id).order("created_at"),
    db().from("exclusions").select("id, giver_id, receiver_id").eq("event_id", ev.id),
    db().from("assignments").select("giver_id").eq("event_id", ev.id).not("revealed_at", "is", null),
  ]);
  const revealed = new Map<string, number>();
  for (const a of must(assignments) as { giver_id: string }[]) {
    revealed.set(a.giver_id, (revealed.get(a.giver_id) ?? 0) + 1);
  }
  return {
    event: { name: ev.name, drawsPerPerson: ev.draws_per_person, drawnAt: ev.drawn_at },
    participants: (must(participants) as Array<{ id: string; pseudo: string; avatar: string | null; token: string }>).map(
      (p) => ({ ...p, revealed: revealed.get(p.id) ?? 0 }),
    ),
    exclusions: (must(exclusions) as Array<{ id: string; giver_id: string; receiver_id: string }>).map((e) => ({
      id: e.id,
      giverId: e.giver_id,
      receiverId: e.receiver_id,
    })),
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
        must(
          await sb.from("participants").insert({
            event_id: ev.id,
            pseudo,
            avatar: avatar(body.avatar),
            token: newToken(),
          }),
        );
        break;
      }

      case "updateParticipant": {
        const id = await ensureParticipant(ev.id, body.id);
        const patch: Record<string, unknown> = {};
        if (body.pseudo !== undefined) patch.pseudo = text(body.pseudo, 40, "Le pseudo");
        if (body.avatar !== undefined) patch.avatar = avatar(body.avatar);
        if (Object.keys(patch).length) must(await sb.from("participants").update(patch).eq("id", id));
        break;
      }

      case "removeParticipant": {
        notDrawn(ev);
        const id = await ensureParticipant(ev.id, body.id);
        must(await sb.from("participants").delete().eq("id", id));
        break;
      }

      case "newLink": {
        // Régénère le lien d'un participant (si un lien a fuité)
        const id = await ensureParticipant(ev.id, body.id);
        must(await sb.from("participants").update({ token: newToken() }).eq("id", id));
        break;
      }

      case "addExclusion": {
        notDrawn(ev);
        const giver = await ensureParticipant(ev.id, body.giverId);
        const receiver = await ensureParticipant(ev.id, body.receiverId);
        if (giver === receiver) fail(400, "Choisis deux personnes différentes.");
        const rows = [{ event_id: ev.id, giver_id: giver, receiver_id: receiver }];
        if (body.symmetric) rows.push({ event_id: ev.id, giver_id: receiver, receiver_id: giver });
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
        const ids = await participantIds(ev.id);
        const excl = must(
          await sb.from("exclusions").select("giver_id, receiver_id").eq("event_id", ev.id),
        ) as Array<{ giver_id: string; receiver_id: string }>;
        const res = drawSecretSanta(
          ids,
          ev.draws_per_person,
          excl.map((e) => ({ giver: e.giver_id, receiver: e.receiver_id })),
        );
        if (!res.ok) fail(422, res.error);
        if (!res.ok) break;
        must(await sb.from("assignments").delete().eq("event_id", ev.id));
        must(
          await sb.from("assignments").insert(
            res.pairs.map((p) => ({ event_id: ev.id, giver_id: p.giver, receiver_id: p.receiver })),
          ),
        );
        must(await sb.from("events").update({ drawn_at: new Date().toISOString() }).eq("id", ev.id));
        break;
      }

      case "resetDraw": {
        // Supprime le tirage, les sélections de cadeaux et les messages. Les listes d'idées sont conservées.
        const ids = await participantIds(ev.id);
        if (ids.length) {
          must(await sb.from("selections").delete().in("santa_id", ids));
          must(await sb.from("messages").delete().in("room_id", ids));
        }
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
