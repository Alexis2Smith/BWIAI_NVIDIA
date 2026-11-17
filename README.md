# BWIAI_NVIDIA: Ask the Institute (Dev Build)

Development environment for **Ask the Institute**, the Ascend AI NOW™ Institute's AI governance assistant, built for the **BWIAI™ NVIDIA Test Kitchen**. This repository is separate from the live site (ascendainow.com) so changes can be tested safely before production.

## Live build and presentation

- **Try the live build:** [ask-the-institute-dev.netlify.app](https://ask-the-institute-dev.netlify.app/)
- **Presentation (PDF, 15 slides):** [Ask the Institute: Privacy-First Guardrails for Ascend K-12 Artificial Intelligence (AI) Governance](docs/Ask-the-Institute-Demo-Deck.pdf), presented to the BWIAI™ NVIDIA Test Kitchen cohort, November 17, 2026

The presentation walks through the work in chronological order: validating the Week 3 combined guardrails notebook on a Brev A100, resolving a GPU runtime error, adapting the design for Ask the Institute, the hosted Content Safety outage and the fallback added in response, and the live results on Netlify.

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

### Crisis response and optional staff alert

When a safety rail flags the **Suicide and Self Harm** category, in a question or in a drafted answer, the person no longer sees the ordinary "please rephrase" message. They see a caring response with crisis resources: the 988 Suicide and Crisis Lifeline (call or text 988), 988 online chat, Crisis Text Line (text HOME to 741741), findahelpline.com for other countries, and emergency services. This is always on.

A district can also connect its own crisis-response channel. The alert is **off until `ALERT_WEBHOOK_URL` is set**.

| Setting | Purpose |
|---|---|
| `ALERT_WEBHOOK_URL` | An https webhook for the district's Teams, Slack, email, or ticketing channel. Non-https addresses are ignored. |
| `ALERT_WEBHOOK_FORMAT` | `teams`, `slack`, or `json` (default `json`). |
| `ALERT_SITE_LABEL` | The school or site name shown in the alert. |

- The alert contains only: event type, category, which rail flagged it, site label, time, and a random reference ID. It never includes the question text, names, IP addresses, or any credential.
- The person sees the crisis resources immediately. On Netlify the alert is sent after the reply, and a failed or slow alert (3 second limit) never changes what the person sees.
- The reference ID is shown to the person and included in the alert, so staff can connect the two if the person later comes forward.
- This site is anonymous, so an alert says that a concern occurred and where, not who. Identifying a user requires district sign-in, with FERPA, consent, and privacy-notice obligations, and alerts should route into the district's existing crisis protocol with a named responder.

### About the PII rail

The hosted `nvidia/gliner-pii` endpoint reached end of life in July 2026, so remote deployments cannot call it. This build uses a pattern-based PII screen as a stand-in. It catches structured identifiers reliably but cannot detect names on their own. For full entity detection, run the GLiNER PII NIM locally on an x86_64 machine (for example, a Brev GPU node) as shown in the Week 3 notebook. GLiNER does not run on Apple Silicon Macs.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Dev test page (marked DEVELOPMENT, not indexed by search engines), with the 4 cohort test scenarios |
| `netlify/functions/ask.mjs` | The guardrails and answering function |
| `netlify/functions/ping.mjs` | Health check: shows whether the NVIDIA key is set (never its value) and which models each rail uses |
| `tests/ask.test.mjs` | 27 automated tests with simulated NVIDIA responses (`npm test`), including the notebook's 4 scenarios, the safety endpoint fallback, and the crisis response and staff alert |
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
