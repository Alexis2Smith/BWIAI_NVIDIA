// Anonymous usage metrics for Ask the Institute, kept in Netlify Blobs (store "ask-metrics").
// Privacy rule: never store question text, answer text, names, IP addresses, or any credential.
// Each record holds only: the outcome, which guardrail decided, flagged category names, identifier TYPES
// (for example "ssn", never the number), language, whether voice or the remove-details button was used, and timings.

export const STORE_NAME = "ask-metrics";

export async function metricsStore(deps = {}) {
  if (deps.metricsStore !== undefined) return deps.metricsStore; // tests inject a store, or null to switch off
  if (process.env.METRICS === "off") return null;
  const onNetlify = deps.context || process.env.NETLIFY_BLOBS_CONTEXT || globalThis.netlifyBlobsContext;
  if (!onNetlify) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore(STORE_NAME);
  } catch (e) {
    console.error("Metrics store unavailable:", e?.message || e);
    return null;
  }
}

const rid = () => (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, "").slice(0, 10);

// kind: "ask" | "feedback" | "comment" | "bench"
export async function record(store, kind, data, now = new Date()) {
  if (!store) return false;
  const day = now.toISOString().slice(0, 10);
  const key = `${kind}/${day}/${now.getTime()}-${rid()}`;
  try {
    await store.setJSON(key, { ...data, kind, ts: now.toISOString(), day });
    return true;
  } catch (e) {
    console.error("Metrics write failed:", e?.message || e);
    return false;
  }
}

// Builds the anonymous record for one question from the request flags and the response body.
export function askEvent(reqBody = {}, status = 200, body = {}) {
  let outcome = "cleared";
  if (!body || body.ok === false) outcome = "error";
  else if (body.blocked) outcome = body.blocked; // pii, records_request, content_safety, topic_control, output_safety, output_pii, crisis, support
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const cs = checks.filter((c) => /^content_safety/.test(c.rail));
  const rail = (name) => checks.find((c) => c.rail === name)?.ms;
  const decided = checks.filter((c) => c.decision === "block").map((c) => c.rail)[0] || null;
  return {
    outcome,
    topic: body?.topic || null,
    decided_by: decided,
    categories: [...new Set(cs.flatMap((c) => c.categories || []))],
    pii_types: outcome === "pii" ? (body.categories || []) : [],
    lang: body?.lang || (reqBody.lang === "es" ? "es" : "en"),
    voice: reqBody.voice === true,
    cleaned: reqBody.cleaned === true,
    status,
    ms: typeof body?.ms === "number" ? body.ms : null,
    answer_ms: typeof body?.answer_ms === "number" ? body.answer_ms : null,
    rail_ms: { content_safety_input: rail("content_safety_input") ?? null, topic_control_input: rail("topic_control_input") ?? null, content_safety_output: rail("content_safety_output") ?? null },
    endpoint: cs[0]?.endpoint || null
  };
}

// Reads every record of a kind from the last `days` days (newest first).
export async function readRecent(store, kind, days = 30, now = new Date(), limit = 5000) {
  if (!store) return [];
  const from = new Date(now.getTime() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const { blobs = [] } = await store.list({ prefix: `${kind}/` });
  const keys = blobs.map((b) => b.key).filter((k) => k.split("/")[1] >= from).sort().reverse().slice(0, limit);
  const out = [];
  for (let i = 0; i < keys.length; i += 50) {
    const batch = await Promise.all(keys.slice(i, i + 50).map((k) => store.get(k, { type: "json" }).catch(() => null)));
    out.push(...batch.filter(Boolean));
  }
  return out;
}

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const count = (arr) => arr.reduce((m, k) => (k == null ? m : ((m[k] = (m[k] || 0) + 1), m)), {});
const GROUP = (o) => (o === "cleared" ? "cleared" : o === "records_request" ? "redirected" : o === "crisis" || o === "support" ? "support" : o === "error" ? "error" : "blocked");

export function summarize({ asks = [], feedback = [], comments = [], benches = [] }, days = 30, now = new Date()) {
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10));
  const daily = Object.fromEntries(dayList.map((d) => [d, { cleared: 0, blocked: 0, redirected: 0, support: 0, error: 0 }]));
  for (const a of asks) if (daily[a.day]) daily[a.day][GROUP(a.outcome)]++;
  const groups = count(asks.map((a) => GROUP(a.outcome)));
  const cleared = asks.filter((a) => a.outcome === "cleared");
  const yes = feedback.filter((f) => f.helpful === true).length, no = feedback.filter((f) => f.helpful === false).length;
  return {
    days,
    generated: now.toISOString(),
    totals: {
      questions: asks.length,
      cleared: groups.cleared || 0, blocked: groups.blocked || 0, redirected: groups.redirected || 0, support: groups.support || 0, errors: groups.error || 0,
      spanish: asks.filter((a) => a.lang === "es").length,
      voice: asks.filter((a) => a.voice).length,
      cleaned: asks.filter((a) => a.cleaned).length
    },
    daily: dayList.map((d) => ({ day: d, ...daily[d] })),
    outcomes: count(asks.map((a) => a.outcome)),
    categories: count(asks.flatMap((a) => a.categories || [])),
    pii_types: count(asks.flatMap((a) => a.pii_types || [])),
    support_topics: count(asks.filter((a) => a.topic).map((a) => a.topic)),
    latency: {
      total_p50: pct(cleared.map((a) => a.ms).filter(Number.isFinite), 50),
      total_p95: pct(cleared.map((a) => a.ms).filter(Number.isFinite), 95),
      answer_p50: pct(cleared.map((a) => a.answer_ms).filter(Number.isFinite), 50),
      content_safety_p50: pct(asks.map((a) => a.rail_ms?.content_safety_input).filter(Number.isFinite), 50),
      topic_control_p50: pct(asks.map((a) => a.rail_ms?.topic_control_input).filter(Number.isFinite), 50),
      answer_safety_p50: pct(asks.map((a) => a.rail_ms?.content_safety_output).filter(Number.isFinite), 50)
    },
    feedback: { yes, no, helpful_pct: yes + no ? Math.round((100 * yes) / (yes + no)) : null, by_outcome: count(feedback.map((f) => `${f.outcome || "unknown"}:${f.helpful ? "yes" : "no"}`)) },
    comments: comments.slice(0, 25).map((c) => ({ ts: c.ts, helpful: c.helpful, outcome: c.outcome, lang: c.lang, comment: c.comment, pii_removed: !!c.pii_removed })),
    benchmarks: benches.slice(0, 12).map((b) => ({ ts: b.ts, score: b.score, total: b.total, groups: b.groups, p50: b.p50, p95: b.p95, misses: b.misses, model: b.model }))
  };
}

// Constant-time comparison for the dashboard password.
export function tokenOk(given, expected) {
  if (!expected || typeof given !== "string") return false;
  const a = new TextEncoder().encode(given), b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

export const bearer = (req) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
