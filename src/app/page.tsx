import { auth } from "@/auth";
import { LinkButton } from "@/components/button";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-4">
      <h1 className="text-3xl font-semibold">MTG Commander Deckbuilder</h1>
      <p className="text-muted">
        Import your collection, get an LLM-suggested commander, build a legal 100-card
        deck from cards you own, and get a critique - all scoped to what&apos;s actually
        in your collection.
      </p>

      <LinkButton href={isLoggedIn ? "/collection" : "/signup"} className="px-4 py-2">
        {isLoggedIn ? "Go to collection" : "Sign up"}
      </LinkButton>
    </main>
  );
}
