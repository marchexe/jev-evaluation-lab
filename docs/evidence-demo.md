# Evidence demo: source to review to recorded judgment

This demonstration uses synthetic documents and four existing recorded Jev runs.
It makes no paid requests. It demonstrates a review process, not legal compliance
or measured superiority of Graph Search.

## Prepare

Use Node.js 24.x. From the repository root:

```powershell
node --import tsx --import ./test-support/offline.js scripts/prepare-evidence-demo.ts --output results/evidence-demo/recorded-runs.json
npm.cmd run dev
```

Choose a new output filename if it already exists. The command never overwrites a
file, loads credentials or creates an SDK client. Keep web inference disabled.
Open the address printed by Next.js. Use the same address for browser-local reviews.

The packet reuses study recordings `01-1`, `03-1`, `11-1` and `15-1`: policy,
automatic execution, queue countersignature and the current register's gate rule.
Every SDK request, response, model, probability, usage count, timestamp, request ID
and latency is unchanged. The Explorer envelope and run IDs are new; the local
application profile changes from `evidence-study` to `evidence`. Each result's
`recordingSource` documents this normalization. The envelope is not byte-for-byte
the original study file. No human labels are supplied.

## Seven-minute walkthrough

1. Open **Belege / Evidence**. Select **Menschliche Aufsicht / Human oversight**
   and system **dispatch**. State the question: does the documentation establish
   human approval before each action?
2. Click **Quellen finden / Find sources**. Select the policy. Open
   **Meine Bewertung / My review**. Save a personal evidence judgment and
   a separate retrieval-relevance review. These demo labels are not independently
   confirmed benchmark labels.
3. Select the runbook. It describes automatic execution without approval. Keep
   the conflict visible; do not assume which document governs this deployment.
4. In Graph Search select the queue procedure. Open **Suchpfad / Search path**.
   Inspect the five-hop alias/reference path. The default experimental diversity
   ranking places it fifth; the original ranking places it seventh.
   Depth four does not reach it from the control path. This example depends on
   curated relationships and does not prove general retrieval superiority.
5. Open **Jev-Bewertung / Jev review**, then
   **Gespeicherte Läufe / Import or manage saved runs**. Import the prepared JSON.
   Do not press the live judgment button. Say explicitly: these are recorded
   responses, not new inference. They are historical single-passage judgments.
6. Select the policy, runbook, queue and current register gate rule in turn. Read
   their recorded judgments and probabilities. New corpus selections now use the
   same workflow as original cases. Do not resolve document authority from a
   single-passage model answer.
7. Open **Auswertung / Evaluate → Belegexperimente / Evidence experiments**.
   Show reviewed sample sizes and excluded labels. Missing fixed-case predictions
   and additional passages have separate counts. Export the experiment, then
   import it again. Identical run IDs are idempotent; conflicting reviews are
   rejected. Do not clear existing reviews to force an import.

## Next independent experiment

Give a reviewer the [pilot packet](../examples/evidence/pilot-review/README.md)
before showing rankings or predictions. It contains 24 blank judgments. Freeze
search settings and evaluation rules separately before producing measured results.
Do not overwrite the original frozen experiment or treat this demo as validation.
