// "Was this helpful?" feedback from the governance report. Anonymous: no question text, no names, no IP address.
// A comment passes the same personal-data screen as questions; any sentence with an identifier is removed before saving.
import { detectPII, redactPII } from "./ask.mjs";
import { metricsStore, record } from "../../lib/metrics.mjs";

const OUTCOMES = new Set(["cleared", "pii", "records_request", "content_safety", "topic_control", "output_safety", "output_pii", "crisis", "support", "error"]);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handler(req, deps = {}) {
  if (req.method !== "POST") return json(405, { ok: false });
  let b = {};
  try { b = await req.json(); } catch { return json(400, { ok: false }); }
  if (b.website) return json(200, { ok: true }); // honeypot
  if (typeof b.helpful !== "boolean") return json(400, { ok: false });
  const base = { helpful: b.helpful, outcome: OUTCOMES.has(b.outcome) ? b.outcome : "unknown", lang: b.lang === "es" ? "es" : "en" };
  const store = await metricsStore(deps);
  if (!store) return json(200, { ok: true, stored: false });
  let comment = String(b.comment || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!comment) { await record(store, "feedback", base); return json(200, { ok: true, stored: true }); }
  const found = detectPII(comment);
  let piiRemoved = false;
  if (found.length) { comment = redactPII(comment) || ""; piiRemoved = true; }
  await record(store, "comment", { ...base, comment, pii_removed: piiRemoved, pii_types: found });
  return json(200, { ok: true, stored: true, pii_removed: piiRemoved });
}

export default (req, context) => handler(req, { context });
