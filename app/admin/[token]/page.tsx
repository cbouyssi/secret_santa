"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Avatar from "@/components/Avatar";
import UnitAvatar from "@/components/UnitAvatar";
import { api, copyOrShare, resizeImage } from "@/lib/api";
import type { AdminState } from "@/lib/types";

type Participant = AdminState["participants"][number];

export default function AdminPage() {
  const { token } = useParams<{ token: string }>();
  const endpoint = `/api/admin/${token}`;
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api<AdminState>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setState(await api<AdminState>(endpoint, body));
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return error ? <p className="ticket error">{error}</p> : <p className="loading">Chargement…</p>;
  }

  const drawn = !!state.event.drawnAt;

  return (
    <>
      <header className="hero hero-small">
        <p className="hero-kicker">Espace organisateur</p>
        <h1 className="hero-title">{state.event.name}</h1>
      </header>

      <p className="banner">
        Cette page est réservée à l&apos;organisateur : mets-la en favori et ne partage pas son adresse. Si tu participes
        aussi, ajoute-toi à la liste et utilise ton propre lien.
      </p>

      {error && <p className="toast toast-error" role="alert">{error}</p>}
      {notice && <p className="toast" role="status">{notice}</p>}

      <EventSettings state={state} busy={busy} drawn={drawn} act={act} />
      <Participants state={state} busy={busy} drawn={drawn} act={act} />
      <Groups state={state} busy={busy} drawn={drawn} act={act} />
      <Exclusions state={state} busy={busy} drawn={drawn} act={act} />
      <DrawSection state={state} busy={busy} drawn={drawn} act={act} />
    </>
  );
}

type SectionProps = {
  state: AdminState;
  busy: boolean;
  drawn: boolean;
  act: (body: Record<string, unknown>, success?: string) => Promise<boolean>;
};

function EventSettings({ state, busy, drawn, act }: SectionProps) {
  const [name, setName] = useState(state.event.name);
  const [k, setK] = useState(state.event.drawsPerPerson);
  const dirty = name !== state.event.name || k !== state.event.drawsPerPerson;
  return (
    <section className="ticket stack">
      <h2 className="section-title">Réglages</h2>
      <label className="field">
        <span>Nom du tirage</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label className="field">
        <span>Nombre de personnes tirées par participant</span>
        <input type="number" min={1} max={20} value={k} disabled={drawn} onChange={(e) => setK(Number(e.target.value))} />
        <small>
          Chacun offrira à {k} personne{k > 1 ? "s" : ""} et recevra {k} cadeau{k > 1 ? "x" : ""}.
          {drawn && " Modifiable après réinitialisation du tirage."}
        </small>
      </label>
      <button className="button button-quiet" disabled={!dirty || busy} onClick={() => act({ action: "updateEvent", name, drawsPerPerson: k }, "Réglages enregistrés.")}>
        Enregistrer les réglages
      </button>
    </section>
  );
}

function Participants({ state, busy, drawn, act }: SectionProps) {
  const [pseudo, setPseudo] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act({ action: "addParticipant", pseudo, avatar }, `${pseudo} ajouté·e.`)) {
      setPseudo("");
      setAvatar(null);
    }
  };

  return (
    <section className="ticket stack">
      <h2 className="section-title">Participants ({state.participants.length})</h2>

      {state.participants.length === 0 && <p className="hint">Ajoute les membres de la famille, toi compris si tu participes.</p>}

      <ul className="people">
        {state.participants.map((p) => (
          <ParticipantRow
            key={p.id}
            p={p}
            group={groupLabel(state, p.unitId)}
            k={state.event.drawsPerPerson}
            eventName={state.event.name}
            busy={busy}
            drawn={drawn}
            act={act}
          />
        ))}
      </ul>

      {!drawn && (
        <form className="add-person" onSubmit={add}>
          <ImagePicker value={avatar} onChange={setAvatar} onError={setImgError} label="Photo (facultative)" />
          <label className="field grow">
            <span>Pseudo</span>
            <input value={pseudo} onChange={(e) => setPseudo(e.target.value)} placeholder="Tonton Jacques" maxLength={40} required />
          </label>
          <button className="button" disabled={busy || !pseudo.trim()}>
            Ajouter
          </button>
          {imgError && <p className="error">{imgError}</p>}
        </form>
      )}
    </section>
  );
}

