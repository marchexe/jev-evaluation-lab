# Jev Evaluation Lab

An experimental developer workspace for inspecting structured Jev assessments and
recording human evaluations. This is an independent project, not an official
TypeSafe product. It assesses documentation about intended use,
personal data, human oversight, and description completeness. It makes no legal
compliance or high-risk determinations.

## Features

- **Assess:** 15 synthetic examples and five governance questions, with native
  Choice, Noul, and Score results, probabilities, actual model IDs, usage, and latency.
- **Compare:** two saved assessments side by side; prediction, probability, Score,
  Noul, and performance differences. Entirely offline; deltas are B minus A.
  Missing values stay missing, and changed question definitions are flagged.
- **Evaluate:** editable field reviews, explicit sample sizes, descriptive reviewer
  agreement/error statistics, and JSON export with reviews separate from Jev data.
- **History:** browser-local persistence, original JSON exports, and compatible
  older assessments and overall feedback. Raw response numbers remain untouched.

## Stack

Next.js App Router, React, assistant-ui external-store runtime, and the installed
[TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript) 0.7.0.
The API uses the Node.js runtime; there is no LLM or RAG layer.

SDK integration and questions live in `src/assessment.js`, `src/questions.js`, and
`src/governance.js`. `src/ui/` contains offline comparison, review, evaluation, and
persistence functions; `components/` contains the assistant-ui workspace.

## Quick start

Use **Node.js 24.x**. In Windows PowerShell:

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

Open **http://127.0.0.1:3000** (localhost also works). Saved assessments, comparisons,
reviews, and exports require no API key. Live web inference is disabled by default.

## Configuration

Keep secrets in the ignored `.env` or server environment; never use a
`NEXT_PUBLIC_` variable for the key.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Empty | Server-only key; required only for live inference. |
| `TYPESAFE_DEFAULT_MODEL` | `jev-latest` | Requested model alias; the actual returned model is recorded. |
| `JEV_LIVE_INFERENCE_ENABLED` | `false` | Web inference requires the exact value `true` and a server restart/redeployment. |

These are the only settings needed locally or for a normal Vercel deployment.
Enable paid inference only intentionally; protect hosted access first. Selecting
examples, changing views, reviewing, and exporting never make Jev requests.
**Analyze with Jev** makes one request with no automatic retries. Cancelling may
still incur usage if the provider has processed the request.

The CLI preserves its separate explicit `--live` opt-in; the web switch does not
control it. Preview commands make no API calls:

```powershell
npm.cmd run classify
npm.cmd run classify -- --profile governance --case hr-recruitment-reviewed
```

For intentional paid CLI execution, append `--live`. Use `--input description.txt`
and `--output results/custom.json` as needed. Default technical and governance outputs
are `results/classification.json` and `results/governance-assessment.json`.

## Evaluation workflow

1. Assess a description, then inspect typed results and technical details. Choice
   selects a category with probabilities; Noul reports a statement probability;
   Score reports a fractional rubric position with level probabilities.
2. Save a field review as Correct, Incorrect, or Uncertain, with an optional short
   comment. Supply an expected recorded Choice category or Score level 0–3 when
   appropriate. Noul reviews are qualitative, with no invented numeric target.
   Reviews can be edited or cleared without modifying the original assessment.
3. Compare any two saved assessments, or open Evaluate to inspect reviewed cases
   and export assessments together with their reviews.

**Statistics are descriptive, not validated model accuracy or calibration.**
Choice agreement counts exact matches among reviewed Choice fields with explicit
expected labels. Score mean absolute error uses the original fractional Score
against explicit expected levels. Fields without targets are excluded and counted
separately; Uncertain reviews with explicit targets are included. Judgment counts
are shown per field. Latency/token statistics use only assessments with field
reviews and reported metadata. Every metric exposes its sample size; empty samples
are unavailable, never zero. Overall feedback alone does not count as field review.
Cases and model versions are pooled; reviewer labels can be wrong.

