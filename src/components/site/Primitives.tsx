import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/constants";

export function GlassCard({
  className,
  children,
  size = "md",
}: {
  className?: string;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className={cn(size === "lg" ? "glass-lg rounded-[26px]" : "glass rounded-[22px]", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

/** Distribution Partners always see what THEY earn. */
export function EarnBadge({ pct, className }: { pct: number | string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-[11px] font-medium text-moss",
        className,
      )}
    >
      You earn {formatPct(pct)}
    </span>
  );
}

export function StatusBadge({ status }: { status: "draft" | "published" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
        status === "published"
          ? "border-moss/30 bg-moss/10 text-moss"
          : "border-clay/30 bg-clay/10 text-clay",
      )}
    >
      {status}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-mist px-2 py-0.5 text-[11px] text-ink/70">{children}</span>
  );
}

export function PageState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <GlassCard className="px-8 py-14 text-center">
      <div className="mx-auto max-w-[36ch]">
        <h2 className={cn("font-display text-2xl", tone === "error" && "text-clay")}>{title}</h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-ink/60">{description}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </GlassCard>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-mist", className)} />;
}
