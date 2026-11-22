# Local source documents

Put original regulatory PDFs in `data/local/regulatory/`. This directory is
ignored by Git. Original filenames and SHA-256 hashes are listed in
[the corpus snapshot](../examples/regulatory/corpus.json).

The application, tests and offline evaluations use that checked-in JSON snapshot;
they do not require Python or original PDFs. Synthetic scenarios and expected rule
outcomes are also in `examples/regulatory/`. Generated reports belong in ignored
`results/`.

To verify the exact PDF edition, follow the
[ingestion instructions](../docs/assessments.md#reproduce-offline).
The importer defaults to this local PDF directory. Unknown editions are rejected.

## Publication

Keep the original PDFs local by default. Statutory text and a complete publisher's
PDF with commentary or standards are different publication questions. German
[UrhG § 5](https://www.gesetze-im-internet.de/urhg/__5.html) addresses official works;
redistribution permission for every supplied PDF has not been verified.
The public corpus contains selected statutory pages and excerpts with provenance,
not the complete commentary or BSI publications. Do not add complete originals
without reviewing their terms.
