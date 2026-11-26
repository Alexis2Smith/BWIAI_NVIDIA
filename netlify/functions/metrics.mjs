// Data for the private dashboard (dashboard.html). Requires the password in the METRICS_TOKEN setting.
import { metricsStore, readRecent, summarize, tokenOk, bearer } from "../../lib/metrics.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handler(req, deps = {}) {
  const expected = deps.token ?? process.env.METRICS_TOKEN;
  if (!expected) return json(503, { ok: false, error: "not_configured" });
  if (!tokenOk(bearer(req), expected)) return json(401, { ok: false, error: "unauthorized" });
  const days = Math.min(90, Math.max(1, parseInt(new URL(req.url).searchParams.get("days") || "30", 10) || 30));
  const store = await metricsStore(deps);
  if (!store) return json(503, { ok: false, error: "store_unavailable" });
  const now = deps.now || new Date();
  const [asks, feedback, comments, benches] = await Promise.all([
    readRecent(store, "ask", days, now), readRecent(store, "feedback", days, now), readRecent(store, "comment", days, now), readRecent(store, "bench", 365, now, 12)
  ]);
  // Ratings come from the Yes/No click; a comment sent afterward is shown but not counted twice.
  return json(200, { ok: true, ...summarize({ asks, feedback, comments, benches }, days, now) });
}

export default (req, context) => handler(req, { context });
