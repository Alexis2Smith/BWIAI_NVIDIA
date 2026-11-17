# BWIAI_NVIDIA: Ask the Institute (Dev Build)

Development environment for **Ask the Institute**, the Ascend AI NOW™ Institute's AI governance assistant, built for the **BWIAI™ NVIDIA Test Kitchen**. This repository is separate from the live site (ascendainow.com) so changes can be tested safely before production.

## Live build and presentation

- **Try the live build:** [ask-the-institute-dev.netlify.app](https://ask-the-institute-dev.netlify.app/)
- **Presentation (PDF, 17 slides):** [Ask the Institute: Privacy-First Guardrails for Ascend K-12 Artificial Intelligence (AI) Governance](docs/Ask-the-Institute-Demo-Deck.pdf), presented to the BWIAI™ NVIDIA Test Kitchen cohort, November 17, 2026

The presentation walks through the work in chronological order: validating the Week 3 combined guardrails notebook on a Brev A100, resolving a GPU runtime error, adapting the design for Ask the Institute, the hosted Content Safety outage and the fallback added in response, the live results on Netlify, the crisis-resources response with its optional staff alert, and supportive responses in English and Spanish.

## Guardrails

This build follows the NeMo Guardrails **Combined Guardrails** design taught in Week 3 of the Test Kitchen, applied to an AI governance assistant instead of a healthcare chatbot.

| Order | Rail | How it works |
|---|---|---|
| 1 | PII screen (question) | Pattern check inside the function, before any model sees the text: SSNs, emails, phone numbers, dates of birth, card numbers, street addresses |
| 2 | Content safety (question) | `nvidia/nemotron-3.5-content-safety` with `request_categories: "/categories"` (Aegis S1 to S24 taxonomy) |
| 3 | Topic control (question) | The same model with a `custom_policy` that allows only AI governance and Institute topics |
| — | Answer | `nvidia/nemotron-3.5-lightning-30b-a3b`, thinking turned off, limited to published Institute facts |
| 4 | Content safety (answer) | Question and drafted answer screened together |
| 5 | PII screen (answer) | The answer is checked for personal identifiers |

The first rail to block stops the rest, exactly like the notebook. The system **fails closed**: if any safety call is unavailable or returns an unreadable verdict, no answer is shown. Every response includes a `checks` trace (similar to the notebook's Colang history), and the dev page displays it.

### Safety endpoint and fallback

On November 17, 2026, live testing found that the hosted `nvidia/nemotron-3.5-content-safety` endpoint returned `404 Not Found` for every call, even though the model is listed in the catalog. The function failed closed as designed (users saw the unavailable message, never an unscreened answer). To keep the assistant available during a hosted outage, the safety rails can now use a separate endpoint:

| Setting | Purpose |
|---|---|
| `NVIDIA_SAFETY_BASE_URL` | Where safety calls go first. Default: `NVIDIA_BASE_URL` (NVIDIA hosted). |
| `NVIDIA_SAFETY_FALLBACK_URL` | Tried only if the first safety endpoint errors or returns an unreadable verdict, for example a self-hosted Content Safety NIM. |
| `NVIDIA_SAFETY_API_KEY` | Bearer token for a self-hosted endpoint, if it requires one. |

- The answer model always uses `NVIDIA_BASE_URL` and `NVIDIA_API_KEY`.
- `NVIDIA_API_KEY` is sent only to NVIDIA-hosted addresses (`*.nvidia.com`), never to a self-hosted or fallback address.
- If every configured safety endpoint fails, the system still fails closed.
- Each rail in the `checks` trace reports which endpoint answered: `nvidia_hosted`, `self_hosted`, or `fallback`.
- A fallback must be reachable from Netlify over the public internet. `http://localhost:8123/v1` works only for testing on the Brev node itself. Do not expose a NIM publicly without access control in front of it.

Live test on the Brev node (safety falls back to the local NIM, answers come from NVIDIA hosted):

```
NVIDIA_SAFETY_FALLBACK_URL=http://localhost:8123/v1 node scripts/eval.mjs
```

### Supportive responses, language, and staff alerts

When a safety rail blocks a question, the assistant first asks whether the person may need help. Supportive responses are always on, appear in **English or Spanish** (from the page's language switch, or detected from the question), and use resources verified on November 17, 2026. The content lives in `lib/support.mjs` so a district can review it in one place; review it at least once per school year.

| Concern | What the person sees |
|---|---|
| Suicide or self-harm | 988 (call or text; in Spanish, press 2 or text AYUDA to 988; interpretation in 240+ languages), 988 chat, Crisis Text Line, findahelpline.com, 911 |
| Sextortion or shared images | Take It Down (images taken under 18), NCMEC CyberTipline, 911; "this is not your fault" |
| Abuse or neglect | Childhelp National Child Abuse Hotline, call (800) 422-4453 or text GO to 800.422.4453; 911 |
| Eating disorders | National Alliance for Eating Disorders, (866) 662-1235 (weekday support and referral line, labeled as not a crisis line); 988; 911 |
| Alcohol, vaping, or drugs | SAMHSA National Helpline, 1-800-662-HELP (4357), free, confidential, 24/7, English and Spanish; 911 |
| Bullying or harassment | Trusted adult, StopBullying.gov, 988, 911 |
| Violence or weapons | A firm, neutral refusal (no hotline), plus the optional threat-assessment alert |

A topic applies only when a rail blocks the question, so policy questions such as "How should a district handle bullying?" are answered normally. When several concerns are flagged, crisis takes priority.

**Transparency.** The page tells every user, in English and Spanish, that questions are screened, that support resources appear when someone may be in danger, and that a connected district may notify a counselor or safety team without the question or the person's name.

**Staff alerts are off until a district connects its own channels.**

| Setting | Purpose |
|---|---|
| `ALERT_WEBHOOK_URL` | Counselor channel for suicide and self-harm (Teams, Slack, email, or ticketing). https only. |
| `ALERT_WEBHOOK_FORMAT` | `teams`, `slack`, or `json` (default `json`). |
| `THREAT_ALERT_WEBHOOK_URL` | Separate threat-assessment channel for violence, weapons, and explosives. https only. |
| `THREAT_ALERT_WEBHOOK_FORMAT` | Optional; defaults to `ALERT_WEBHOOK_FORMAT`. |
| `ALERT_SITE_LABEL` | The school or site name shown in alerts. |

- Alerts carry only: event, channel, category, rail, site label, time, and a random reference ID. Never the question text, names, IP addresses, or any credential.
- The person sees the support response immediately. On Netlify, alerts are sent after the reply; a failed or slow alert (3 second limit) never changes what the person sees.
- Repeat alerts from the same browser session and channel within 30 minutes are combined, so staff are not flooded. This is best effort per server instance.
- Threat alerts remind staff to route to the threat-assessment team for human review and not to take disciplinary action on the alert alone. Many students ask about weapons out of curiosity or for schoolwork.
- **Monthly test alert:** `netlify/functions/alert-test.mjs` runs on the 1st of each month at 14:00 UTC and sends a clearly marked TEST message to each configured channel, proving it still works. It can also be run from the Netlify dashboard.
- This site is anonymous, so an alert says that a concern occurred and where, not who. Identifying a user requires district sign-in, with FERPA, COPPA, consent, and privacy-notice obligations. Decisions about notifying parents belong to trained counselors, because in some homes notification could put a student at risk.

### About the PII rail

The hosted `nvidia/gliner-pii` endpoint reached end of life in July 2026, so remote deployments cannot call it. This build uses a pattern-based PII screen as a stand-in. It catches structured identifiers reliably but cannot detect names on their own. For full entity detection, run the GLiNER PII NIM locally on an x86_64 machine (for example, a Brev GPU node) as shown in the Week 3 notebook. GLiNER does not run on Apple Silicon Macs.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Dev test page (marked DEVELOPMENT, not indexed by search engines), with the 4 cohort test scenarios |
| `netlify/functions/ask.mjs` | The guardrails and answering function |
| `netlify/functions/alert-test.mjs` | Scheduled monthly test of each configured alert channel |
| `lib/support.mjs` | Support resources (English and Spanish), topic detection, and language detection |
| `netlify/functions/ping.mjs` | Health check: shows whether the NVIDIA key is set (never its value) and which models each rail uses |
| `tests/ask.test.mjs` | 44 automated tests with simulated NVIDIA responses (`npm test`), including the notebook's 4 scenarios, the safety endpoint fallback, supportive responses in English and Spanish, and both alert channels |
| `scripts/eval.mjs` | Live batch evaluation against the real NVIDIA API (`npm run eval`), like the notebook's Batch Evaluation cell |
| `netlify.toml` | Netlify settings for this dev site |
| `.env.example` | Template for local testing; copy to `.env` (never commit `.env`) |
| `assets/` | Fonts, logo, and Institute styles |

## Set up the dev site on Netlify

1. In Netlify, choose **Add new site > Import an existing project > GitHub** and select `Alexis2Smith/BWIAI_NVIDIA`. Leave the build command blank and set the publish directory to `.`.
2. In **Site configuration > Environment variables**, add `NVIDIA_API_KEY` (from build.nvidia.com > API Keys).
3. Deploy, then open `https://<your-dev-site>.netlify.app/.netlify/functions/ping` and confirm `"NVIDIA_API_KEY": true`.
4. Click each cohort test scenario on the dev page and confirm the expected rail blocks it.

Optional settings, changeable without code: `NVIDIA_SAFETY_MODEL`, `NVIDIA_CHAT_MODEL`, and `TOPIC_CONTROL=off` (comparison testing only).

## Test

```
npm test                                   # simulated, no API key needed
NVIDIA_API_KEY="nvapi-..." npm run eval     # live, against NVIDIA hosted models
```

Expected live result:

```
Scenario           Expected               Result
Safe (on-topic)    None, model answers    answered
Content Safety     content_safety         content_safety
Topic Control      topic_control          topic_control
PII in Input       pii                    pii
```

## Promote to production

When the dev site passes testing, copy `netlify/functions/ask.mjs` into the live site's `netlify/functions/` folder and redeploy. The live Institute page already contains the Ask the Institute section and will show the new block messages automatically.

---
© 2026 Ascend AI NOW, LLC. Built by Dr. Alexis S. Smith.
