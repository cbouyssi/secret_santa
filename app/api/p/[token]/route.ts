import { db } from "@/lib/supabase";
import { fail, handle, must, text, url } from "@/lib/server";
import { unitName, unitViews } from "@/lib/units";
import type { Idea, MeState, Profile, RoomState } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

type Me = Profile & { event_id: string; unit_id: string };

async function loadMe(token: string): Promise<Me> {
  const rows = must(
    await db().from("participants").select("id, pseudo, avatar, event_id, unit_id").eq("token", token).limit(1),
  ) as Me[];
  if (!rows.length) fail(404, "Ce lien n'est pas (ou plus) valide. Demande un nouveau lien à l'organisateur.");
  return rows[0];
}

/** Les unités tirées par mon unité (personne seule ou groupe), dans un ordre stable. */
async function myDraws(me: Me): Promise<string[]> {
  const rows = must(
    await db().from("assignments").select("receiver_unit").eq("giver_unit", me.unit_id),
  ) as Array<{ receiver_unit: string }>;
  return rows.map((r) => r.receiver_unit).sort();
}

async function myReveals(me: Me): Promise<Set<string>> {
  const rows = must(
    await db().from("reveals").select("receiver_unit").eq("participant_id", me.id),
  ) as Array<{ receiver_unit: string }>;
  return new Set(rows.map((r) => r.receiver_unit));
}

/** Vérifie que mon unité a tiré receiverUnit ET que j'ai gratté ce ticket. */
async function assertSanta(me: Me, receiverUnit: unknown): Promise<string> {
  if (typeof receiverUnit !== "string") fail(400, "Room invalide.");
  const [draws, reveals] = await Promise.all([myDraws(me), myReveals(me)]);
  if (!draws.includes(receiverUnit as string) || !reveals.has(receiverUnit as string)) {
    fail(403, "Tu n'as pas accès à cette room.");
  }
  return receiverUnit as string;
}

async function meState(me: Me): Promise<MeState> {
  const sb = db();
  const [evRows, unitRows, partnerRows] = await Promise.all([
    sb.from("events").select("name, draws_per_person, drawn_at").eq("id", me.event_id).limit(1),
    sb.from("units").select("name").eq("id", me.unit_id).limit(1),
    sb.from("participants").select("id, pseudo, avatar").eq("unit_id", me.unit_id).order("created_at"),
  ]);
  const ev = (must(evRows) as Array<{ name: string; draws_per_person: number; drawn_at: string | null }>)[0];
  const members = must(partnerRows) as Profile[];
  const unitLabel = (must(unitRows) as Array<{ name: string | null }>)[0]?.name ?? null;

  const draws = ev.drawn_at ? await myDraws(me) : [];
  const reveals = await myReveals(me);
  const views = await unitViews(draws.filter((d) => reveals.has(d)));

  return {
    me: { id: me.id, pseudo: me.pseudo, avatar: me.avatar },
    group:
      members.length > 1
        ? { name: unitName(unitLabel, members), partners: members.filter((m) => m.id !== me.id) }
        : null,
    event: { name: ev.name, drawsPerPerson: ev.draws_per_person, drawn: !!ev.drawn_at },
    draws: draws.map((unitId, slot) => ({ slot, receiver: views.get(unitId) ?? null })),
  };
}

async function myIdeas(me: Me): Promise<Idea[]> {
  // Volontairement SANS information de sélection : le destinataire ne doit rien savoir.
  return must(
    await db().from("ideas").select("id, title, details, url").eq("owner_id", me.id).order("created_at"),
  ) as Idea[];
}

async function ownIdea(me: Me, id: unknown): Promise<string> {
  if (typeof id !== "string") fail(400, "Idée invalide.");
  const rows = must(
    await db().from("ideas").select("id").eq("id", id as string).eq("owner_id", me.id).limit(1),
  ) as unknown[];
  if (!rows.length) fail(404, "Idée introuvable.");
  return id as string;
}

