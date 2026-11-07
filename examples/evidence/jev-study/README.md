# Recorded Jev evidence study

This is an exploratory synthetic study, not independently human-validated accuracy. `protocol.json` was frozen before inference with hash `sha256:e0ea12732c0293eda6abdbcb5bd188fa4a112f6376ade9641a55a238edad18a7`. It contains all 29 cases, exact source passages, revisions, control, fixed question configurations, AI-authored design expectations, split definitions and a pinned `jev-1.14.0` request model.

Development comprises all 17 passages from the original frozen search corpus. Held-out comprises 12 new passages written before results, three per evidence category, in `heldout.json`. No label is independently human-confirmed. One development control-mapping case has an uncertain classification expectation and is excluded from classification counts, but remains in relevance diagnostics. The 0.5 Noul threshold was specified in the analysis runner before inference; no threshold was optimized afterward.

Baseline `oversight-evidence-1` is unchanged. Alternative `oversight-evidence-2-research` adds explicit queue timing, review-target and contradictory-statement boundaries; its Noul asks broader source-finding relevance. Each case is requested once per configuration using identical passage/control state. Configuration order is fixed, not randomized; no repeatability claim is made.

`runner-at-recording.ts.txt` preserves the exact runner source whose normalized
SHA-256 is recorded in the original protocol. The current runner additionally
validates saved SDK envelopes before analysis and prints an already-received
response if local persistence fails. These validation/recovery changes do not
alter request construction, questions, datasets or analysis arithmetic;
the original protocol and its historical software hash remain unchanged.

## Actual recorded results

| Split | Configuration | Agreement with AI classification expectations | Relevance errors at 0.5 | False support / missed contradictions |
|---|---|---:|---:|---:|
| Development | Baseline | 14/16 | 5/17 | 1 / 0 |
| Development | Alternative | 15/16 | 2/17 | 0 / 0 |
| Held-out | Baseline | 10/12 | 0/12 | 0 / 0 |
| Held-out | Alternative | 11/12 | 1/12 | 0 / 0 |

These are comparisons with AI design expectations, not human agreement or general accuracy. No probabilities were thresholded to change the Choice result. The Noul questions have different semantics; their error counts are sensitivity diagnostics, not a calibration comparison.

The baseline treats queue release as support; the alternative labels it ambiguous. Both call the vague-control development and held-out statements insufficient, rather than the AI expectation of ambiguous. The alternative fixes the held-out internally conflicting paragraph. Both relevance Nouls still promote the editorial spelling distractor (0.81/0.82); the alternative also rates irrelevant held-out training-data review at 0.57. Therefore production Text/Graph retrieval is unchanged, without a model filter or reranker.

`recorded/01-1.json` through `29-2.json` are complete real request/response envelopes, not mocks. Every SDK response, probability, model ID, token count, request ID and latency is retained. `recorded/analysis.json` is an explicitly AI-reference descriptive analysis; `recorded/protocol.json` is the exact run snapshot. No credentials or authentication headers are included.

All 58 responses identify `jev-1.14.0`, SDK 0.7.0. Reported usage totals 43,690 input / 4,873 output tokens, mean SDK latency 203.34206896551717 ms. Estimated token cost is $0.00183498 using the [published model price](https://docs.typesafe.ai/models), checked 2026-11-07: $0.042 per million input tokens, output free. This is a rate-based estimate, not an invoice or account-balance reconciliation.

A separate governance configuration smoke call is preserved in `test/fixtures/jev-governance-config-recorded.json`, with 1,265 input / 267 output tokens, 415.59 ms, Score 2.99 and its unchanged distribution. A real browser/API evidence smoke test is preserved in `test/fixtures/jev-evidence-config-recorded.json`, with 769 input / 80 output tokens and 296.7 ms; its exact export and post-reload persistence were verified. These are integration checks, not additional comparative samples. Combined work: 60 calls, 45,724 input / 5,220 output tokens; estimated $0.001920408. No automatic retries occurred.

For preview, offline replay and intentional live repetition, use [the experiment guide](../../../docs/experiments.md). A new experiment's question/dataset changes need new versions and separate frozen inputs. Never treat these design expectations as a confirmed human reference.
