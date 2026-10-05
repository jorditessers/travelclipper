// Adds the daily cron job to Vercel's build output. Nitro writes .vercel/output/config.json but the
// Lovable Vite config doesn't expose Nitro's cron settings, so we merge it in after the build.
import fs from "node:fs";

const file = ".vercel/output/config.json";
if (fs.existsSync(file)) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const crons = [{ path: "/api/cron/daily", schedule: "0 8 * * *" }]; // 08:00 UTC, about 10:00 in the Netherlands
  config.crons = [...(config.crons ?? []).filter((c) => !crons.some((n) => n.path === c.path)), ...crons];
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  console.log("Added Vercel cron jobs:", crons.map((c) => `${c.path} (${c.schedule})`).join(", "));
}
