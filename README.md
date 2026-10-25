# Jev Evaluation Lab

**Live demo:** https://jev-evaluation-lab-lovat.vercel.app/

Jev Evaluation Lab is an experimental workspace for exploring structured outputs
from [TypeSafe Jev](https://docs.typesafe.ai/sdk/javascript). It assesses AI system
descriptions, asking about intended use, personal data, oversight, and completeness.

I built the interface to look beyond a predicted label. Choice, Noul, and Score
give me categories, statement probabilities, and rubric-based scores to inspect.
I want to compare descriptions, record disagreements, and revisit saved judgments.

The app runs a defined set of questions rather than generating conversational
replies. Its focus is making model decisions inspectable, comparable, and
reviewable, with human judgments kept separate from the model's original answers.

## What I want to explore

Can a model reliably make structured decisions about descriptions of AI systems?
I am particularly interested in missing, ambiguous, and contradictory information:
does a description actually rule something out, or does it simply leave it unsaid?

How much do predictions and probabilities change when the same description is
rephrased? Can human review reveal recurring mistakes and help turn individual
observations into cases we can evaluate systematically?

More broadly, how useful are explicit probabilities and typed outputs for building
more reliable AI workflows? These are open questions, not established results.
The governance assessment is a starting point for exploring evaluation methods
that could eventually apply to other structured AI tasks.

## Explore the web app

### Assess

Choose one of 15 synthetic examples across HR, finance, education, customer
support, and ambiguity, or enter a description. Then select **Analyze with Jev**.

**Choice** selects a category with a probability for every option. **Noul** reports
a statement's probability without an automatic yes/no threshold. **Score** gives a
fractional position on an ordered rubric, with probabilities for every level.

| Assessment field | What to inspect |
| --- | --- |
| Intended use case — Choice | The main use selected from the available categories. |
| Use case coverage — Noul | Whether the description supports a use within those categories. |
| Personal data evidence — Choice | Documented processing, explicit exclusion, missing information, unclear claims, or conflicting claims. |
| Human oversight evidence — Choice | A documented mechanism, explicit absence, missing information, unclear claims, or conflicting claims. |
| Description completeness — Score | How fully the text explains purpose, people, inputs, outputs, and oversight on a 0–3 rubric. |

Inspect the full distributions, criteria, and rubric alongside each prediction.
Choice always selects an option, so read intended use together with coverage.
Confidence summarizes distribution concentration; it is not verified correctness.
Expandable technical details expose the request, response, model, usage, and latency.

### Compare

Select two saved assessments to compare descriptions, predictions, every option
probability, Noul and Score values, actual model IDs, request metadata, latency,
and token usage. Differences are B minus A; changed, unchanged, and missing values
are distinguished.

Try small wording changes while keeping the underlying system the same to spot
decisions worth investigating. Comparison works offline without new Jev requests.

### Evaluate

Open a saved case from Evaluate, then expand **Field review** for each result you
want to assess. Mark it **Correct**, **Incorrect**, or **Uncertain**, add a reviewer
comment, and optionally supply an expected Choice category or Score level from
0–3. Noul reviews use qualitative evidence judgments instead of numeric targets.
Reviews can be edited or cleared without changing the original model answers.

Evaluate aggregates judgment counts, Choice agreement where expected labels exist,
and Score absolute error where expected levels exist. Reported latency and tokens
are summarized for field-reviewed cases. Sample sizes and exclusions are explicit;
these are descriptive review statistics, not validated accuracy or calibration.

### History

Reopen assessments, revisit feedback, and export individual results or collections
with reviews as JSON, without further inference. History stays in this browser;
it does not sync across browsers or domains. Export anything you want to keep.

## A concrete experiment

Compare `hr-recruitment-reviewed`, which describes ranking real job applicants,
with `hr-synthetic-training`, which describes ranking fictional resumes in a
recruiter training tool. Both examples are synthetic descriptions, not real
applicant records. Ask whether the intended-use prediction stays the same, how
the personal-data assessment differs, and where probabilities shift. Review
ambiguous predictions and record your reasoning; no model results are assumed here.

## How it works

Description → Jev structured assessment → UI visualization → Human review → Comparison / evaluation.

Next.js serves the app and server-side endpoint. The TypeSafe SDK calls Jev, and
assistant-ui connects submissions and results. Saved data powers comparison and evaluation.

## Getting started

Try the [live demo](https://jev-evaluation-lab-lovat.vercel.app/) first, or use
Node.js 24.x to run locally. In PowerShell:

```powershell
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

To enable live assessments, set these in `.env`:

```dotenv
TYPESAFE_API_KEY=your_private_key
JEV_LIVE_INFERENCE_ENABLED=true
```

Run `npm.cmd run dev` and open http://127.0.0.1:3000. The key stays server-side;
Analyze incurs API usage. Leave inference disabled to work with saved assessments.

## Limitations and future direction

This is an experimental project, not a production compliance system. It evaluates
descriptions, not real-world compliance. Human reviews can be wrong, and the small
example set is not a validated benchmark. Browser-local history is not a backup.

I want more systematic human-reviewed datasets, error analysis, and question-set
iteration. I am also interested in entity alignment and possible applications to
knowledge graphs; these are future investigations. This is an independent project,
not an official TypeSafe product.
