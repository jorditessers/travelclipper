// Runs the demo database in a web worker; PGliteWorker elects one tab as leader so several
// open tabs share one database instead of overwriting each other's storage.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { worker } from "@electric-sql/pglite/worker";

void worker({
  async init(options) {
    return PGlite.create({
      ...(options.dataDir ? { dataDir: options.dataDir } : {}),
      // First visit: the page hands over a database that was built and seeded in memory.
      ...(options.loadDataDir ? { loadDataDir: options.loadDataDir } : {}),
      extensions: { pgcrypto },
    });
  },
});
