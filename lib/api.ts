"use client";

/** Appel API côté navigateur. GET si pas de body, POST JSON sinon. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Connexion impossible. Vérifie ton réseau et réessaie.");
  return data as T;
}

/** Recadre en carré et réduit une image à `size` px, renvoie un data URL JPEG léger. */
export function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("Image illisible. Essaie un fichier JPG ou PNG."));
    };
    img.src = src;
  });
}

export async function copyOrShare(url: string, title: string): Promise<"shared" | "copied"> {
  if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch {
      /* annulé : on copie */
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
