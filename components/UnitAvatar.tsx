import Avatar from "./Avatar";
import type { Profile } from "@/lib/types";

/** Avatar d'une personne, ou avatars superposés pour un groupe. */
export default function UnitAvatar({ members, size = 44 }: { members: Profile[]; size?: number }) {
  if (members.length <= 1) return members[0] ? <Avatar p={members[0]} size={size} /> : null;
  const shown = members.slice(0, 4);
  const each = Math.round(size * 0.78);
  return (
    <span className="unit-avatar" style={{ height: each }} aria-hidden="true">
      {shown.map((m, i) => (
        <span key={m.id} style={{ marginLeft: i ? -each * 0.38 : 0, zIndex: shown.length - i }}>
          <Avatar p={m} size={each} />
        </span>
      ))}
      {members.length > 4 && <span className="unit-more">+{members.length - 4}</span>}
    </span>
  );
}
