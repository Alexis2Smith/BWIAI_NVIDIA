// Weekly trigger for the K-12 benchmark: Mondays at 15:00 UTC (10 or 11 in the morning Eastern time).
// Starts benchmark-run-background, which has time to run all 25 cases. Can also be run from the Netlify dashboard.
export default async () => {
  const token = process.env.METRICS_TOKEN, site = process.env.URL;
  if (!token || !site) { console.log("Benchmark skipped: METRICS_TOKEN or URL is not set"); return new Response("skipped"); }
  const r = await fetch(`${site}/.netlify/functions/benchmark-run-background`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  console.log("Benchmark started:", r.status);
  return new Response("started");
};

export const config = { schedule: "0 15 * * 1" };
