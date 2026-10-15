"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import ScratchCard from "@/components/ScratchCard";
import { api } from "@/lib/api";
import type { Idea, MeState, Profile, RoomState } from "@/lib/types";

type Tab = "tickets" | "liste" | "rooms";

export default function ParticipantPage() {
  const { token } = useParams<{ token: string }>();
  const endpoint = `/api/p/${token}`;
  const [state, setState] = useState<MeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("tickets");
  const [room, setRoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api<MeState>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return error ? <p className="ticket error">{error}</p> : <p className="loading">Chargement…</p>;

  const revealed = state.draws.filter((d) => d.receiver).map((d) => d.receiver!) as Profile[];

  const openRoom = (id: string) => {
    setRoom(id);
    setTab("rooms");
  };

  return (
    <>
      <header className="hero hero-small">
        <div className="me">
          <Avatar p={state.me} size={52} />
          <div>
            <p className="hero-kicker">{state.event.name}</p>
            <h1 className="hero-title">Salut {state.me.pseudo}</h1>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        <button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>
          Mes tickets
        </button>
        <button className={tab === "liste" ? "active" : ""} onClick={() => setTab("liste")}>
          Ma liste
        </button>
        <button
          className={tab === "rooms" ? "active" : ""}
          onClick={() => {
            setTab("rooms");
            if (!room && revealed.length === 1) setRoom(revealed[0].id);
          }}
        >
          Entre pères Noël
        </button>
      </nav>

      {tab === "tickets" && (
        <Tickets
          state={state}
          endpoint={endpoint}
          onRevealed={(slot, p) =>
            setState((s) => s && { ...s, draws: s.draws.map((d) => (d.slot === slot ? { ...d, receiver: p } : d)) })
          }
          openRoom={openRoom}
        />
      )}
      {tab === "liste" && <Wishlist endpoint={endpoint} />}
      {tab === "rooms" &&
        (room ? (
          <Room endpoint={endpoint} receiverId={room} meId={state.me.id} back={() => setRoom(null)} />
        ) : (
          <RoomList revealed={revealed} drawn={state.event.drawn} open={setRoom} />
        ))}
    </>
  );
}

function Tickets({
  state,
  endpoint,
  onRevealed,
  openRoom,
}: {
  state: MeState;
  endpoint: string;
  onRevealed: (slot: number, p: Profile) => void;
  openRoom: (id: string) => void;
}) {
  if (!state.event.drawn) {
    return (
      <section className="ticket stack">
        <h2 className="section-title">Patience…</h2>
        <p>L&apos;organisateur n&apos;a pas encore lancé le tirage. En attendant, écris ta liste d&apos;idées de cadeaux.</p>
      </section>
    );
  }
  const left = state.draws.filter((d) => !d.receiver).length;
  return (
    <div className="stack">
      <p className="intro">
        {left > 0
          ? `Tu as ${left} ticket${left > 1 ? "s" : ""} à gratter. Chaque ticket cache une personne à qui tu offriras un cadeau.`
          : "Tous tes tickets sont découverts. Garde le secret !"}
      </p>
      {state.draws.map((d) =>
        d.receiver ? (
          <div className="ticket revealed-ticket" key={d.slot}>
            <div className="ticket-head">
              <span className="ticket-number">Ticket n° {d.slot + 1}</span>
            </div>
            <div className="revealed-body">
              <Avatar p={d.receiver} size={64} />
              <div className="grow">
                <p className="small">Tu offres un cadeau à</p>
                <p className="revealed-name">{d.receiver.pseudo}</p>
              </div>
              <button className="button button-small" onClick={() => openRoom(d.receiver!.id)}>
                Voir sa liste
              </button>
            </div>
          </div>
        ) : (
          <ScratchCard
            key={d.slot}
            number={d.slot + 1}
            reveal={async () => (await api<{ receiver: Profile }>(endpoint, { action: "reveal", slot: d.slot })).receiver}
            onDone={(p) => onRevealed(d.slot, p)}
          />
        ),
      )}
    </div>
  );
}

function Wishlist({ endpoint }: { endpoint: string }) {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ ideas: Idea[] }>(endpoint, { action: "myIdeas" })
      .then((r) => setIdeas(r.ideas))
      .catch((e) => setError(e.message));
  }, [endpoint]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      setIdeas((await api<{ ideas: Idea[] }>(endpoint, body)).ideas);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <p className="intro">
        Tes pères Noël voient cette liste et se répartissent les idées entre eux. Tu ne sauras pas lesquelles ont été
        choisies : la surprise reste entière.
      </p>
      <IdeaForm
        key={editing?.id ?? "new"}
        initial={editing}
        busy={busy}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSubmit={async (v) => {
          const ok = await run(editing ? { action: "updateIdea", id: editing.id, ...v } : { action: "addIdea", ...v });
          if (ok) setEditing(null);
          return ok;
        }}
      />
      {error && <p className="error">{error}</p>}
      {ideas === null ? (
        <p className="loading">Chargement…</p>
      ) : ideas.length === 0 ? (
        <p className="hint">Ta liste est vide. Ajoute une première idée, même vague : « un livre de cuisine », « des chaussettes rigolotes »…</p>
      ) : (
        <ul className="ideas">
          {ideas.map((i) => (
            <li key={i.id} className="idea">
              <div className="grow">
                <p className="idea-title">{i.title}</p>
                {i.details && <p className="idea-details">{i.details}</p>}
                {i.url && (
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="idea-link">
                    Voir le lien
                  </a>
                )}
              </div>
              <div className="idea-actions">
                <button className="link-button" onClick={() => setEditing(i)}>
                  Modifier
                </button>
                <button
                  className="link-button danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Supprimer « ${i.title} » ?`)) run({ action: "deleteIdea", id: i.id });
                  }}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IdeaForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Idea | null;
  busy: boolean;
  onSubmit: (v: { title: string; details: string; url: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [details, setDetails] = useState(initial?.details ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");

  return (
    <form
      className="ticket stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await onSubmit({ title, details, url })) && !initial) {
          setTitle("");
          setDetails("");
          setUrl("");
        }
      }}
    >
      <h2 className="section-title">{initial ? "Modifier l'idée" : "Ajouter une idée"}</h2>
      <label className="field">
        <span>Idée</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required placeholder="Un bonnet en laine" />
      </label>
      <label className="field">
        <span>Précisions (facultatif)</span>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} rows={2} placeholder="Taille, couleur, budget…" />
      </label>
      <label className="field">
        <span>Lien (facultatif)</span>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={600} placeholder="https://…" />
      </label>
      <div className="row">
        <button className="button" disabled={busy || !title.trim()}>
          {initial ? "Enregistrer" : "Ajouter à ma liste"}
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

function RoomList({ revealed, drawn, open }: { revealed: Profile[]; drawn: boolean; open: (id: string) => void }) {
  if (!revealed.length) {
    return (
      <section className="ticket stack">
        <p>
          {drawn
            ? "Gratte tes tickets pour rejoindre les discussions avec les autres pères Noël."
            : "Les discussions s'ouvriront après le tirage."}
        </p>
      </section>
    );
  }
  return (
    <div className="stack">
      <p className="intro">Une discussion par personne que tu gâtes, avec les autres pères Noël qui l&apos;ont tirée.</p>
      <ul className="room-list">
        {revealed.map((p) => (
          <li key={p.id}>
            <button className="room-link" onClick={() => open(p.id)}>
              <Avatar p={p} size={48} />
              <span className="grow">
                Les pères Noël de <strong>{p.pseudo}</strong>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Room({ endpoint, receiverId, meId, back }: { endpoint: string; receiverId: string; meId: string; back: () => void }) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        setRoom(await api<RoomState>(endpoint, { ...body, receiverId }));
        setError(null);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [endpoint, receiverId],
  );

  // Rafraîchissement automatique toutes les 4 s quand l'onglet est visible
  useEffect(() => {
    run({ action: "room" });
    const t = setInterval(() => {
      if (document.visibilityState === "visible") run({ action: "room" });
    }, 4000);
    return () => clearInterval(t);
  }, [run]);

  useEffect(() => {
    const n = room?.messages.length ?? 0;
    if (n > lastCount.current) bottom.current?.scrollIntoView({ block: "nearest", behavior: lastCount.current ? "smooth" : "auto" });
    lastCount.current = n;
  }, [room?.messages.length]);

  if (!room) return error ? <p className="ticket error">{error}</p> : <p className="loading">Chargement…</p>;

  const byId = new Map(room.santas.map((s) => [s.id, s]));
  const others = room.santas.filter((s) => !s.isMe);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    await run(body);
    setBusy(false);
  };

  return (
    <div className="stack">
      <button className="link-button back" onClick={back}>
        ‹ Toutes les discussions
      </button>

      <section className="ticket stack">
        <div className="room-head">
          <Avatar p={room.receiver} size={64} />
          <div>
            <h2 className="section-title">Les cadeaux de {room.receiver.pseudo}</h2>
            <p className="small">
              {others.length
                ? `Avec ${others.map((s) => s.pseudo).join(", ")}. ${room.receiver.pseudo} ne voit pas cette page.`
                : `Tu es le seul père Noël de ${room.receiver.pseudo}.`}
            </p>
          </div>
        </div>

        {room.ideas.length === 0 ? (
          <p className="hint">{room.receiver.pseudo} n&apos;a pas encore écrit d&apos;idées. Repasse plus tard, ou parlez-en ici.</p>
        ) : (
          <ul className="ideas">
            {room.ideas.map((i) => (
              <li key={i.id} className={`idea ${i.takenBy ? "taken" : ""}`}>
                <div className="grow">
                  <p className="idea-title">{i.title}</p>
                  {i.details && <p className="idea-details">{i.details}</p>}
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noopener noreferrer" className="idea-link">
                      Voir le lien
                    </a>
                  )}
                </div>
                <div className="idea-actions">
                  {i.takenBy ? (
                    i.takenBy.isMe ? (
                      <>
                        <span className="stamp">Je m&apos;en charge</span>
                        <button className="link-button" disabled={busy} onClick={() => act({ action: "release", ideaId: i.id })}>
                          Libérer
                        </button>
                      </>
                    ) : (
                      <span className="stamp stamp-other">Pris par {i.takenBy.pseudo}</span>
                    )
                  ) : (
                    <button className="button button-small" disabled={busy} onClick={() => act({ action: "take", ideaId: i.id })}>
                      Je prends
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ticket chat">
        <h2 className="section-title">Discussion</h2>
        <div className="messages">
          {room.messages.length === 0 && <p className="hint">Aucun message. Lancez-vous : qui prend quoi ?</p>}
          {room.messages.map((m) => {
            const a = byId.get(m.authorId);
            const mine = m.authorId === meId;
            return (
              <div key={m.id} className={`msg ${mine ? "mine" : ""}`}>
                {!mine && a && <Avatar p={a} size={28} />}
                <div className="bubble">
                  {!mine && <span className="msg-author">{a?.pseudo ?? "Ancien participant"}</span>}
                  <p>{m.body}</p>
                  <time>{new Date(m.createdAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        <form
          className="composer"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setBusy(true);
            if (await run({ action: "send", body: draft })) setDraft("");
            setBusy(false);
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Écrire aux autres pères Noël…" maxLength={1000} aria-label="Message" />
          <button className="button" disabled={busy || !draft.trim()}>
            Envoyer
          </button>
        </form>
      </section>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
