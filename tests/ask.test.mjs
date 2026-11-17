// Automated tests with simulated NVIDIA responses (no API key needed): npm test
// Mirrors the 4 scenarios in the NeMo Guardrails "Combined Guardrails" notebook, plus output and outage cases.
import assert from "node:assert";
import { handler, parseSafety, detectPII } from "../netlify/functions/ask.mjs";

const c = { key: "k", safetyModel: "nvidia/nemotron-3.5-content-safety", chatModel: "nvidia/nemotron-3.5-lightning-30b-a3b", base: "https://x/v1", topicControl: true };
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

// Simulated NVIDIA: answers depend on which rail is calling
function sim({ input = "User Safety: safe", topic = "User Safety: safe", answer = "Here is guidance on AI governance.", output = "User Safety: safe\nResponse Safety: safe", fail = null } = {}) {
  const calls = [];
  const fetch = async (u, o) => {
    const b = JSON.parse(o.body);
    const kind = b.chat_template_kwargs?.custom_policy ? "topic"
      : b.model === c.safetyModel ? (b.messages.length === 2 ? "output" : "input") : "chat";
    calls.push({ kind, body: b });
    if (fail === kind) return new Response("down", { status: 500 });
    return reply({ input, topic, chat: answer, output }[kind]);
  };
  return { calls, fetch };
}
const ask = async (q, s, cfg = c) => {
  const r = await handler(new Request("https://s/.netlify/functions/ask", { method: "POST", body: JSON.stringify({ question: q }) }), { fetch: s.fetch, cfg });
  return { status: r.status, body: await r.json() };
};
const kinds = (s) => s.calls.map((x) => x.kind).join(",");
let n = 0; const ok = (name) => console.log(`  pass ${++n}. ${name}`);

console.log("Unit checks");
assert.deepEqual(parseSafety("User Safety: safe\nResponse Safety: safe"), { user: "safe", response: "safe", categories: [] });
assert.deepEqual(parseSafety('{"User Safety":"unsafe","Safety Categories":"Violence, Hate"}').categories, ["Violence", "Hate"]);
assert.equal(parseSafety("hello"), null); ok("safety verdict parser (text, JSON, unreadable)");
assert.deepEqual(detectPII("SSN 123-45-6789"), ["ssn"]);
assert.ok(detectPII("email me at someone@example.org").includes("email"));
assert.deepEqual(detectPII("write to assessments@ascendainow.com"), []);
assert.ok(detectPII("call 919-555-0142").includes("phone_number"));
assert.ok(detectPII("DOB 01/15/1980").includes("date_of_birth"));
assert.ok(detectPII("card 4111 1111 1111 1111").includes("card_number"));
assert.deepEqual(detectPII("What should a board ask about AI risk in 2026?"), []); ok("PII patterns (and no false alarm on a normal question)");

console.log("Notebook scenarios");
// Scenario 1: safe, on-topic: all rails pass, 4 model calls like the notebook
let s = sim(), r = await ask("What should a school board ask before approving an AI tool?", s);
assert.equal(r.body.ok, true); assert.equal(r.body.blocked, undefined); assert.equal(r.body.answer, "Here is guidance on AI governance.");
assert.equal(kinds(s), "input,topic,chat,output");
assert.equal(s.calls[0].body.chat_template_kwargs.request_categories, "/categories");
assert.equal(s.calls[0].body.chat_template_kwargs.enable_thinking, false);
assert.equal(s.calls[2].body.model, "nvidia/nemotron-3.5-lightning-30b-a3b");
assert.equal(s.calls[2].body.chat_template_kwargs.enable_thinking, false);
assert.equal(r.body.checks.length, 5); ok("Scenario 1: safe, on-topic question passes all 5 rails");

// Scenario 2: content safety violation: blocked at input, 1 call, main model never called
s = sim({ input: "User Safety: unsafe\nSafety Categories: Suicide and Self Harm" });
r = await ask("[harmful request]", s);
assert.equal(r.body.blocked, "content_safety"); assert.deepEqual(r.body.categories, ["Suicide and Self Harm"]);
assert.equal(kinds(s), "input"); ok("Scenario 2: content safety blocks before the main model");

// Scenario 3: off-topic: content safety passes, topic control blocks, 2 calls
s = sim({ topic: "User Safety: unsafe" });
r = await ask("What's your favorite recipe for chocolate chip cookies?", s);
assert.equal(r.body.blocked, "topic_control"); assert.equal(kinds(s), "input,topic"); ok("Scenario 3: topic control blocks an off-topic question");

// Scenario 4: PII in input: blocked first, NO model calls (fictional identity)
s = sim();
r = await ask("Hi, I'm Taylor Reed, DOB 03/22/1985, SSN 987-65-4320. Where should our district start with AI governance?", s);
assert.equal(r.body.blocked, "pii"); assert.ok(r.body.categories.includes("ssn")); assert.ok(r.body.categories.includes("date_of_birth"));
assert.equal(s.calls.length, 0); ok("Scenario 4: PII blocked before any model sees it");

console.log("Output and failure cases");
s = sim({ output: "User Safety: safe\nResponse Safety: unsafe\nSafety Categories: Hate" });
r = await ask("q about governance", s); assert.equal(r.body.blocked, "output_safety");
assert.ok(!JSON.stringify(r.body).includes("Here is guidance")); ok("unsafe answer is never shown");

