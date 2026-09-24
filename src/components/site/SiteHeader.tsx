import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useMe, useSession, useSignOut } from "@/lib/auth";

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-ink font-display text-[15px] text-paper">
        V
      </span>
      <span className="font-display text-lg font-medium tracking-tight text-ink">Vellum</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, loading } = useSession();
  const me = useMe(!!user);
  const signOut = useSignOut();
  const navigate = useNavigate();

  const roleLabel =
    me.data?.primaryRole === "accommodation_partner"
      ? "Accommodation"
      : me.data?.primaryRole === "distribution_partner"
        ? "Distribution"
        : null;

  return (
    <header className="sticky top-0 z-40 border-b border-paper/50 bg-paper/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Brand />
        <nav className="hidden items-center gap-8 text-[13px] text-ink/60 md:flex">
          {user ? (
            <Link to="/dashboard" className="transition hover:text-ink" activeProps={{ className: "text-ink" }}>
              Dashboard
            </Link>
          ) : (
            <>
              <span>Inventory</span>
              <span>Distribution</span>
              <span>Attribution</span>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {!loading && user && roleLabel && (
            <span className="hidden items-center gap-2 rounded-full border border-ink/10 bg-paper/60 px-3 py-1.5 text-[12px] text-ink/70 sm:flex">
              <span className="size-1.5 rounded-full bg-moss" /> Signed in · {roleLabel}
            </span>
          )}
          {!loading && user ? (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/" });
              }}
            >
              Sign out
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-paper/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[12px] text-ink/50 sm:flex-row">
        <span className="font-display text-sm text-ink/70">
          Vellum — open distribution for independent travel
        </span>
        <span>EUR · Commission calculated in-database</span>
      </div>
    </footer>
  );
}
