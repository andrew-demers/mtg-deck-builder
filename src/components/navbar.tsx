import Link from "next/link";
import { auth } from "@/auth";
import Button from "@/components/button";
import { logoutAction } from "@/app/logout-action";

/**
 * Session-aware top nav rendered once in the root layout so every page is
 * reachable by clicking a link instead of typing a URL.
 */
export default async function Navbar() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="border-b bg-surface">
      <nav className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-primary">
          MTG Deckbuilder
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/collection" className="hover:text-primary">
              Collection
            </Link>
            <Link href="/import" className="hover:text-primary">
              Import
            </Link>
            <Link href="/decks" className="hover:text-primary">
              My Decks
            </Link>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" className="px-3 py-1">
                Log out
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="hover:text-primary">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-primary">
              Sign up
            </Link>
          </div>
        )}
      </nav>

      {/* WUBRG stripe - decorative Commander color-identity accent, see globals.css */}
      <div className="flex h-1">
        <span className="flex-1 bg-mana-white" />
        <span className="flex-1 bg-mana-blue" />
        <span className="flex-1 bg-mana-black" />
        <span className="flex-1 bg-mana-red" />
        <span className="flex-1 bg-mana-green" />
      </div>
    </div>
  );
}
