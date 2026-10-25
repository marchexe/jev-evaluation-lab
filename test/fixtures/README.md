# Recorded Jev fixture

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
