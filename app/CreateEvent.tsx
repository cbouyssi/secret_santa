"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function CreateEvent({ needsSecret }: { needsSecret: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [k, setK] = useState(1);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { adminToken } = await api<{ adminToken: string }>("/api/events", { name, drawsPerPerson: k, secret });
      router.push(`/admin/${adminToken}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="ticket stack" onSubmit={submit}>
      <h2 className="section-title">Organiser un tirage</h2>
      <label className="field">
        <span>Nom du tirage</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Noël 2026 chez Mamie" required maxLength={120} />
      </label>
      <label className="field">
        <span>Nombre de personnes tirées par participant</span>
        <input type="number" min={1} max={20} value={k} onChange={(e) => setK(Number(e.target.value))} required />
      </label>
      {needsSecret && (
        <label className="field">
          <span>Mot de passe de création</span>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy}>
        {busy ? "Création…" : "Créer le tirage"}
      </button>
      <p className="hint">Tu arriveras sur ta page d&apos;organisateur. Garde son adresse en favori : c&apos;est ta clé.</p>
    </form>
  );
}