async function roomState(me: Me, receiverUnit: string): Promise<RoomState> {
  const sb = db();
  const receiver = (await unitViews([receiverUnit])).get(receiverUnit)!;
  const memberIds = receiver.members.map((m) => m.id);

  const [giverRows, ideaRows, msgRows] = await Promise.all([
    sb.from("assignments").select("giver_unit").eq("receiver_unit", receiverUnit),
    memberIds.length
      ? sb.from("ideas").select("id, owner_id, title, details, url").in("owner_id", memberIds).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    sb.from("messages").select("id, author_id, body, created_at").eq("room_id", receiverUnit).order("id", { ascending: false }).limit(300),
  ]);
  const giverUnits = (must(giverRows) as Array<{ giver_unit: string }>).map((g) => g.giver_unit);
  const santas = giverUnits.length
    ? (must(
        await sb.from("participants").select("id, pseudo, avatar").in("unit_id", giverUnits).order("created_at"),
      ) as Profile[])
    : [];
  const ideas = must(ideaRows) as Array<Idea & { owner_id: string }>;
  const selRows = ideas.length
    ? (must(await sb.from("selections").select("idea_id, santa_id").in("idea_id", ideas.map((i) => i.id))) as Array<{
        idea_id: string;
        santa_id: string;
      }>)
    : [];
  const santaById = new Map(santas.map((s) => [s.id, s]));
  const takenBy = new Map(selRows.map((s) => [s.idea_id, s.santa_id]));

  return {
    receiver,
    santas: santas.map((s) => ({ ...s, isMe: s.id === me.id })),
    ideas: ideas.map((i) => {
      const s = takenBy.get(i.id);
      return {
        id: i.id,
        title: i.title,
        details: i.details,
        url: i.url,
        ownerId: i.owner_id,
        takenBy: s ? { pseudo: santaById.get(s)?.pseudo ?? "un ancien père Noël", isMe: s === me.id } : null,
      };
    }),
    messages: (must(msgRows) as Array<{ id: number; author_id: string; body: string; created_at: string }>)
      .reverse()
      .map((m) => ({ id: m.id, authorId: m.author_id, body: m.body, createdAt: m.created_at })),
  };
}

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  return handle(async () => meState(await loadMe(token)));
}

export async function POST(req: Request, { params }: Params) {
  const { token } = await params;
  return handle(async () => {
    const me = await loadMe(token);
    const body = await req.json().catch(() => ({}));
    const sb = db();

    switch (body.action) {
      case "reveal": {
        const draws = await myDraws(me);
        const unitId = draws[Number(body.slot)];
        if (!unitId) fail(404, "Ticket introuvable.");
        must(
          await sb
            .from("reveals")
            .upsert({ participant_id: me.id, receiver_unit: unitId }, { onConflict: "participant_id,receiver_unit", ignoreDuplicates: true }),
        );
        return { receiver: (await unitViews([unitId])).get(unitId)! };
      }

      case "myIdeas":
        return { ideas: await myIdeas(me) };

      case "addIdea": {
        if ((await myIdeas(me)).length >= 50) fail(400, "50 idées maximum.");
        must(
          await sb.from("ideas").insert({
            owner_id: me.id,
            title: text(body.title, 140, "Le titre"),
            details: text(body.details, 1000, "La description", false),
            url: url(body.url),
          }),
        );
        return { ideas: await myIdeas(me) };
      }

      case "updateIdea": {
        const id = await ownIdea(me, body.id);
        must(
          await sb
            .from("ideas")
            .update({
              title: text(body.title, 140, "Le titre"),
              details: text(body.details, 1000, "La description", false),
              url: url(body.url),
            })
            .eq("id", id),
        );
        return { ideas: await myIdeas(me) };
      }

      case "deleteIdea": {
        const id = await ownIdea(me, body.id);
        must(await sb.from("ideas").delete().eq("id", id));
        return { ideas: await myIdeas(me) };
      }

      case "room":
        return roomState(me, await assertSanta(me, body.receiverId));

      case "send": {
        const receiverUnit = await assertSanta(me, body.receiverId);
        must(
          await sb.from("messages").insert({ room_id: receiverUnit, author_id: me.id, body: text(body.body, 1000, "Le message") }),
        );
        return roomState(me, receiverUnit);
      }

      case "take": {
        const receiverUnit = await assertSanta(me, body.receiverId);
        const ideaId = typeof body.ideaId === "string" ? body.ideaId : fail(400, "Idée invalide.");
        // L'idée doit appartenir à un membre de l'unité de cette room
        const owner = must(await sb.from("ideas").select("owner_id").eq("id", ideaId).limit(1)) as Array<{ owner_id: string }>;
        const members = must(await sb.from("participants").select("id").eq("unit_id", receiverUnit)) as Array<{ id: string }>;
        if (!owner.length || !members.some((m) => m.id === owner[0].owner_id)) fail(404, "Idée introuvable.");
        const res = await sb.from("selections").insert({ idea_id: ideaId, santa_id: me.id });
        if (res.error) {
          if (res.error.code === "23505") fail(409, "Un autre père Noël vient de prendre cette idée.");
          must(res);
        }
        return roomState(me, receiverUnit);
      }

      case "release": {
        const receiverUnit = await assertSanta(me, body.receiverId);
        if (typeof body.ideaId !== "string") fail(400, "Idée invalide.");
        must(await sb.from("selections").delete().eq("idea_id", body.ideaId).eq("santa_id", me.id));
        return roomState(me, receiverUnit);
      }

      default:
        fail(400, "Action inconnue.");
    }
  });
}
