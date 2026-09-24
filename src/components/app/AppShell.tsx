import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/auth";
import type { AppRole } from "@/lib/constants";
import { NAV, ROLE_LABEL } from "./nav";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_BASE } from "@/lib/access";
import { DemoLayer } from "./DemoMode";

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-ink font-display text-[15px] text-paper">V</span>
      <span className="font-display text-lg font-medium tracking-tight">Vellum</span>
    </Link>
  );
}

function NavList({ role, onNavigate }: { role: AppRole; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      <p className="eyebrow mb-3 px-3 text-sage">{ROLE_LABEL[role]}</p>
      {NAV[role].map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-foreground/65 transition hover:bg-mist/70 hover:text-foreground"
          activeProps={{ className: "bg-mist !text-foreground font-medium" }}
        >
          <item.icon className="size-4" />
          {item.title}
        </Link>
      ))}
    </nav>
  );
}

function UserMenu({ role }: { role: AppRole }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const name = me.data?.profile?.first_name || me.data?.user.email || "Account";
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="grid size-9 place-items-center rounded-full bg-moss font-medium text-paper outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring">
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">
          <span className="block text-[13px] font-medium">{name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{me.data?.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ href: `${ROLE_BASE[role]}/settings` })}>Settings</DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await qc.cancelQueries();
            qc.clear();
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ role, children }: { role: AppRole; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-paper/70 px-4 py-6 lg:flex">
        <div className="px-3">
          <Brand />
        </div>
        <div className="mt-10 flex-1">
          <NavList role={role} />
        </div>
        <p className="px-3 text-[11px] text-muted-foreground">Independent travel, distributed.</p>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-paper px-4 py-6">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-3">
            <Brand />
          </div>
          <div className="mt-10">
            <NavList role={role} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <UserMenu role={role} />
          </div>
        </header>
        <DemoLayer />
        <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12")}>{children}</main>
      </div>
    </div>
  );
}
