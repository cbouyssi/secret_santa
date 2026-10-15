import { db } from "@/lib/supabase";
import { fail, handle, must, text, url } from "@/lib/server";
import type { Idea, MeState, Profile, RoomState } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

type Me = Profile & { event_id: string };

async function loadMe(token: string): Promise<Me> {
  const rows = must(
    await db().from("participants").select("id, pseudo, avatar, event_id").eq("token", token).limit(1),
  ) as Me[];
  if (!rows.length) fail(404, "Ce lien n'est pas (ou plus) valide. Demande un nouveau lien à l'organisateur.");
  return rows[0];
}

/** Mes attributions, dans un ordre stable (les « tickets » 1, 2, 3...). */
async function myAssignments(me: Me) {
  const rows = must(
    await db().from("assignments").select("receiver_id, revealed_at").eq("giver_id", me.id),
  ) as Array<{ receiver_id: string; revealed_at: string | null }>;
  return rows.sort((a, b) => a.receiver_id.localeCompare(b.receiver_id));
}

async function profiles(ids: string[]): Promise<Map<string, Profile>> {
  if (!ids.length) return new Map();
  const rows = must(await db().from("participants").select("id, pseudo, avatar").in("id", ids)) as Profile[];
  return new Map(rows.map((p) => [p.id, p]));
}

/** Vérifie que je suis père Noël de receiverId ET que je l'ai découvert. */
async function assertSanta(me: Me, receiverId: unknown): Promise<string> {
  if (typeof receiverId !== "string") fail(400, "Room invalide.");
  const rows = must(
    await db()
      .from("assignments")
      .select("revealed_at")
      .eq("giver_id", me.id)
      .eq("receiver_id", receiverId as string)
      .limit(1),
  ) as Array<{ revealed_at: string | null }>;
  if (!rows.length || !rows[0].revealed_at) fail(403, "Tu n'as pas accès à cette room.");
  return receiverId as string;
}

async function meState(me: Me): Promise<MeState> {
  const evRows = must(
    await db().from("events").select("name, draws_per_person, drawn_at").eq("id", me.event_id).limit(1),
  ) as Array<{ name: string; draws_per_person: number; drawn_at: string | null }>;
  const ev = evRows[0];
  const assignments = ev.drawn_at ? await myAssignments(me) : [];
  const revealedIds = assignments.filter((a) => a.revealed_at).map((a) => a.receiver_id);
  const profs = await profiles(revealedIds);
  return {
    me: { id: me.id, pseudo: me.pseudo, avatar: me.avatar },
    event: { name: ev.name, drawsPerPerson: ev.draws_per_person, drawn: !!ev.drawn_at },
    draws: assignments.map((a, slot) => ({
      slot,
      receiver: a.revealed_at ? profs.get(a.receiver_id) ?? null : null,
    })),
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

async function roomState(me: Me, receiverId: string): Promise<RoomState> {
  const sb = db();
  const [santaRows, ideaRows, msgRows] = await Promise.all([
    sb.from("assignments").select("giver_id").eq("receiver_id", receiverId),
    sb.from("ideas").select("id, title, details, url").eq("owner_id", receiverId).order("created_at"),
    sb.from("messages").select("id, author_id, body, created_at").eq("room_id", receiverId).order("id", { ascending: false }).limit(300),
  ]);
  const santaIds = (must(santaRows) as Array<{ giver_id: string }>).map((s) => s.giver_id);
  const ideas = must(ideaRows) as Idea[];
  const selRows = ideas.length
    ? (must(await sb.from("selections").select("idea_id, santa_id").in("idea_id", ideas.map((i) => i.id))) as Array<{
        idea_id: string;
        santa_id: string;
      }>)
    : [];
  const profs = await profiles([receiverId, ...santaIds, ...selRows.map((s) => s.santa_id)]);
  const takenBy = new Map(selRows.map((s) => [s.idea_id, s.santa_id]));

  return {
    receiver: profs.get(receiverId)!,
    santas: santaIds.map((id) => ({ ...profs.get(id)!, isMe: id === me.id })),
    ideas: ideas.map((i) => {
      const s = takenBy.get(i.id);
      return { ...i, takenBy: s ? { pseudo: profs.get(s)?.pseudo ?? "?", isMe: s === me.id } : null };
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
        const slot = Number(body.slot);
        const assignments = await myAssignments(me);
        const a = assignments[slot];
        if (!a) fail(404, "Ticket introuvable.");
        if (!a.revealed_at) {
          must(
            await sb
              .from("assignments")
              .update({ revealed_at: new Date().toISOString() })
              .eq("giver_id", me.id)
              .eq("receiver_id", a.receiver_id),
          );
        }
        const p = (await profiles([a.receiver_id])).get(a.receiver_id)!;
        return { receiver: p };
      }

      case "myIdeas":
        return { ideas: await myIdeas(me) };

      case "addIdea": {
        const count = (await myIdeas(me)).length;
        if (count >= 50) fail(400, "50 idées maximum.");
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

      case "room": {
        const receiverId = await assertSanta(me, body.receiverId);
        return roomState(me, receiverId);
      }

      case "send": {
        const receiverId = await assertSanta(me, body.receiverId);
        must(
          await sb.from("messages").insert({
            room_id: receiverId,
            author_id: me.id,
            body: text(body.body, 1000, "Le message"),
          }),
        );
        return roomState(me, receiverId);
      }

      case "take": {
        const receiverId = await assertSanta(me, body.receiverId);
        const ideaId = typeof body.ideaId === "string" ? body.ideaId : fail(400, "Idée invalide.");
        const owned = must(
          await sb.from("ideas").select("id").eq("id", ideaId).eq("owner_id", receiverId).limit(1),
        ) as unknown[];
        if (!owned.length) fail(404, "Idée introuvable.");
        const res = await sb.from("selections").insert({ idea_id: ideaId, santa_id: me.id });
        if (res.error) {
          if (res.error.code === "23505") fail(409, "Un autre père Noël vient de prendre cette idée.");
          must(res);
        }
        return roomState(me, receiverId);
      }

      case "release": {
        const receiverId = await assertSanta(me, body.receiverId);
        if (typeof body.ideaId !== "string") fail(400, "Idée invalide.");
        must(await sb.from("selections").delete().eq("idea_id", body.ideaId).eq("santa_id", me.id));
        return roomState(me, receiverId);
      }

      default:
        fail(400, "Action inconnue.");
    }
  });
}
