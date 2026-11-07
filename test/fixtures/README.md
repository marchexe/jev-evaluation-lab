# Recorded Jev fixture

`jev-evidence-approval-recorded.json` records the single synthetic passage/control
request explicitly authorized by the owner for this feature. Actual model:
`jev-1.14.0`; request ID `req_01a1a79d74d577a995abf4bf34a9dacf`; usage: 719 input
and 80 output tokens. The complete request, question configuration and SDK response
are retained unchanged. Its predicted label is not a verified human reference.
Offline tests replay this recording; no test records new responses. Confusion
matrix unit tests use explicit categorical arithmetic rows, not fabricated Jev
responses. Test-only human labels exercise agreement and exclusion paths.

`jev-1.14.0-governance-recorded.json` contains a successful live assessment
recorded before the UI task. The local application envelope's `profile` field has
been normalized to `governance` for this independent project. This is a metadata
edit, so the complete envelope is not byte-for-byte original.

The original `response` object is unchanged, including all model results,
probabilities, confidence, Score levels, and token counts. The request payload,
SDK version, request ID, timestamp, and measured latency are also unchanged.
It contains a synthetic recruitment description, model `jev-1.14.0`, timestamp
`2026-10-24T22:56:08.590Z`, and request ID
`req_01a17020eea37e9c96b6e5a3850eaea3`.

This is a recorded response for offline UI, export, and persistence tests. It is
not a mock classifier, a fresh inference, or a manually verified ground-truth
label. Browser tests explicitly replay this recording and block external calls.
The UI does not load this fixture in normal operation.

`jev-governance-config-recorded.json` is a separate owner-authorized synthetic live
configuration smoke request from 2026-11-07. It includes an explicit edited
governance configuration, actual `jev-1.14.0`, Score 2.99, 1,265 input / 267 output
tokens and the unchanged SDK response. It is not a reference label.

`jev-evidence-config-recorded.json` preserves the complete result from one actual
browser → Node API → SDK → Jev → export/persistence smoke test, using the fixed
alternative evidence configuration. Request ID `req_01a1b6f80a4772c486f773b95b9619a8`,
769 input / 80 output tokens, 296.7 ms. Its original application envelope and SDK
response are unchanged. Offline browser tests replay it without paid inference.

The 58 complete evidence research recordings are documented in
`examples/evidence/jev-study/README.md`. AI design expectations and test review
annotations are never independently confirmed human ground truth.
