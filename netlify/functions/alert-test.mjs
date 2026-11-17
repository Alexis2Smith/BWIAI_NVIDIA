// Scheduled monthly test alert: proves each configured staff-alert channel still works.
// Runs on the 1st of each month at 14:00 UTC (morning in US time zones). It can also be run on demand from the
// Netlify dashboard (Functions > alert-test > Run now). Channels that are not configured are skipped.
import { cfg, alertTarget, sendAlert } from "./ask.mjs";

export async function runTest(c = cfg(), fetchImpl = fetch) {
  const time = new Date().toISOString();
  const results = {};
  for (const channel of ["counselor", "threat"]) {
    const target = alertTarget(c, channel);
    const alert = { event: "test_alert", test: true, channel, category: "Monthly channel test (no action needed)", rail: "scheduled_test", site: c.alertSite, time, reference: "TEST" };
    results[channel] = await sendAlert(target, alert, fetchImpl);
  }
  console.log("Monthly alert test:", JSON.stringify(results));
  return results;
}

export default async () => {
  const results = await runTest();
  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "0 14 1 * *" };
