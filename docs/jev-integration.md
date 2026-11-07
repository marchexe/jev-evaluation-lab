# Jev integration and question configuration

The installed `@typesafe-ai/sdk` is 0.7.0. The transport calls `client.systemOne(request, { signal }).withResponse()` once with `retry: { maxRetries: 0 }`. This follows the [official JavaScript SDK](https://docs.typesafe.ai/sdk/javascript); question syntax is checked against the installed declarations as well as live responses.

`response` is the original parsed SDK data: actual model, typed answers, complete probability distributions and usage. The application adds request, SDK version, provider request ID, start time and latency outside it. A requested alias and the actual returned model are different metadata. Use a pinned model for experiments; aliases may move.

## Configurations

Default governance wording lives in `examples/questions/governance.json`; `src/governance.js` builds the same five questions using SDK primitives. Default evidence wording remains `src/evidence-question-config.js`, version `oversight-evidence-1`. Portable envelope examples also live in `examples/questions/`.

```json
{
  "schemaVersion": 1,
  "kind": "evidence",
  "version": "my-oversight-study-1",
  "questions": {
    "evidence_judgment": {"type": "choice", "instructions": "...", "criteria": {"supported": "...", "contradicted": "...", "insufficient_evidence": "...", "ambiguous": "..."}},
    "addresses_control": {"type": "noul", "instructions": "...", "criteria": {"true": "...", "false": "..."}}
  }
}
```

This illustrates structure; use a complete exported configuration for execution. Field IDs, types and category keys are fixed so existing reviews remain interpretable. Instructions and criteria are editable. Governance Score has four rubric levels, 0–3. Versions are 1–80 ASCII letters/digits/dots/underscores/hyphens. Instructions are limited to 2,000 characters; each criterion to 1,000; the whole configuration to 24,000 characters. Unknown fields, changed types, empty wording and incompatible keys are rejected server-side before inference. Edited content cannot reuse the built-in default version.

In Assess or Evidence, open **Edit … questions**, change the version/wording, then **Apply question configuration**. Imported JSON becomes a draft first. Apply/reset/import/export never call Jev. The next explicit Analyze/Judge action uses the applied snapshot. Drafts are session-local and reset on remount; saved results retain their executed configuration.

Version names alone do not establish equivalence. Evidence evaluation also compares the entire canonical configuration content, preventing different wording with the same custom version from silently pooling. Default old results remain valid without newly added metadata; exact executed request questions still have to match. Custom result envelopes retain `questionConfiguration` explicitly.

## Interpretation

Choice selects a category; Noul answers a statement; Score returns a fractional rubric position plus its distribution. Confidence concentration is not a verified correctness score. A high relevance Noul can be wrong: the live study's editorial distractor received 0.81/0.82. No Noul threshold changes the stored Choice judgment or creates a compliance verdict.

Relevant text can support, contradict or leave a control ambiguous. Missing documentation is not an explicit denial. A queue countersignature does not necessarily establish approval before execution. Retrieval relevance, evidence classification and legal compliance are separate questions.

The web accepts only server-selected cases/descriptions and narrowly validated question envelopes. Clients cannot provide keys, endpoint URLs, retries, arbitrary model routing or extra state. Keep `TYPESAFE_API_KEY` on the server. Hosted authentication and provider spend limits remain the operator's responsibility.
