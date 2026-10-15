export type Profile = { id: string; pseudo: string; avatar: string | null };

export type AdminState = {
  event: { name: string; drawsPerPerson: number; drawnAt: string | null };
  participants: Array<Profile & { token: string; revealed: number }>;
  exclusions: Array<{ id: string; giverId: string; receiverId: string }>;
};

export type MeState = {
  me: Profile;
  event: { name: string; drawsPerPerson: number; drawn: boolean };
  draws: Array<{ slot: number; receiver: Profile | null }>;
};

export type Idea = { id: string; title: string; details: string | null; url: string | null };

export type RoomState = {
  receiver: Profile;
  santas: Array<Profile & { isMe: boolean }>;
  ideas: Array<Idea & { takenBy: { pseudo: string; isMe: boolean } | null }>;
  messages: Array<{ id: number; authorId: string; body: string; createdAt: string }>;
};