History uses browser `localStorage` at `jev.assessments.v1`, capped at 100
assessments without silent eviction. Older records without field reviews remain
valid. It is not cloud storage or a backup and does not sync across browsers or
origins (including localhost and 127.0.0.1). Export before clearing or moving domains.
Single-assessment export preserves the backend envelope; history/review exports
use an outer `schemaVersion: 2` wrapper with unchanged embedded assessments.

## Vercel deployment

The owner publishes to GitHub and deploys manually.

Initialize the public repository from the clean source copy, keeping private
development history separate. Use `Initial commit` as the first commit message.

1. Import the repository using the Next.js preset and repository root. Use
   `npm ci` to install and `npm run build` to build; keep default output settings.
   Select [Node.js 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
   matching `package.json`. The SDK stays server-side in the Node API route.
2. Start with `JEV_LIVE_INFERENCE_ENABLED=false`. Add the private server key
   only where live inference will be enabled; the model setting is optional.
   Normal Vercel deployments need no custom origins or proxy settings.
3. Configure hosting access protection for **both the UI and /api/assess**, across
   production, preview, generated, and custom domains. Check the actual scope:
   [Standard Protection excludes production domains](https://vercel.com/docs/deployment-protection).
   Authentication belongs to the hosting provider, outside this application.
4. Check saved-data views and API origin rejection on the deployment. Enable live
   inference only after confirming protection and provider budgets. Environment
   changes require redeployment. No paid deployment check runs automatically.

### Optional: custom reverse proxy

Leave these unset locally and on normal Vercel deployments. Retained for an
operator-controlled proxy whose internal request URL/Host differs from its public
origin, these settings require **both** an exact allowlist and explicit trust:

```dotenv
JEV_ALLOWED_ORIGINS=https://lab.example.com
JEV_TRUST_PROXY_HEADERS=true
```

Origins are comma-separated, with no paths, trailing slashes, or wildcards; the
allowlist also restricts direct browser requests when set. The edge must overwrite
forwarded headers. The guard requires matching allowed Origin, forwarded host,
and protocol; forwarded headers alone cannot authorize a request.
[Vercel documents Host and forwarded headers](https://vercel.com/docs/headers/request-headers).

## Security and limitations

- The origin guard checks exact scheme, host, and port, with a narrow correction
  for Next.js loopback normalization. Cross-origin and cross-site browser requests
  are rejected. Originless JSON clients remain supported: CSRF protection is not
  authentication or a spend limit. The API bounds descriptions to 12,000 characters
  and bodies to 64,000 bytes, with a 30-second SDK timeout and retries disabled.
- Public inference can spend the owner's balance. Use hosting access controls and
  provider budgets/quotas. This app has no reliable distributed rate limiter.
- Missing, unclear, contradictory, and explicitly negative evidence stay distinct.
  Model probabilities and human reviews are not verified facts or legal findings.
- Descriptions and comments can contain sensitive information. Protect browser
  storage and exports. `.env`, results, build output, and browser artifacts are ignored.
- Project metadata is `UNLICENSED`; no open-source license is granted.
  [`private: true` prevents npm publication](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private),
  independently of GitHub visibility. The bundled TypeSafe skill's MIT notice is retained. Dependencies keep
  their own licenses, including LGPL libvips binaries and CC-BY caniuse data.
  Examples are synthetic and there are no bundled company logos or image assets.
  Third-party names identify integrations; no trademark permission or affiliation
  is implied.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
# First-time browser setup only if Chromium is missing:
npx.cmd playwright install chromium
npm.cmd run test:browser
# Review the production build locally:
npm.cmd start
```

Unit tests disable fetch. Browser tests run production builds on ports 3197/3198,
block TypeSafe network requests, and replay a labeled real Jev recording for UI
checks. Arithmetic tests perturb copies to verify differences and statistics;
these are not classifier responses or ground-truth labels. No paid Jev calls run
automatically during tests or builds. An actual protected Vercel deployment and
intentional live inference remain manual owner checks.

The recording's local application `profile` metadata is normalized to `governance`.
Its SDK response, model results, probabilities, and usage are unchanged; the full
application envelope is not claimed to be byte-for-byte original. See
[fixture provenance](test/fixtures/README.md).
