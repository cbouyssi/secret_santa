"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import UnitAvatar from "./UnitAvatar";
import type { UnitView } from "@/lib/types";

const PHRASES = [
  "Ho ho ho ! Prépare ta hotte pour",
  "Le traîneau s'arrêtera chez",
  "Les lutins ont tranché, tu gâtes",
  "Interdit de faire la tête, tu offres à",
  "Rudolph a reniflé la piste de",
  "Mission top secrète : faire plaisir à",
];

type Props = {
  number: number;
  /** Appelé au premier coup de grattage : révèle côté serveur et renvoie le profil. */
  reveal: () => Promise<UnitView>;
  /** Appelé quand le ticket est entièrement découvert. */
  onDone: (u: UnitView) => void;
};

export default function ScratchCard({ number, reveal, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<UnitView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [phrase] = useState(() => PHRASES[Math.floor(Math.random() * PHRASES.length)]);
  const started = useRef(false);
  const profileRef = useRef<UnitView | null>(null);
  const finishing = useRef(false);

  // Dessine la couche dorée à gratter
  useEffect(() => {
    const c = canvasRef.current!;
    const wrap = c.parentElement!;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#9c6f1e");
    g.addColorStop(0.35, "#e9c46a");
    g.addColorStop(0.55, "#f7e3a3");
    g.addColorStop(0.75, "#d4a43f");
    g.addColorStop(1, "#8f6418");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 248, 220, 0.35)";
    ctx.font = "16px serif";
    for (let y = 18; y < h; y += 30) {
      for (let x = (y / 30) % 2 ? 10 : 25; x < w; x += 30) ctx.fillText("✦", x, y);
    }
    ctx.fillStyle = "#4a3208";
    ctx.textAlign = "center";
    ctx.font = "400 26px 'Alfa Slab One', Georgia, serif";
    ctx.fillText("Gratte ici", w / 2, h / 2 + 4);
    ctx.font = "500 14px 'Work Sans', system-ui, sans-serif";
    ctx.fillText("avec ton doigt ou ta souris", w / 2, h / 2 + 28);
  }, []);

  const start = async () => {
    if (started.current) return;
    started.current = true;
    try {
      const p = await reveal();
      profileRef.current = p;
      setProfile(p);
    } catch (e) {
      started.current = false;
      setError((e as Error).message);
    }
  };

  const finish = () => {
    if (finishing.current) return;
    finishing.current = true;
    setCleared(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const origin = {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      };
      confetti({ particleCount: 140, spread: 80, origin, colors: ["#C4302B", "#E9C46A", "#FFFDF7", "#2D6A4F"] });
      setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } }), 250);
      setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } }), 400);
    }
    setTimeout(() => profileRef.current && onDone(profileRef.current), reduce ? 300 : 2600);
  };

  // Gestion du grattage
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    let down = false;
    let last: { x: number; y: number } | null = null;
    let moves = 0;

    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const ratioCleared = () => {
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let clear = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 4 * 24) {
        total++;
        if (data[i] === 0) clear++;
      }
      return clear / total;
    };

    const scratch = (p: { x: number; y: number }) => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 46;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo((last ?? p).x, (last ?? p).y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      if (++moves % 10 === 0 && profileRef.current && ratioCleared() > 0.5) finish();
    };

    const onDown = (e: PointerEvent) => {
      down = true;
      last = null;
      c.setPointerCapture(e.pointerId);
      void start();
      scratch(pos(e));
    };
    const onMove = (e: PointerEvent) => down && scratch(pos(e));
    const onUp = () => {
      down = false;
      last = null;
      if (profileRef.current && ratioCleared() > 0.5) finish();
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revealAll = async () => {
    await start();
    if (profileRef.current) finish();
  };

  return (
    <div className="ticket">
      <div className="ticket-head">
        <span className="ticket-number">Ticket n° {number}</span>
      </div>
      <div className={`scratch ${cleared ? "is-cleared" : ""}`}>
        <div className="scratch-under">
          {profile ? (
            <div className={`reveal ${cleared ? "pop" : ""}`}>
              <p className="reveal-phrase">{phrase}</p>
              <UnitAvatar members={profile.members} size={96} />
              <p className="reveal-name">{profile.name}</p>
              {profile.members.length > 1 && (
                <p className="reveal-phrase">Un groupe : {profile.members.length} cadeaux, un pour chacun</p>
              )}
            </div>
          ) : (
            <p className="reveal-phrase">Les lutins cherchent…</p>
          )}
        </div>
        <canvas ref={canvasRef} className="scratch-layer" aria-label={`Ticket ${number} à gratter`} />
      </div>
      {error && <p className="error">{error}</p>}
      {!cleared && (
        <button type="button" className="link-button" onClick={revealAll}>
          Tout découvrir d&apos;un coup
        </button>
      )}
    </div>
  );
}
