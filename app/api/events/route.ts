import { db } from "@/lib/supabase";
import { fail, handle, must, newToken, text } from "@/lib/server";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json().catch(() => ({}));
    const secret = process.env.CREATE_SECRET;
    if (secret && body.secret !== secret) fail(403, "Mot de passe de création incorrect.");

    const name = text(body.name, 120, "Le nom de l'événement")!;
    const k = Number(body.drawsPerPerson ?? 1);
    if (!Number.isInteger(k) || k < 1 || k > 20) fail(400, "Le nombre de tirages par personne doit être entre 1 et 20.");

    const adminToken = newToken();
    must(await db().from("events").insert({ name, draws_per_person: k, admin_token: adminToken }));
    return { adminToken };
  });
}
