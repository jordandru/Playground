# Playground

This repository started as an empty Git workspace, so the first layer here is infrastructure rather than product code. The current baseline is intentionally small: plain Node.js, no runtime dependencies, single-process tests, and a repeatable report that tells us both what the local environment looks like and whether it satisfies the repository policy.

## Why this shape

- Git and Node.js 24 are available locally.
- `npm.cmd` works on this Windows machine even though PowerShell blocks `npm.ps1`.
- Python is not installed, so the baseline avoids assuming a Python toolchain.
- The repository had no commits yet, which makes now the cheapest time to establish conventions.

## What is included

- A zero-dependency infrastructure report in `src/infra/report.mjs`
- Policy requirements in `infra.config.json`
- CLI wrappers in `scripts/`
- Zero-dependency tests in `test/`
- Cross-platform GitHub Actions verification on Windows and Ubuntu
- Basic repository hygiene via `.editorconfig`, `.gitattributes`, and `.gitignore`

## Scripts

- `npm test` runs the Node test suite.
- `npm run infra:report` prints a Markdown infrastructure report for the current workspace, including policy findings.
- `npm run infra:report -- --json` prints the same report as JSON.
- `npm run infra:check` evaluates the current workspace against `infra.config.json` and exits non-zero on policy errors.
- `npm run infra:snapshot` writes the current report to `reports/infra/` and, when possible, a diff from the previous snapshot.
- `npm run infra:diff` compares the current workspace to the latest saved snapshot without writing new files.
- `npm run check` runs the tests and then a JSON policy check as a compact smoke check.

## Next directions

- Add more domain-specific checks as the project grows.
- Introduce an application entry point once the repo has a clearer purpose.
- Make the first commit after the baseline looks right, then let future snapshots show how policy health evolves over time.
