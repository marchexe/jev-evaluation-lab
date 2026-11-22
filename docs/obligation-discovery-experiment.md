# Source-grounded obligation discovery experiment

This is a bounded CLI experiment, separate from the production assessment catalog.
It tests extraction from source text, not lookup of the seven configured checks.
It does not approve requirements or produce compliance decisions.

## What was frozen before inference

`examples/regulatory/obligation-experiment/protocol.json` contains the complete
dataset, question configuration, comparison catalog, implementation hashes and
evaluation rules. Its protocol hash is
`e8d1b709ba9f4e05744fa4c95a86a01505846787c511dee6dff63cb0a621e8c8`.

The sample contains eleven source units and four synthetic situations (44 pairs):
Claude Code adoption, an offline weather display, an authority request and an
internal assistant. Eight preselected units were actually sent to Jev, all for
Claude Code. The other units and situations are offline controls, not additional
model measurements. Selection was purposive; it is not representative legal coverage.

The GDPR units are Articles 28(1), 28(2), 30(5), 31, 35(1), 35(2) and 6(1)(f).
Additional controls are a GeschGehG definition fragment, one short BSI 200-1
recommendation, a synthetic description of company practice and a synthetic Dispatch
policy. The latter policy concerns a different system. It must not become a Claude
requirement. BSI is a technical-standard source, not legislation. These distinctions
are model questions, with a deterministic source-kind gate preventing non-legislation
from becoming a statutory-obligation candidate.

The legal source inventory, source PDF hashes and original stored pages are retained.
All selected text uses exact UTF-16 offsets. BSI uses a short extracted passage,
not a republished full page: its offsets are excerpt-relative; add
`page.originalPageStartUTF16` to obtain the extracted full-page coordinates.
The original full-page text hash and source PDF hash are also recorded. Rechecking
that extension against the original PDF requires the local source PDF and pypdf
7.1.0; ordinary replay requires neither Python nor PDFs. Synthetic text has virtual
page 1, not a claim that a source PDF exists. These are pinned historical editions;
no current-law coverage is claimed. [Official GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).

## Pipeline and separation of errors

1. Reuse existing Text Search and bounded Graph Search on the same eleven units.
   Query terms are fixed in the dataset. No curated requirement mappings are added.
   Retrieval returns original unit references plus existing passage IDs and paths.
   Search-document coordinates belong to the generated search wrapper; use the unit's
   citation for original-page coordinates.
2. Independently judge the eight fixed source units. This deliberately bypasses
   retrieval so a retrieval miss is not mislabeled as a Jev extraction error. It is
   not a complete end-to-end measured discovery result.
3. Generate at most 24 exact span options mechanically, using sentence/clause
   boundaries. Every role gets the same pool. No hand-annotated role boundaries,
   gold-label tables or production requirements are sent to the model. See the
   editorial-caption leakage found below; this is not a fully blind experiment.
4. Use native Choice for normative function, applicability and four role selections
   (entity, action, conditions, exceptions). Use native Noul for legislative duty
   and explicit role presence. Preserve every probability, choice and Noul value.
5. Derive a span only when presence is at least 0.7 and a source option was selected.
   Values at most 0.3 mean not stated; intermediate values remain uncertain. The
   original answer survives even when no derived span is accepted. These fixed
   engineering thresholds are not validated legal confidence thresholds.
6. Match against the seven manual checks only after extraction, using article/source
   overlap. Article overlap is not obligation equivalence or proof of novelty.
7. Keep all generated candidates unverified and ineligible for production. Reviews
   stay separate. No import path automatically installs them as approved rules.

The existing SDK transport is reused: server-side environment key, HTTPS, one
request per attempt and zero retries. The eight authorized attempts succeeded;
their journals and complete parsed SDK responses are in `recorded-run/`. No
existing response was substituted. There are no live calls in test or replay.

## Actual first-run observations

