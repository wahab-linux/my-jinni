# AI usage log and submission draft

This is a working log, not a completed human-review statement. Update it throughout development. Planned process: Level 4 (AI-led, human directed); final level must reflect the actual process. The official Level 4 description includes regular human edits to AI output. If between levels, the organisers require the higher level.

## Actual activity

| Date | Person/tool | AI contribution | Human decisions/edits | Verification |
| --- | --- | --- | --- | --- |
| 2026-10-17 | Codex; exact model/plan to be recorded from the user's session | Proposed AfterClass; generated initial structure, API schemas/examples, mock datasets, scaffold, tests, bilingual prompts/docs | User selected AfterClass and assigned backend to self, frontend to Wahab. Further code review/edits are not yet recorded. | Agent ran lint and format checks, 21 passing scaffold/contract tests, and actual startup/HTTP smoke checks for the page, options, both sources, OpenAPI, fixtures, and explicit 501 POST. Tests emitted one dependency deprecation warning. Engine/business-rule verification and human review remain outstanding. |
| 2026-10-17 | Codex coordinating agent and three subagents: requirements, architecture, handoff | Audited requirements; added 27 functional/business/quality requirements and 14 acceptance scenarios; migrated the scaffold contract to v0.2 with generic request constraints and origin-aware mock travel; rewrote bilingual tasks/prompts | User explicitly requested delegation and clarified that students are only the MVP audience, not the architecture boundary. No human code review/manual edits are newly claimed. | Coordinating agent reviewed cross-document consistency, ran lint/format and 32 passing scaffold/scenario tests, and verified actual HTTP options, both isolated origin feeds, migrated fixtures, supported-request 501 and unsupported-origin 422. Existing dependency warning remains. Engine/UI business acceptance is still pending. |
| 2026-10-17 | Codex coordinating agent and three documentation subagents | Converted repository documentation, development prompts, AI records, and project metadata to English while preserving requirement IDs and the API contract. Added an English-only repository instruction. | User explicitly requested English-only repository content. The existing local description change was translated while retaining its meaning. No new human code-review claims are made. | Scanned all tracked text and filenames for Han characters with zero matches; requirement/acceptance IDs were preserved; lint, formatting, and all 32 scaffold/scenario tests passed. Existing dependency deprecation warning remains. |

For each subsequent task, add the tool/model/paid plan, why it was used, what it generated, specific human decisions or code edits, and the actual check/result. Keep relevant commits or conversation evidence where available. Do not invent review, metrics, or edits.

## Failure and checking

- Runtime recommendation is planned to use deterministic rules, with no LLM dependency. AI coding mistakes are checked through human review, unit tests, integration tests, lint, and running the app; mark which checks actually happened.
- If event or travel data is unavailable, return a visible error rather than invented recommendations.
- All source datasets and response examples are simulated; some were AI-generated during scaffolding.

## Submission paragraph template

> We used [tools, exact models and any premium plans] for [planning, coding, debugging, design, or documentation] because [reason]. Our actual AI usage level was [level]. We made the decisions about [scope, API, ranking, architecture] and manually reviewed/edited [specific examples that actually occurred]. We checked the output using [actual tests and demo checks]. [Explain what happens if AI is wrong or unavailable.] Our event and travel datasets are clearly labelled simulated data.

Replace every placeholder with verified facts before submission. Also follow any later sponsor/organiser submission instructions.
