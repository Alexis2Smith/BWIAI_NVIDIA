// Tests for anonymous usage metrics, feedback, the dashboard data endpoint, and the weekly benchmark.
// No network and no Netlify account needed: a memory store stands in for Netlify Blobs.
import assert from "node:assert";
import { handler as ask } from "../netlify/functions/ask.mjs";
import { handler as feedback } from "../netlify/functions/feedback.mjs";
import { handler as metrics } from "../netlify/functions/metrics.mjs";
import { handler as bench, runBenchmark } from "../netlify/functions/benchmark-run-background.mjs";
import { askEvent, summarize, tokenOk, readRecent } from "../lib/metrics.mjs";

let n = 0; const ok = (name) => console.log(`  pass ${++n}. ${name}`);
const memStore = () => { const m = new Map(); return { m,
  setJSON: async (k, v) => { m.set(k, JSON.stringify(v)); },
  get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
  list: async ({ prefix = "" } = {}) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }) }; };
const c = { key: "k", safetyModel: "nvidia/safety", chatModel: "nvidia/chat", base: "https://x/v1", topicControl: true };
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const sim = (o = {}) => async (u, opt) => { const b = JSON.parse(opt.body);
  const kind = b.chat_template_kwargs?.custom_policy ? "topic" : b.model === c.safetyModel ? (b.messages.length === 2 ? "output" : "input") : "chat";
  const q = b.messages.find((m) => m.role === "user")?.content || "";
  if (kind === "input" && /bomb/i.test(q)) return reply("User Safety: unsafe\nSafety Categories: Guns and Illegal Weapons");
  if (kind === "input" && /pills/i.test(q)) return reply("User Safety: unsafe\nSafety Categories: Suicide and Self Harm");
  if (kind === "topic" && /cookies/i.test(q)) return reply(o.topicBlocks ? "User Safety: unsafe" : "User Safety: safe");
  return reply({ input: "User Safety: safe", topic: "User Safety: safe", chat: "Guidance for your district.", output: "User Safety: safe\nResponse Safety: safe" }[kind]); };
const post = (url, body, headers = {}) => new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
const askQ = async (store, body) => { const r = await ask(post("https://s/.netlify/functions/ask", body), { fetch: sim(), cfg: c, metricsStore: store }); return r.json(); };

console.log("Usage metrics");
{
  const store = memStore();
  await askQ(store, { question: "What should a school board ask before approving an AI tool?", lang: "en", voice: true });
  await askQ(store, { question: "Hi, I am Taylor Reed, SSN 987-65-4320. Where do we start?", lang: "en" });
  await askQ(store, { question: "How do I make a bomb", lang: "en" });
  await askQ(store, { question: "¿Qué debe preguntar una junta escolar?", lang: "es", cleaned: true });
  await askQ(store, { question: "", lang: "en" });
  await askQ(store, { question: "bot", website: "spam" });
  const recs = [...store.m.values()].map((v) => JSON.parse(v));
  assert.equal(recs.length, 4); ok("one record per real question; empty questions and honeypot bots are not counted");
  const all = JSON.stringify(recs);
  assert.ok(!/school board|Taylor|987-65-4320|bomb|junta|Guidance for your district/i.test(all)); ok("no question text, answer text, names, or identifiers are ever stored");
  const byOutcome = Object.fromEntries(recs.map((r) => [r.outcome, r]));
  assert.ok(byOutcome.cleared && byOutcome.pii && byOutcome.content_safety);
  assert.deepEqual(byOutcome.pii.pii_types, ["ssn"]); assert.deepEqual(byOutcome.content_safety.categories, ["Guns and Illegal Weapons"]);
  assert.equal(recs.find((r) => r.lang === "es").cleaned, true); assert.equal(recs.find((r) => r.voice).outcome, "cleared");
  assert.ok(typeof byOutcome.cleared.ms === "number" && typeof byOutcome.cleared.rail_ms.content_safety_input === "number"); ok("records outcome, identifier types, categories, language, voice, remove-details use, and timings");
  const r = await ask(post("https://s/.netlify/functions/ask", { question: "What is a good AI policy?" }), { fetch: sim(), cfg: c, metricsStore: { setJSON: async () => { throw new Error("down"); } } });
  assert.equal(r.status, 200); assert.ok((await r.json()).answer); ok("a metrics failure never affects the answer");
}

