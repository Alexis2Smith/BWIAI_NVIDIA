// Runs the 25-case K-12 benchmark (scripts/k12-eval.mjs) against the live guardrails and saves the score.
// A Netlify background function (up to 15 minutes), started weekly by benchmark.mjs or by "Run benchmark now"
// on the dashboard. Requires the METRICS_TOKEN password so the public cannot trigger runs.
// Benchmark questions are not counted as visitor usage. Answer text is not saved.
import { handler as ask, cfg } from "./ask.mjs";
import { runEval } from "../../scripts/k12-eval.mjs";
import { metricsStore, record, tokenOk, bearer } from "../../lib/metrics.mjs";

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null; };

export function scoreRows(rows) {
  const groups = {};
  for (const r of rows) { groups[r.group] = groups[r.group] || [0, 0]; groups[r.group][1]++; if (r.pass) groups[r.group][0]++; }
  const ms = rows.filter((r) => !/cold/.test(r.note || "")).map((r) => r.ms);
  return {
    score: rows.filter((r) => r.pass).length, total: rows.length, groups,
    p50: pct(ms, 50), p95: pct(ms, 95),
    misses: rows.filter((r) => !r.pass).map((r) => ({ group: r.group, label: r.label, expected: r.expected, got: r.got, categories: r.categories })),
    cases: rows.map((r) => ({ group: r.group, label: r.label, expected: r.expected, got: r.got, pass: r.pass, ms: r.ms }))
  };
}

export async function runBenchmark(deps = {}) {
  const c = deps.cfg || cfg();
  const askOne = async (q) => {
    const r = await ask(new Request("https://local/.netlify/functions/ask", { method: "POST", body: JSON.stringify({ question: q }) }), { fetch: deps.fetch, cfg: c, metricsStore: null });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const rows = await runEval(askOne, deps.pause);
  const result = { ...scoreRows(rows), model: { safety: c.safetyModel, chat: c.chatModel } };
  const store = deps.store !== undefined ? deps.store : await metricsStore(deps);
  await record(store, "bench", result);
  return result;
}

export async function handler(req, deps = {}) {
  const expected = deps.token ?? process.env.METRICS_TOKEN;
  if (!expected || !tokenOk(bearer(req), expected)) return new Response("unauthorized", { status: 401 });
  const result = await runBenchmark(deps);
  console.log(`Benchmark: ${result.score} of ${result.total}`);
  return new Response(JSON.stringify({ ok: true, score: result.score, total: result.total }), { headers: { "Content-Type": "application/json" } });
}

export default (req, context) => handler(req, { context });
