import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getDemoStatus, isLocalDemo, onDemoStatus, type DemoStatus } from "@/integrations/demo-backend/mode";

/** Browser demo only: a small notice while the local database starts (first visit takes a few seconds). */
export function DemoBackendStatus() {
  const [s, setS] = useState<DemoStatus>({ state: "idle" });
  useEffect(() => {
    if (!isLocalDemo()) return;
    setS(getDemoStatus());
    return onDemoStatus(setS);
  }, []);
  if (s.state !== "preparing" && s.state !== "error") return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card px-5 py-2.5 text-sm shadow-glass-sm">
      {s.state === "preparing" ? (
        <>
          <Loader2 className="size-4 animate-spin text-moss" />
          <span>{s.step ?? "Preparing the demo"}…</span>
        </>
      ) : (
        <>
          <span className="text-clay">The demo couldn't start in this browser.</span>
          <button type="button" className="underline underline-offset-2" onClick={() => window.location.reload()}>Try again</button>
        </>
      )}
    </div>
  );
}
