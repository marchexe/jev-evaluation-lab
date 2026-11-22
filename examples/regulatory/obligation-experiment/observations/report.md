# Source obligation discovery experiment

Protocol: e8d1b709ba9f4e05744fa4c95a86a01505846787c511dee6dff63cb0a621e8c8

Exploratory model outputs; no independent human ground truth. No legal compliance verdict.

Recorded requests: 8/8. Exact citation checks: 8/8. This checks source strings, not meaning.
Actual model versions: jev-1.14.0. Tokens: 25262 input / 5845 output.
AI-reference matches: kind 8/8; applicability 6/8. These are not validated accuracy.
Role spans absent/uncertain: 11/32; whole-provision selections: 11.

| Query | Text R@5 | Graph R@5 | Text P@5 | Graph P@5 | Relevant units (unconfirmed) |
|---|---:|---:|---:|---:|---:|
| claude-adoption | 0.375 | 0.375 | 0.6 | 0.6 | 8 |
| offline-kiosk | N/A | N/A | 0 | 0 | 0 |
| authority-request | 0.09090909090909091 | 0.09090909090909091 | 0.2 | 0.2 | 11 |
| internal-assistant | 0.45454545454545453 | 0.45454545454545453 | 1 | 1 | 11 |

P@5 uses five slots, including unfilled slots; R@5 is undefined for zero-relevant cases. Full hits, exact excerpts, paths, visited nodes, examined edges, limits and misses are in results.json. Labels remain unconfirmed.

## Per-source review

### claude-adoption::gdpr-28-1
DSGVO Art. 28 Abs. 1; PDF page 49; exact offsets 857–1240 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: binding_obligation; potentially_relevant. AI-reference differences: kind=false, applicability=false.
> (1) Erfolgt eine Verarbeitung im Auftrag eines Verantwortlichen, so arbeitet dieser nur mit Auftragsverarbeitern, die  hinreichend Garantien dafür bieten, dass geeignete technische und organisatorische Maßnahmen so durchgeführt werden,  dass die Verarbeitung im Einklang mit den Anforderungen dieser Verordnung erfolgt und den Schutz der Rechte der  betroffenen Person gewährleistet.
Review: action: whole-provision span; boundary quality needs review. exceptions: not_stated Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::gdpr-28-2
DSGVO Art. 28 Abs. 2; PDF page 49; exact offsets 1242–1742 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: binding_obligation; potentially_relevant. AI-reference differences: kind=false, applicability=false.
> (2) Der Auftragsverarbeiter nimmt keinen weiteren Auftragsverarbeiter ohne vorherige gesonderte oder allgemeine  schriftliche Genehmigung des Verantwortlichen in Anspruch. Im Fall einer allgemeinen schriftlichen Genehmigung  informiert der Auftragsverarbeiter den Verantwortlichen immer über jede beabsichtigte Änderung in Bezug auf die  Hinzuziehung oder die Ersetzung anderer Auftragsverarbeiter, wodurch der Verantwortliche die Möglichkeit erhält, gegen  derartige Änderungen Einspruch zu erheben.
Review: entity: whole-provision span; boundary quality needs review. Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::gdpr-30-5
DSGVO Art. 30 Abs. 5; PDF page 51; exact offsets 2231–2774 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: exception; potentially_relevant. AI-reference differences: kind=false, applicability=false.
> (5) Die in den Absätzen 1 und 2 genannten Pflichten gelten nicht für Unternehmen oder Einrichtungen, die weniger  als 250 Mitarbeiter beschäftigen, sofern die von ihnen vorgenommene Verarbeitung nicht ein Risiko für die Rechte und  Freiheiten der betroffenen Personen birgt, die Verarbeitung nicht nur gelegentlich erfolgt oder nicht die Verarbeitung  besonderer Datenkategorien gemäß Artikel 9 Absatz 1 bzw. die Verarbeitung von personenbezogenen Daten über  strafrechtliche Verurteilungen und Straftaten im Sinne des Artikels 10 einschließt.
Review: action: whole-provision span; boundary quality needs review. conditions: whole-provision span; boundary quality needs review. exceptions: whole-provision span; boundary quality needs review. Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::gdpr-31
DSGVO Art. 31; PDF page 51; exact offsets 2829–3001 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: binding_obligation; potentially_relevant. AI-reference differences: kind=false, applicability=true.
> Der Verantwortliche und der Auftragsverarbeiter und gegebenenfalls deren Vertreter arbeiten auf Anfrage mit der  Aufsichtsbehörde bei der Erfüllung ihrer Aufgaben zusammen.
Review: entity: whole-provision span; boundary quality needs review. action: whole-provision span; boundary quality needs review. conditions: whole-provision span; boundary quality needs review. exceptions: not_stated Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::gdpr-35-1
DSGVO Art. 35 Abs. 1; PDF page 53; exact offsets 1891–2435 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: binding_obligation; potentially_relevant. AI-reference differences: kind=false, applicability=true.
> (1) Hat eine Form der Verarbeitung, insbesondere bei Verwendung neuer Technologien, aufgrund der Art, des  Umfangs, der Umstände und der Zwecke der Verarbeitung voraussichtlich ein hohes Risiko für die Rechte und Freiheiten  natürlicher Personen zur Folge, so führt der Verantwortliche vorab eine Abschätzung der Folgen der vorgesehenen  Verarbeitungsvorgänge für den Schutz personenbezogener Daten durch. Für die Untersuchung mehrerer ähnlicher  Verarbeitungsvorgänge mit ähnlich hohen Risiken kann eine einzige Abschätzung vorgenommen werden.
Review: Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::geschgehg-definition
GeschGehG § 2 Nr. 1 Buchst. b (definition fragment); PDF page 3; exact offsets 406–526 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: definition; potentially_relevant. AI-reference differences: kind=false, applicability=false.
> b)   die Gegenstand von den Umständen nach angemessenen Geheimhaltungsmaßnahmen durch ihren rechtmäßigen Inhaber ist und
Review: entity: uncertain action: not_stated conditions: uncertain exceptions: not_stated Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::bsi-recommendation
BSI 200-1, PDF p.23, employee participation recommendation; PDF page 23; exact offsets 0–165 in stored page/excerpt. Original PDF-page start offset: 165.
Jev: recommendation; potentially_relevant. AI-reference differences: kind=false, applicability=false.
> Mitarbeiter sollten außerdem in die Umsetzungspla­ nung von Maßnahmen einbezogen werden, um eigene Ideen einbringen und die Praxistauglichkeit  beurteilen zu können.
Review: entity: uncertain action: whole-provision span; boundary quality needs review. conditions: not_stated exceptions: not_stated Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