| Observation | Result |
| --- | --- |
| Actual requests / authorized maximum | 8 / 8; no retries |
| Actual model | `jev-1.14.0`; requested `jev-latest`; SDK `0.7.0` |
| Token usage | 25,262 input; 5,845 output |
| Exact source-string checks | 8 / 8 candidates |
| Exact same-case duplicate source ranges | 0 / 8 candidates; semantic duplication is unreviewed |
| Roles with no accepted span | 11 / 32; includes legitimate absence and uncertainty |
| Whole-provision role selections | 11 / 32 |
| Source-function matches to AI-authored expectations | Jev 8 / 8; weak marker baseline 2 / 8 |
| Applicability matches to AI-authored expectations | Jev 6 / 8; weak marker baseline 1 / 8 |
| Independent human judgments | 0; validated semantic accuracy and hallucination rate unavailable |

The marker baseline is deliberately weak and returns `needs_information` for all
applicability questions. Its poor score is not evidence of general model superiority.
Citation validity checks strings and provenance, not correct use of the cited law.

**Input-cue defect:** the request includes the complete citation object. Some
editorial pinpoints explicitly say `definition fragment`, `recommendation`, or
`not legislation and not the Claude deployment`. Those captions cue source function
and one negative applicability answer, beyond the original passage. Source-kind
metadata is legitimate provenance, but these editorial captions weaken the
extraction measurement. The 8/8 source-function match must not be presented as a
clean source-text-only capability result. Preserve these requests as executed;
remove editorial conclusions from model inputs in a new frozen experiment, not by
editing the recorded requests. No remaining paid-call authorization is assumed.

For Claude, both retrieval strategies return the same six units. Their top five
are 28(2), 31, 35(1), synthetic company practice and 30(5). Against provisional
AI relevance labels: R@5 = 3/8, P@5 = 3/5. Article 28(1) is missed entirely despite
its apparent processor-selection relevance: its inflected wording differs from the
fixed lexical terms. Article 35(2) is sixth and is missed at five. No graph links
were added to repair these failures. The offline weather case returns no hits in
either strategy. Search budgets are not exhausted (maximum 13 visited nodes and 12
examined edges across these cases).

**Label-design defect:** the frozen AI-authored references for `authority-request`
and `internal-assistant` use broad `needs_information` defaults and then count those
as retrieval-relevant. This even includes foreign synthetic company text. Their
generated numeric retrieval scores are diagnostic artifacts, not useful estimates
of retrieval quality. Do not quote them as performance. Preserve this frozen run;
create a separately versioned reference after independent review rather than
silently correcting it. Even the Claude relevance policy needs human confirmation.

## Concrete failure analysis

**Trigger not enforced.** For `gdpr-31`, the source states cooperation on request.
The synthetic facts explicitly say no request was received. Jev nevertheless chooses
`potentially_relevant` (0.66), with `not_relevant` at 0.25. It selects the whole
sentence as its condition. A valid quote has not prevented a questionable current
applicability judgment. This is an engineering observation against the stated task,
not a binding determination about future cooperation duties.

**Unknown risk becomes a positive relationship.** For `gdpr-35-1`, high privacy risk
is unknown in the scenario. Jev chooses `potentially_relevant` (0.71), rather than
`needs_information` (0.29). Its selected risk clause is genuine, but the relationship
does not carry that unknown fact into the label. The class wording is also broad
enough to encourage general relevance rather than current applicability. A reviewer
must distinguish question ambiguity from model error.

**Several duties become one mixed record.** Article 28(2) contains both prior
authorization and notification of changes. Only one candidate is emitted. Its action
is the authorization sentence, while its conditions and exceptions both select the
notification clause. The actor is the entire paragraph. Article 28(1)'s actor
selection is a clause containing a pronoun, not a clean actor definition. Exact
citations therefore coexist with poor role boundaries and lost obligation structure.
Article 30(5) selects the entire paragraph for action, condition and exception; its
referenced underlying duties are outside the selected unit. No claim of complete
obligation enumeration is justified.