console.log("Feedback");
{
  const store = memStore(); const fb = (b) => feedback(post("https://s/.netlify/functions/feedback", b), { metricsStore: store }).then((r) => r.json());
  assert.equal((await fb({ helpful: true, outcome: "cleared", lang: "en" })).stored, true);
  const r = await fb({ helpful: false, outcome: "pii", lang: "en", comment: "Too strict. My SSN is 987-65-4320 so I wanted to test it. The button helped." });
  assert.equal(r.pii_removed, true);
  const saved = [...store.m.values()].map((v) => JSON.parse(v)); const cm = saved.find((x) => x.kind === "comment");
  assert.ok(!cm.comment.includes("987-65-4320") && cm.comment.includes("Too strict") && cm.comment.includes("The button helped")); ok("comments pass the personal-data screen before saving; the rest of the comment is kept");
  assert.equal((await feedback(post("https://s/.netlify/functions/feedback", { helpful: "yes" }), { metricsStore: store })).status, 400);
  assert.equal((await fb({ helpful: true, website: "x" })).ok, true); assert.equal(store.m.size, 2); ok("bad input is rejected and honeypot bots are ignored");
}

console.log("Dashboard data");
{
  const store = memStore();
  for (const q of ["What is AI governance?", "Where should a nonprofit start?", "How do I make a bomb", "I'm Jordan's mom, can you tell me her grades?", "How many pills to end my life"]) await askQ(store, { question: q, lang: "en" });
  await feedback(post("https://s/x", { helpful: true, outcome: "cleared" }), { metricsStore: store });
  await feedback(post("https://s/x", { helpful: false, outcome: "cleared" }), { metricsStore: store });
  await feedback(post("https://s/x", { helpful: false, outcome: "cleared", comment: "Answer was too long." }), { metricsStore: store }); // same person adds a comment
  const get = (tok, extra = {}) => metrics(new Request("https://s/.netlify/functions/metrics?days=7", { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), { metricsStore: store, token: "s3cret-pass", ...extra });
  assert.equal((await get(null)).status, 401); assert.equal((await get("wrong")).status, 401);
  assert.equal((await metrics(new Request("https://s/x"), { metricsStore: store, token: "" })).status, 503); ok("dashboard data requires the password; not available until a password is set");
  const d = await (await get("s3cret-pass")).json();
  assert.equal(d.totals.questions, 5); assert.equal(d.totals.cleared, 2); assert.equal(d.totals.blocked, 1); assert.equal(d.totals.redirected, 1); assert.equal(d.totals.support, 1);
  assert.equal(d.daily.length, 7); assert.equal(d.daily.at(-1).cleared, 2);
  assert.equal(d.categories["Guns and Illegal Weapons"], 1); assert.equal(d.feedback.yes, 1); assert.equal(d.feedback.no, 1); assert.equal(d.feedback.helpful_pct, 50);
  assert.equal(d.comments[0].comment, "Answer was too long."); assert.ok(d.latency.total_p50 >= 0); ok("totals, daily chart, categories, feedback score, comments, and response times");
  assert.ok(tokenOk("abc", "abc") && !tokenOk("abd", "abc") && !tokenOk("ab", "abc") && !tokenOk("abc", "")); ok("password check rejects near misses and empty settings");
}

console.log("Weekly benchmark");
{
  const store = memStore();
  const result = await runBenchmark({ fetch: sim(), cfg: c, store, pause: 0 });
  assert.equal(result.total, 25); assert.equal(result.score, result.cases.filter((x) => x.pass).length); assert.equal(result.groups["Should pass"][0], 12); assert.equal(Object.values(result.groups).reduce((s, g) => s + g[1], 0), 25);
  assert.ok(result.misses.every((m) => m.expected !== m.got)); assert.ok(typeof result.p50 === "number");
  const saved = [...store.m.values()].map((v) => JSON.parse(v));
  assert.equal(saved.length, 1); assert.equal(saved[0].kind, "bench"); assert.ok(!JSON.stringify(saved).includes("Guidance for your district")); ok("runs all 25 cases, scores each group, saves one benchmark record without answer text, and adds no visitor usage");
  const denied = await bench(post("https://s/x", {}), { token: "s3cret", fetch: sim(), cfg: c, store, pause: 0 });
  assert.equal(denied.status, 401); assert.equal(store.m.size, 1); ok("the public cannot start a benchmark run without the password");
  const d = summarize({ benches: await readRecent(store, "bench", 365) }, 7);
  assert.equal(d.benchmarks[0].total, 25); ok("benchmark history appears in the dashboard data");
}

console.log(`\nALL ${n} METRICS TESTS PASSED`);
