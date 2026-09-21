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

  const navLinkClasses =
    "text-xs font-bold uppercase tracking-wide text-white transition-[filter] " +
    "hover:[filter:drop-shadow(0_0_8px_var(--primary))]";

  return (
    <div className="bg-[#0c0f11]">
      <nav className="flex h-[54px] items-center justify-between px-4">
        <Link href="/" className="font-display text-lg tracking-wide text-white">
          MTG Deckbuilder
        </Link>

        {isLoggedIn ? (
          <div className="flex items-center gap-6">
            <Link href="/collection" className={navLinkClasses}>
              Collection
            </Link>
            <Link href="/import" className={navLinkClasses}>
              Import
            </Link>
            <Link href="/decks" className={navLinkClasses}>
              My Decks
            </Link>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" className="px-3 py-1 text-xs text-white">
                Log out
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <Link href="/login" className={navLinkClasses}>
              Log in
            </Link>
            <Link href="/signup" className={navLinkClasses}>
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