## Comparison with the seven checks

| Existing check | Sample comparison |
| --- | --- |
| `purpose-basis` | Article 6(1)(f) is an offline permission control; no live extraction |
| `processor-contract` | 28(1)/(2) share Article 28 with the manual 28(3) reference; different subduties, not proven equivalents |
| `international-transfer` | Article 44 not sampled; no coverage conclusion |
| `security-measures` | Article 32 not sampled; BSI recommendation does not substitute for it |
| `privacy-risk` | Exact 35(1) source overlap; applicability remains disputed |
| `employee-data` | BDSG 26 not sampled; no coverage conclusion |
| `business-secrets` | Same GeschGehG definition fragment, correctly not classified as an obligation |

Article 31 is a source obligation outside the seven-check article mappings, but its
current Claude relationship is disputed. Article 30(5) is an exception, not a new
standalone duty. There is **no independently verified new applicable requirement**.

## Reproduce without API calls

Run from the repository root after `npm.cmd ci` (Node 24):

```powershell
# Review exact requests; no credentials are read and no inference runs:
node --import tsx --import ./test-support/offline.js scripts/obligation-experiment.ts preview

# Create the ignored parent once. Choose a fresh child directory for each replay:
New-Item -ItemType Directory -Force results/obligation-experiment | Out-Null
node --import tsx --import ./test-support/offline.js scripts/obligation-experiment.ts report --run examples/regulatory/obligation-experiment/recorded-run --out results/obligation-experiment/replay-01

npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:browser
git diff --check
```

Compare the replay's canonical `resultsHash` with `observations/manifest.json`.
`recording-checksums.json` additionally checks raw file bytes. The narrow Git
`-text` attribute on this frozen experiment directory preserves captured line
endings, including Windows-created input files; do not format or normalize these
files. Protocol `sourceHashes` describe the original execution files. The existing
corpus JSON can have different outer JSON line endings after Git checkout under its
older LF policy; canonical corpus identity and the exact decoded page-text hashes
remain the replay checks. This does not alter any quotation or PDF hash.
`prepare` is for a new
protocol, refuses overwrite and must precede inference. Do not replace this protocol
or relabel these records with a new hash. Future live runs require a new explicit
cost authorization and `run --live --out NEW_DIRECTORY`; never run this to reproduce
measurements already available offline. This task's eight-request allowance is spent.

## Human review and integration decision

Use `review-packet.md`, the source dataset and blank `human-review-template.json`
before opening model responses. Confirm relevance for the entire eleven-unit pool
per query; define whether background duties and nonbinding context count. Independently
record kind, relationship, role spans, missing duties and reasons. Leave uncertainty
explicit. Keep completed reviews in ignored `results/`; do not overwrite frozen inputs.

For field-level comparison, a separate JSON document can use the existing review
shape: `{ "humanConfirmed": true, "reviewer": "reviewer ID", "rows": [ { "id":
"claude-adoption::gdpr-31", "fieldReviews": { "applicability": { "judgment":
"incorrect", "comment": "Reason based on independently reviewed source and facts",
"expectedChoice": "not_relevant" } } } ] }`. This is a format example, not a human
label. Supply it via `report --field-reviews results/YOUR_REVIEW.json ...` to compute
Choice agreement only on reviewed, non-uncertain fields with expected labels, with
explicit denominators. Noul reviews remain qualitative. Complete source-pool labels
are a review packet; the current scorer does not promote them automatically into
validated retrieval gold. That confirmation/scoring step remains future work.

**Recommendation:** keep this an offline candidate-preparation experiment. Do not
integrate it as automatic regulatory discovery in the main assessment. The next
bounded experiment should split multi-duty paragraphs, use narrower actor/action
options and distinguish background relevance from triggered applicability. First
remove editorial conclusion cues from the input citation captions. Freeze
those changes and independent labels first, then test the three held-out units and
new provisions. No additional model requests were made for those cases here.
