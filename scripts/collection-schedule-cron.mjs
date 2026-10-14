/** Run with Node >=20 using Windows Task Scheduler, cron, or any job runner.
 * Set WORKSPACE_AUTOMATION_URL (origin) and WORKSPACE_AUTOMATION_CRON_SECRET.
 * This script never writes directly to Postgres; all changes go through CAS. */
const origin = process.env.WORKSPACE_AUTOMATION_URL;
const secret = process.env.WORKSPACE_AUTOMATION_CRON_SECRET;
if (!origin || !secret || secret.length < 32 || !/^https?:\/\//i.test(origin)) {
  console.error("WORKSPACE_AUTOMATION_URL and a >=32-character WORKSPACE_AUTOMATION_CRON_SECRET are required");
  process.exitCode = 1;
} else {
  let cursor = "", scanned = 0, changed = 0;
  try {
    for (let page = 0; page < 10000; page++) {
      const url = new URL("/api/internal/workspace/collection-schedules", origin);
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
        body: JSON.stringify({ cursor, limit: 30 }),
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error("Schedule endpoint HTTP " + response.status);
      const result = await response.json();
      scanned += Number(result.scanned ?? 0);
      changed += Number(result.recordsChanged ?? 0);
      if (!result.nextCursor) break;
      if (result.nextCursor === cursor) throw new Error("Non-advancing schedule cursor");
      cursor = result.nextCursor;
      if (page === 9999) throw new Error("Scheduled batch traversal limit exceeded");
    }
    console.info("Workspace scheduled automations:", { scanned, recordsChanged: changed });
  } catch (error) {
    console.error("Scheduled automation run failed:", error);
    process.exitCode = 1;
  }
}