s = sim({ answer: "Contact the board chair at chair@district.org or 919-555-0142." });
r = await ask("q about governance", s); assert.equal(r.body.blocked, "output_pii"); ok("answer containing PII is never shown");

s = sim({ answer: "Email assessments@ascendainow.com for details." });
r = await ask("q about governance", s); assert.equal(r.body.blocked, undefined); ok("Institute's own email is allowed in answers");

s = sim({ topic: "User Safety: unsafe" });
r = await ask("cookies?", s, { ...c, topicControl: false }); assert.equal(r.body.blocked, undefined); assert.equal(kinds(s), "input,chat,output"); ok("TOPIC_CONTROL=off skips the topic rail");

for (const k of ["input", "topic", "chat", "output"]) {
  s = sim({ fail: k }); r = await ask("q", s); assert.equal(r.status, 502);
}
s = sim({ input: "???" }); r = await ask("q", s); assert.equal(r.status, 502); ok("fails closed on outage or unreadable verdict (every stage)");

assert.equal((await ask("q", sim(), { ...c, key: "" })).status, 503);
assert.equal((await ask("   ", sim())).status, 400);
assert.equal((await ask("a".repeat(601), sim())).status, 400); ok("missing key, empty and too-long questions handled");

console.log("Safety endpoint settings");
{
  const { cfg, isNvidiaHost } = await import("../netlify/functions/ask.mjs");
  const HOSTED = "https://integrate.api.nvidia.com/v1", SELF = "https://cs.example-node.net/v1";
  // URL-aware simulator: the hosted safety endpoint can be made to 404
  const route = ({ hostedSafetyDown = false, selfDown = false } = {}) => {
    const calls = [];
    const fetch = async (u, o) => {
      const b = JSON.parse(o.body);
      const isSafety = b.model === "nvidia/nemotron-3.5-content-safety";
      calls.push({ url: u, auth: o.headers.Authorization || null, safety: isSafety, topic: !!b.chat_template_kwargs?.custom_policy });
      if (isSafety && u.startsWith(HOSTED) && hostedSafetyDown) return new Response('{"status":404}', { status: 404 });
      if (isSafety && u.startsWith(SELF) && selfDown) return new Response("down", { status: 503 });
      if (!isSafety) return reply("Here is guidance on AI governance.");
      return reply(b.messages.length === 2 ? "User Safety: safe\nResponse Safety: safe" : "User Safety: safe");
    };
    return { calls, fetch };
  };
  const run = async (cfgv, s) => {
    const r = await handler(new Request("https://s/ask", { method: "POST", body: JSON.stringify({ question: "How should a district govern AI?" }) }), { fetch: s.fetch, cfg: cfgv });
    return { status: r.status, body: await r.json() };
  };

  const d = cfg({ NVIDIA_API_KEY: "nvapi-test" });
  assert.equal(d.safetyBase, HOSTED); assert.equal(d.safetyFallback, ""); ok("defaults unchanged: safety calls use NVIDIA hosted");
  assert.ok(isNvidiaHost(HOSTED)); assert.ok(!isNvidiaHost(SELF)); assert.ok(!isNvidiaHost("https://nvidia.com.evil.net/v1")); ok("NVIDIA host check rejects look-alike domains");

  let s = route({ hostedSafetyDown: true });
  let r = await run(cfg({ NVIDIA_API_KEY: "nvapi-test", NVIDIA_SAFETY_FALLBACK_URL: SELF }), s);
  assert.equal(r.status, 200); assert.equal(r.body.answer, "Here is guidance on AI governance.");
  assert.ok(r.body.checks.filter((x) => x.endpoint).every((x) => x.endpoint === "fallback"));
  assert.ok(s.calls.filter((x) => !x.safety).every((x) => x.url.startsWith(HOSTED))); ok("hosted safety 404 falls back to the self-hosted NIM; answer still from hosted Lightning");

  assert.ok(s.calls.filter((x) => x.url.startsWith(SELF)).every((x) => x.auth === null));
  assert.ok(s.calls.filter((x) => x.url.startsWith(HOSTED)).every((x) => x.auth === "Bearer nvapi-test")); ok("NVIDIA_API_KEY is never sent to a non-NVIDIA address");

  s = route();
  r = await run(cfg({ NVIDIA_API_KEY: "nvapi-test", NVIDIA_SAFETY_BASE_URL: SELF + "/", NVIDIA_SAFETY_API_KEY: "self-token" }), s);
  assert.equal(r.status, 200);
  assert.ok(s.calls.filter((x) => x.safety).every((x) => x.url.startsWith(SELF) && x.auth === "Bearer self-token"));
  assert.ok(r.body.checks.filter((x) => x.endpoint).every((x) => x.endpoint === "self_hosted")); ok("NVIDIA_SAFETY_BASE_URL sends safety calls straight to the self-hosted NIM with its own token");

  s = route({ hostedSafetyDown: true, selfDown: true });
  r = await run(cfg({ NVIDIA_API_KEY: "nvapi-test", NVIDIA_SAFETY_FALLBACK_URL: SELF }), s);
  assert.equal(r.status, 502); assert.equal(s.calls.filter((x) => !x.safety).length, 0); ok("both safety endpoints down: fails closed, answer model never called");
}

console.log(`\nALL ${n} TESTS PASSED`);
