import { Link } from "@tanstack/react-router";

/** Required acceptance of the terms and privacy statement (sign-up and first role choice). */
export function LegalCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-[13px] leading-relaxed text-ink/80">
      <input type="checkbox" required className="mt-1 accent-moss" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I accept the{" "}
        <Link to="/terms" target="_blank" className="underline underline-offset-2 hover:text-moss">Terms and Conditions</Link>{" "}
        and have read the{" "}
        <Link to="/privacy" target="_blank" className="underline underline-offset-2 hover:text-moss">Privacy Statement</Link>.
        <span className="block text-[11px] text-ink/50">Both documents are in Dutch. This platform is for business users only.</span>
      </span>
    </label>
  );
}