function ParticipantRow({
  p,
  group,
  k,
  eventName,
  busy,
  drawn,
  act,
}: {
  p: Participant;
  group: string | null;
  k: number;
  eventName: string;
  busy: boolean;
  drawn: boolean;
  act: SectionProps["act"];
}) {
  const [editing, setEditing] = useState(false);
  const [pseudo, setPseudo] = useState(p.pseudo);
  const [avatar, setAvatar] = useState<string | null>(p.avatar);
  const [copied, setCopied] = useState<string | null>(null);

  const link = typeof window !== "undefined" ? `${window.location.origin}/p/${p.token}` : "";

  const share = async () => {
    const how = await copyOrShare(link, `${eventName} : ton lien Secret Santa`);
    setCopied(how === "copied" ? "Lien copié" : "Partagé");
    setTimeout(() => setCopied(null), 2000);
  };

  if (editing) {
    return (
      <li className="person editing">
        <ImagePicker value={avatar} onChange={setAvatar} onError={() => {}} label="Photo" />
        <input className="grow" value={pseudo} onChange={(e) => setPseudo(e.target.value)} maxLength={40} aria-label="Pseudo" />
        <button
          className="button"
          disabled={busy || !pseudo.trim()}
          onClick={async () => {
            if (await act({ action: "updateParticipant", id: p.id, pseudo, avatar }, "Participant modifié.")) setEditing(false);
          }}
        >
          Enregistrer
        </button>
        <button className="link-button" onClick={() => setEditing(false)}>
          Annuler
        </button>
      </li>
    );
  }

  return (
    <li className="person">
      <Avatar p={p} />
      <div className="grow">
        <p className="person-name">{p.pseudo}</p>
        {group && <p className="person-meta">Groupe {group}</p>}
        {drawn && (
          <p className="person-meta">
            {p.revealed === k ? "A découvert tous ses tickets" : `${p.revealed} ticket${p.revealed > 1 ? "s" : ""} gratté${p.revealed > 1 ? "s" : ""} sur ${k}`}
          </p>
        )}
      </div>
      <div className="person-actions">
        <button className="button button-small" onClick={share}>
          {copied ?? "Envoyer son lien"}
        </button>
        <button className="link-button" onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button
          className="link-button"
          onClick={() => {
            if (confirm(`Créer un nouveau lien pour ${p.pseudo} ? L'ancien ne fonctionnera plus.`)) act({ action: "newLink", id: p.id }, "Nouveau lien créé.");
          }}
        >
          Nouveau lien
        </button>
        {!drawn && (
          <button
            className="link-button danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Retirer ${p.pseudo} du tirage ? Sa liste d'idées sera supprimée.`)) act({ action: "removeParticipant", id: p.id });
            }}
          >
            Retirer
          </button>
        )}
      </div>
    </li>
  );
}

function ImagePicker({
  value,
  onChange,
  onError,
  label,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  onError: (e: string | null) => void;
  label: string;
}) {
  return (
    <div className="image-picker">
      <label className="image-drop" title={label}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" />
        ) : (
          <span>Photo</span>
        )}
        <input
          type="file"
          accept="image/*"
          aria-label={label}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              onError(null);
              onChange(await resizeImage(f));
            } catch (err) {
              onError((err as Error).message);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          Enlever
        </button>
      )}
    </div>
  );
}

