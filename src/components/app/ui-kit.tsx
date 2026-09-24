import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Page header ---------- */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-3xl tracking-tight md:text-[40px] md:leading-[1.1]">{title}</h1>
        {description && <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card p-6 shadow-glass-sm", className)}>{children}</div>;
}

/* ---------- Badge ---------- */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground/70",
        moss: "border-moss/30 bg-moss/10 text-moss",
        clay: "border-clay/30 bg-clay/10 text-clay",
        ink: "border-transparent bg-ink text-paper",
        outline: "border-border bg-transparent text-foreground/70",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

/* ---------- KPI card ---------- */
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-glass-sm">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-sage" />}
      </div>
      <p className="mt-3 font-display text-3xl tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed bg-paper/60 px-6 py-14 text-center">
      {Icon && (
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-mist text-moss">
          <Icon className="size-5" />
        </span>
      )}
      <h3 className="mt-4 font-display text-xl">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-[44ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-mist", className)} />;
}

/* ---------- Form controls ---------- */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function NativeSelect({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={cn("field appearance-none pr-8", props.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ChipMultiSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition",
              on ? "border-ink bg-ink text-paper" : "border-border bg-paper/60 text-foreground/70 hover:border-ink/30",
            )}
          >
            {on && <Check className="size-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Table ---------- */
export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty?: ReactNode;
}) {
  return (
    <>
    {/* Mobile: each row as a card (label · value); unlabeled columns render as the card's action footer */}
    <ul className="space-y-3 md:hidden">
      {rows.map((r, i) => {
        const labeled = r.map((cell, j) => ({ cell, label: columns[j] ?? "" }));
        const first = labeled[0];
        const rest = labeled.slice(1).filter((x) => x.label);
        const actions = labeled.slice(1).filter((x) => !x.label);
        return (
          <li key={i} className="rounded-2xl border bg-card p-4">
            {first && <div className="min-w-0">{first.cell}</div>}
            {rest.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {rest.map((x, j) => (
                  <div key={j} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{x.label}</dt>
                    <dd className="mt-0.5 min-w-0 break-words">{x.cell}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions.length > 0 && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">{actions.map((x, j) => <div key={j}>{x.cell}</div>)}</div>}
          </li>
        );
      })}
      {rows.length === 0 && empty && <li className="p-4">{empty}</li>}
    </ul>
    <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-paper">
              {columns.map((c) => (
                <th key={c} className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-mist/40">
                {r.map((cell, j) => (
                  <td key={j} className="px-5 py-3.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && empty && <div className="p-4">{empty}</div>}
    </div>
    </>
  );
}
