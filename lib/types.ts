export type Profile = { id: string; pseudo: string; avatar: string | null };

/** Une personne seule ou un groupe, tel qu'affiché. */
export type UnitView = { id: string; name: string; members: Profile[] };

export type AdminState = {
  event: { name: string; drawsPerPerson: number; drawnAt: string | null };
  participants: Array<Profile & { token: string; revealed: number; unitId: string }>;
  groups: Array<{ id: string; name: string | null; memberIds: string[] }>;
  exclusions: Array<{ id: string; giverId: string; receiverId: string }>;
  /** Cadeaux à préparer par personne après le tirage (min et max), sans révéler qui a tiré qui. */
  balance: { min: number; max: number } | null;
};

export type MeState = {
  me: Profile;
  group: { name: string; partners: Profile[] } | null;
  event: { name: string; drawsPerPerson: number; drawn: boolean };
  draws: Array<{ slot: number; receiver: UnitView | null }>;
};

export type Idea = { id: string; title: string; details: string | null; url: string | null };

export type RoomState = {
  receiver: UnitView;
  santas: Array<Profile & { isMe: boolean }>;
  ideas: Array<Idea & { ownerId: string; takenBy: { pseudo: string; isMe: boolean } | null }>;
  messages: Array<{ id: number; authorId: string; body: string; createdAt: string }>;
};
