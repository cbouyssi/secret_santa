import "server-only";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export const newToken = () => randomBytes(18).toString("base64url");

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

/** Enveloppe un handler : erreurs -> JSON { error }. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Erreur serveur. Réessaie dans un instant." }, { status: 500 });
  }
}

/** Lève une erreur 500 si Supabase renvoie une erreur. */
export function must<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    console.error(res.error);
    throw new HttpError(500, "Erreur de base de données.");
  }
  return res.data;
}

export function text(v: unknown, max: number, label: string, required = true): string | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    if (required) fail(400, `${label} est obligatoire.`);
    return null;
  }
  if (typeof v !== "string") fail(400, `${label} est invalide.`);
  const s = (v as string).trim();
  if (s.length > max) fail(400, `${label} : ${max} caractères maximum.`);
  return s;
}

export function avatar(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(v)) fail(400, "Image invalide.");
  if ((v as string).length > 400_000) fail(400, "Image trop lourde.");
  return v as string;
}

export function url(v: unknown): string | null {
  const s = text(v, 600, "Le lien", false);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    return fail(400, "Le lien doit commencer par http:// ou https://");
  }
}
