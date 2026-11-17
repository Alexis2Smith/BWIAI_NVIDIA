// GET /.netlify/functions/ping  Health check: confirms functions deployed and which settings are present (never their values).
import { cfg, isNvidiaHost } from "./ask.mjs";
export default () => {
  const c = cfg();
  const where = (u) => (!u ? "not set" : isNvidiaHost(u) ? "nvidia_hosted" : "self_hosted");
  return new Response(JSON.stringify({
    ok: true,
    environment: "dev",
    settings: {
      NVIDIA_API_KEY: Boolean(c.key),
      NVIDIA_SAFETY_BASE_URL: where(c.safetyBase),
      NVIDIA_SAFETY_FALLBACK_URL: where(c.safetyFallback),
      NVIDIA_SAFETY_API_KEY: Boolean(c.safetyKey),
      ALERT_WEBHOOK_URL: c.alertUrl ? "on" : "off",
      ALERT_WEBHOOK_FORMAT: c.alertFormat,
      ALERT_SITE_LABEL: c.alertSite,
      THREAT_ALERT_WEBHOOK_URL: c.threatAlertUrl ? "on" : "off",
      THREAT_ALERT_WEBHOOK_FORMAT: c.threatAlertFormat || c.alertFormat
    },
    support_responses: "on: crisis, sextortion, abuse, eating, substance, bullying (English and Spanish)",
    monthly_test_alert: "scheduled 1st of each month, 14:00 UTC (skips channels that are off)",
    rails: { pii_input: "pattern screen", content_safety: c.safetyModel, topic_control: c.topicControl ? c.safetyModel + " (custom_policy)" : "off", output_safety: c.safetyModel, pii_output: "pattern screen" },
    chat_model: c.chatModel
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};
