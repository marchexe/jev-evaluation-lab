# Publication and deployment review

The project is independently named **Jev Evaluation Lab**. Integration and architectural references do not imply affiliation or endorsement. `private: true` blocks npm publication; `license: UNLICENSED` grants no open-source license. Keep dependency licenses, the installed TypeSafe skill's MIT notice and existing attribution/authorship intact.

## Repository review

Use `git status --short`, `git diff --check`, `git diff`, `git ls-files` and `git ls-files --others --exclude-standard` before staging. Exclude `.env*` except the blank `.env.example`, results, build/test output, caches and local exports. Never stage a directory wholesale without reviewing its contents.

Publish the synthetic source datasets, original frozen retrieval inputs, compact explicitly unconfirmed AI audit labels, versioned Jev study protocol, recorded synthetic responses, tests and methodology. The study's generated analysis is retained only as a labeled reproducibility artifact; it is not independently validated performance. Requests contain synthetic descriptions and source text, never actual resumes, accounts or company documents. Provider request IDs are retained as experiment metadata, not credentials.

Preserve the existing public repository history and authorship. Integrate reviewed work on top of its main branch; never merge unrelated private history or force-push it into the public repository. Audit each new commit tree as well as the final files. Keep unrelated local commits and research backups local.

## Manual Vercel deployment

Use the Next.js preset, Node.js 24.x, `npm ci` and `npm run build`. The SDK is externalized server-side. Start with `JEV_LIVE_INFERENCE_ENABLED=false`. Configure hosting access protection for the UI and **both `/api/assess` and `/api/evidence`**, including production, preview and custom domains. Hosting authentication stays outside this application. Confirm protection scope rather than assuming preview protection covers production.

Set `TYPESAFE_API_KEY` only as a server secret. Keep it out of `NEXT_PUBLIC_*`, screenshots, issue reports and exports. Configure provider budgets/quotas before enabling live inference. Environment changes require restarting/redeploying. Normal direct same-origin requests require no custom proxy settings.

For an operator-controlled reverse proxy that overwrites forwarded headers, optional `JEV_ALLOWED_ORIGINS` and `JEV_TRUST_PROXY_HEADERS=true` must both be set. Allow exact public origins only; no paths or wildcard hosts. Spoofed forwarded headers alone cannot authorize a request. Localhost/127.0.0.1 retain exact host/port matching despite NextURL loopback normalization.

## Public file boundaries

Keep `.env`, credential files, local operator configuration and all `results/`
contents out of Git. Results can contain user descriptions, private reviewer
comments, screenshots, local paths and environment backups. Publish only reviewed
synthetic examples and response fixtures; request IDs are metadata, not API keys.
Use explicit paths when staging. Inspect both the staged diff and each new commit
before a normal push. A pattern scan cannot prove the absence of all secrets.

## Final checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:browser
npm.cmd run audit:retrieval
git diff --check
git status --short
```

Replay the historical retrieval audit only in its pinned checkout; see
[experiment reproduction](experiments.md). Current-source hash rejection is intentional.

Browser tests use production servers with transport blocked and real recordings; no test or build automatically bills Jev. Live research commands are explicit, separate owner actions. Review [known methodological limits](limitations.md) before describing performance publicly.