### claude-adoption::internal-policy
Synthetic Dispatch approval rule; not legislation and not the Claude deployment; PDF page 1; exact offsets 47–186 in stored page/excerpt. Original PDF-page start offset: 0.
Jev: internal_control; not_relevant. AI-reference differences: kind=false, applicability=false.
> A human supervisor must approve every recommendation before the Dispatch assistant executes it. The supervisor may reject a recommendation.
Review: entity: whole-provision span; boundary quality needs review. action: whole-provision span; boundary quality needs review. conditions: uncertain exceptions: not_stated Historical source; context, cross-references and legal interpretation need human review. One candidate per provision can conflate multiple obligations.

## Limitations
- Purposive tiny source subset, not corpus-wide discovery. Source boundaries are editor-selected, role spans are generated mechanically.
- Eight direct-source model judgments bypass retrieval so classification can be tested independently. Full retrieval results are evaluated separately; an end-to-end result must also account for retrieval misses.
- One candidate per provision cannot enumerate all obligations: GDPR 28(2) includes authorization and notification duties.
- Span selection prevents arbitrary generated citations but cannot prove semantic entailment, applicability, or completeness.
- No generated free-text legal reasoning: rationale consists of selected condition/exception spans plus synthetic facts and categorical probabilities. This does not establish a complete legal argument.
- No curated regulatory relationships were added: graph results can equal text results. No graph superiority is claimed.
- AI-authored expectations are provisional, including no-answer expectations, and must be independently reviewed.
- Historical source versions and a partial BSI excerpt do not establish current-law coverage.
- No model inference on the three held-out source units or other synthetic scenarios; no generalization result.

## Recommendation
Do not integrate as automatic production requirement discovery. Use only to prepare reviewable source-linked candidates. Obtain independent paragraph/role/applicability labels, split multi-duty provisions, then repeat on held-out provisions before any reliability claim.