function Exclusions({ state, busy, drawn, act }: SectionProps) {
  const [giver, setGiver] = useState("");
  const [receiver, setReceiver] = useState("");
  const [symmetric, setSymmetric] = useState(true);
  const names = useMemo(() => new Map(state.participants.map((p) => [p.id, p.pseudo])), [state.participants]);

  // Regroupe A→B et B→A en une seule ligne « A ⇄ B »
  const groups = useMemo(() => {
    const byKey = new Map(state.exclusions.map((e) => [`${e.giverId}>${e.receiverId}`, e]));
    const done = new Set<string>();
    const out: Array<{ label: string; ids: string[] }> = [];
    for (const e of state.exclusions) {
      if (done.has(e.id)) continue;
      const back = byKey.get(`${e.receiverId}>${e.giverId}`);
      done.add(e.id);
      if (back) {
        done.add(back.id);
        out.push({ label: `${names.get(e.giverId)} et ${names.get(e.receiverId)} ne se tirent pas mutuellement`, ids: [e.id, back.id] });
      } else {
        out.push({ label: `${names.get(e.giverId)} ne tire pas ${names.get(e.receiverId)}`, ids: [e.id] });
      }
    }
    return out;
  }, [state.exclusions, names]);

  if (state.participants.length < 2) return null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act({ action: "addExclusion", giverId: giver, receiverId: receiver, symmetric })) {
      setGiver("");
      setReceiver("");
    }
  };

  return (
    <section className="ticket stack">
      <h2 className="section-title">Exclusions</h2>
      <p className="hint">
        Pour éviter par exemple que deux conjoints se tirent entre eux. Personne ne peut se tirer soi-même, ni tirer son
        propre groupe. Exclure un membre d&apos;un groupe exclut tout le groupe.
      </p>
      {groups.length > 0 && (
        <ul className="exclusions">
          {groups.map((g) => (
            <li key={g.ids.join()}>
              <span>{g.label}</span>
              {!drawn && (
                <button className="link-button danger" disabled={busy} onClick={() => act({ action: "removeExclusions", ids: g.ids })}>
                  Supprimer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!drawn && (
        <form className="exclusion-form" onSubmit={add}>
          <select value={giver} onChange={(e) => setGiver(e.target.value)} required aria-label="Personne qui tire">
            <option value="">Choisir…</option>
            {state.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pseudo}
              </option>
            ))}
          </select>
          <span>ne tire pas</span>
          <select value={receiver} onChange={(e) => setReceiver(e.target.value)} required aria-label="Personne exclue">
            <option value="">Choisir…</option>
            {state.participants
              .filter((p) => p.id !== giver)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pseudo}
                </option>
              ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={symmetric} onChange={(e) => setSymmetric(e.target.checked)} />
            et inversement
          </label>
          <button className="button button-quiet" disabled={busy}>
            Ajouter l&apos;exclusion
          </button>
        </form>
      )}
    </section>
  );
}

const fmt = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function DrawSection({ state, busy, drawn, act }: SectionProps) {
  const n = state.participants.length;
  const units = new Set(state.participants.map((p) => p.unitId)).size;
  const g = state.groups.length;
  const k = state.event.drawsPerPerson;
  const b = state.balance;
  return (
    <section className="ticket stack draw-section">
      <h2 className="section-title">Tirage au sort</h2>
      {drawn ? (
        <>
          <p>
            Tirage effectué le{" "}
            {new Date(state.event.drawnAt!).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Envoie
            à chacun son lien : il découvrira ses tirés au sort en grattant ses tickets.
          </p>
          {b && (
            <p>
              {b.min === b.max
                ? `Chaque personne a ${fmt(b.min)} cadeau${b.min > 1 ? "x" : ""} à préparer.`
                : `Chaque personne a entre ${fmt(b.min)} et ${fmt(b.max)} cadeaux à préparer${g ? " (dans un groupe, les cadeaux sont partagés entre ses membres)" : ""}. C'est la répartition la plus équilibrée possible avec ces groupes et ces exclusions.`}
            </p>
          )}
          <p className="hint">Même toi, tu ne peux pas voir qui a tiré qui.</p>
          <button
            className="link-button danger"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Réinitialiser le tirage ? Les attributions, les cadeaux réservés et les discussions seront effacés. Les listes d'idées sont conservées.",
                )
              )
                act({ action: "resetDraw" }, "Tirage réinitialisé.");
            }}
          >
            Réinitialiser le tirage
          </button>
        </>
      ) : (
        <>
          <p>
            {units < 2
              ? "Ajoute au moins deux participants (ou une personne et un groupe)."
              : `${n} participants${g ? `, dont ${g} groupe${g > 1 ? "s" : ""}, soit ${units} au tirage` : ""}. Chacun${g ? " (personne seule ou groupe)" : ""} tire ${k} ${k > 1 ? "personnes ou groupes" : "personne ou groupe"}. ${g ? "Le tirage répartit les groupes pour que chacun ait un nombre de cadeaux aussi proche que possible. " : ""}Une fois lancé, les participants, les groupes et les exclusions sont figés.`}
          </p>
          <button
            className="button button-big"
            disabled={busy || units < 2}
            onClick={() => {
              if (confirm("Lancer le tirage maintenant ?")) act({ action: "draw" }, "Tirage effectué ! Envoie maintenant les liens.");
            }}
          >
            Lancer le tirage
          </button>
        </>
      )}
    </section>
  );
}

