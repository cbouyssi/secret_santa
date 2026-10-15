import type { Profile } from "@/lib/types";

const HUES = [4, 28, 140, 160, 200, 330, 45, 110];

export default function Avatar({ p, size = 44 }: { p: Pick<Profile, "pseudo" | "avatar">; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (p.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={p.avatar} alt="" style={style} />;
  }
  let h = 0;
  for (const c of p.pseudo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      className="avatar avatar-initial"
      style={{ ...style, background: `hsl(${hue} 55% 42%)` }}
      aria-hidden="true"
    >
      {p.pseudo.trim().charAt(0).toUpperCase()}
    </span>
  );
}
