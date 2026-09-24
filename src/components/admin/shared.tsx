import { useState, type ReactElement } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/app/ui-kit";
import { Textarea } from "@/components/ui/textarea";

export function ExcludeDemoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch checked={value} onCheckedChange={onChange} aria-label="Exclude demo data" />
      Exclude demo data
    </label>
  );
}

export const REACH_LABEL: Record<string, string> = { lt_1k: "<1k", "1k_10k": "1k–10k", "10k_50k": "10k–50k", "50k_250k": "50k–250k", "250k_plus": "250k+" };
export const ROLE_TEXT: Record<string, string> = { accommodation_partner: "Accommodation Partner", distribution_partner: "Distribution Partner", admin: "Admin" };
export const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Dialog that asks for a required note (min 3 chars) plus optional extra fields before running an admin change. */
export function NoteDialog({ trigger, title, description, confirmLabel, children, onSubmit, pending, canSubmit = true }: {
  trigger: ReactElement; title: string; description: string; confirmLabel: string;
  children?: React.ReactNode; onSubmit: (note: string) => Promise<unknown>; pending?: boolean; canSubmit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const ok = note.trim().length >= 3 && canSubmit;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setNote(""); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {children}
          <Field label="Note (required)" hint="Stored in the audit log.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!ok || pending} onClick={async () => { try { await onSubmit(note.trim()); setOpen(false); setNote(""); } catch { /* toast handled by caller */ } }}>
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // Spreadsheet formula injection: user-entered text starting with = + - @ must not run as a formula.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
