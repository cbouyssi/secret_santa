import CreateEvent from "./CreateEvent";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <>
      <header className="hero">
        <h1 className="hero-title">Secret Santa</h1>
        <p className="hero-sub">
          Tu prépares le tirage, chacun gratte son ticket, écrit sa liste d&apos;idées et s&apos;organise en secret avec
          les autres pères Noël.
        </p>
      </header>
      <CreateEvent needsSecret={!!process.env.CREATE_SECRET} />
    </>
  );
}