function groupLabel(state: AdminState, unitId: string): string | null {
  const g = state.groups.find((x) => x.id === unitId);
  if (!g) return null;
  return g.name || g.memberIds.map((id) => state.participants.find((p) => p.id === id)?.pseudo).join(" & ");
}

function Groups({ state, busy, drawn, act }: SectionProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const solos = state.participants.filter((p) => !state.groups.some((g) => g.id === p.unitId));
  const byId = new Map(state.participants.map((p) => [p.id, p]));

  if (state.participants.length < 2) return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await act({ action: "createGroup", memberIds: selected, name }, "Groupe créé.")) {
      setSelected([]);
      setName("");
    }
  };

  return (
    <section className="ticket stack">
      <h2 className="section-title">Groupes</h2>
      <p className="hint">
        Les membres d&apos;un groupe tirent ensemble et sont tirés ensemble : celui qui tire un groupe offre un cadeau à
        chacun de ses membres. Chaque membre garde son propre lien et sa propre liste d&apos;idées.
      </p>

      {state.groups.length > 0 && (
        <ul className="groups">
          {state.groups.map((g) => (
            <GroupRow key={g.id} group={g} members={g.memberIds.map((id) => byId.get(id)!).filter(Boolean)} busy={busy} drawn={drawn} act={act} />
          ))}
        </ul>
      )}

      {!drawn && solos.length >= 2 && (
        <form className="group-form stack" onSubmit={create}>
          <p className="field-label">Former un groupe avec :</p>
          <div className="chips">
            {solos.map((p) => (
              <label key={p.id} className={`chip ${selected.includes(p.id) ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                <Avatar p={p} size={26} />
                {p.pseudo}
              </label>
            ))}
          </div>
          <label className="field">
            <span>Nom du groupe (facultatif)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Les Martin" />
          </label>
          <button className="button button-quiet" disabled={busy || selected.length < 2}>
            Former le groupe{selected.length >= 2 ? ` (${selected.length} personnes)` : ""}
          </button>
        </form>
      )}
    </section>
  );
}

function GroupRow({
  group,
  members,
  busy,
  drawn,
  act,
}: {
  group: AdminState["groups"][number];
  members: Participant[];
  busy: boolean;
  drawn: boolean;
  act: SectionProps["act"];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name ?? "");
  const label = group.name || members.map((m) => m.pseudo).join(" & ");

  return (
    <li className="group-row">
      <UnitAvatar members={members} size={44} />
      <div className="grow">
        {editing ? (
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nom du groupe" aria-label="Nom du groupe" className="grow" />
            <button
              className="button button-small"
              disabled={busy}
              onClick={async () => {
                if (await act({ action: "renameGroup", groupId: group.id, name }, "Groupe renommé.")) setEditing(false);
              }}
            >
              Enregistrer
            </button>
          </div>
        ) : (
          <>
            <p className="person-name">{label}</p>
            <p className="person-meta">{members.map((m) => m.pseudo).join(", ")}</p>
          </>
        )}
      </div>
      <div className="person-actions">
        {!editing && (
          <button className="link-button" onClick={() => setEditing(true)}>
            Renommer
          </button>
        )}
        {!drawn && (
          <button
            className="link-button danger"
            disabled={busy}
            onClick={() => {
              if (confirm(`Dissoudre le groupe « ${label} » ? Ses membres participeront seuls.`)) act({ action: "dissolveGroup", groupId: group.id }, "Groupe dissous.");
            }}
          >
            Dissoudre
          </button>
        )}
      </div>
    </li>
  );
}
