# Audit of the recorded source-obligation experiment

Read [the full methodology and failure analysis](../../../../docs/obligation-discovery-experiment.md)
before quoting the generated metrics in report.md or results.json.

The protocol and eight original responses are preserved. This audit does not edit
the frozen reference or promote any candidate to a verified requirement.

1. **Source strings are valid, legal meaning remains unverified.** All 8 candidates
   pass exact source checks. This is not a zero-hallucination result. There are no
   independent human labels for semantics, obligation completeness or applicability.
2. **Input captions cue some answers.** The citation object sent to Jev contains
   editor-written pinpoints including `definition fragment`, `recommendation`, and
   `not legislation and not the Claude deployment`. The 8/8 source-function match
   against AI expectations is not a blind source-text-only extraction result.
   These are defects to remove from a future protocol, not changes to this recording.
3. **Applicability failures/ambiguity.** GDPR 31 has a request trigger, explicitly
   absent in the synthetic case; Jev still assigns potentially_relevant (0.66).
   GDPR 35(1) has unknown high risk in the case, but Jev assigns potentially_relevant
   (0.71), not needs_information (0.29). The current category wording mixes general
   relevance with currently triggered applicability. Human adjudication is needed.
4. **Obligation and role boundaries are coarse.** Eleven of 32 role fields use the
   whole provision. Article 28(2) contains authorization and notification duties,
   but one candidate combines the first action with a different clause for both
   condition and exception. The entity selector also often includes an entire duty.
5. **Retrieval misses remain independent of extraction.** Both strategies return
   the same six Claude units. Article 28(1) is absent; 35(2) is sixth. The eight
   direct-source model calls deliberately bypassed retrieval, so 8 valid recorded
   citations do not establish successful end-to-end retrieval/discovery.
6. **Reference-label defect.** Non-Claude authority/internal-assistant cases use
   needs_information defaults counted as relevant, even for foreign synthetic
   company text. Those generated retrieval metrics have no useful performance
   interpretation. All labels, including Claude labels, remain AI-authored and
   unconfirmed. Do not retrofit the frozen file to improve the numbers.

Conclusion: suitable for preparing candidates for expert review, not automatic
production rule discovery. No new applicable legal requirement has been independently
confirmed. The existing seven-requirement catalog and its behavior are unchanged.

Next: define a narrow applicability question, remove editorial input cues, split
multi-duty source units and obtain independent reference labels. Freeze that new
protocol before testing the three held-out units and additional unseen provisions.
Replaying the present experiment is offline; all eight authorized API attempts
are already spent.
