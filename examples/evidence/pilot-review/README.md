# Independent pilot review packet

This is a new, AI-authored synthetic packet. It does not replace the original six
cases, 18-query frozen experiment, or any recorded Jev responses. It has no gold
labels, retrieval rankings, graph paths, model predictions or measured metrics.

- `dataset.json`: two bundles, six revision-pinned documents and four queries.
  The controls distinguish prior approval from the ability to stop execution.
- `review-template.json`: all 24 eligible query/passage pairs, with exact source
  references, blank relevance and evidence judgments, and canonical SHA-256 hashes.
  Each query covers all six paragraphs for its system. No source is preselected
  because it appears useful to the author or a search strategy.

Give both files to a reviewer. Copy the template to an ignored location before
editing it. Keep IDs, passages and hashes unchanged. For each pair:

1. Read the query, control statement, source passage and document context.
2. Set `relevance` to `relevant`, `not_relevant` or `uncertain`.
3. Separately set `evidenceJudgment` to `supported`, `contradicted`,
   `insufficient_evidence`, `ambiguous` or `uncertain`.
4. Add a short rationale and set `confirmed` only after actual human review.

The reviewer must work before seeing search results or model predictions. If
that did not happen, do not assert independent review. A human may set the
confirmation alias and actual date after completing the packet. AI-generated
labels must never be marked human-confirmed. Preserve disagreements and uncertainty.

Use the development bundle to settle the task and review rules. Keep the course
bundle out of tuning. Anyone can read the published files, so this split does not
prove blindness. Have another person author replacement held-out cases if needed.

This packet is not a browser import and is not accepted by the original frozen
retrieval runner. It is an input for agreeing the next experiment with a reviewer.
Before measurements, freeze that experiment's search terms, graph relationships,
limits, implementation and evaluation rules as a separate manifest. Evaluate
retrieval relevance and evidence classification separately. Do not report accuracy
from this blank packet or from provisional AI labels.

The offline test reconstructs all eligible pairs and verifies the packet hashes.
The original experiment remains unchanged.
