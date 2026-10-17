# AfterClass requirements

This document is the product and acceptance baseline, not a claim of completed functionality. It describes application behaviour without defining final JSON field names. Coordinated field definitions live in `docs/API.md`, `app/schemas.py`, `docs/openapi.json`, and `web/fixtures/`.

## 1. Decisions and implementation status

- **Confirmed by the team:** build AfterClass; roXy owns the backend; Wahab owns the frontend; students are the MVP audience, not the boundary of the architecture.
- **Selected MVP:** a person chooses one activity using budget, available time, and interests, combining event and travel feeds. Return to the same selected origin is the first-version journey model.
- **Current scaffold, inspected 2026-10-17:** source endpoints, schemas, fixtures, and contract tests exist; the recommendation endpoint deliberately returns HTTP 501. A fixture result, a passing scaffold test, or a mock feed is not a completed recommendation engine.
- **Pending implementation:** actual source adaptation, calculated filtering/ranking, integrated UI behaviour, and the business acceptance scenarios below. Leave their completion unchecked until verified.
- **Evidence boundary:** this document adds team product choices and implementation requirements. It does not establish new official sponsor rules. Recheck the opening-ceremony material and later notices for submission/assessment requirements.

## 2. Product and configurable MVP

**Product promise:** help a person answer “What can I realistically do in this time window and budget, and why is it a good fit?” A recommendation is only as reliable as its source data and simplified travel assumptions.

**Primary user story:** As a person with a starting location, departure time, return deadline, budget, and interests, I want a feasible activity and a few alternatives with understandable cost and timing so I can choose confidently.

**Student MVP story:** A Glasgow student has time after class, starts and returns at the main campus, and wants an affordable activity. This is an example configuration of the same product. The system does not require student status, university membership, or an account.

| Concern | General core | Student demo configuration |
| --- | --- | --- |
| Person | Preferences and constraints; no student identity model. | Student-oriented copy and default interests. |
| Location | An origin ID and label supplied through configuration and travel data; return to that origin. | Glasgow main campus is the student default; Glasgow city centre is a second simulated origin demonstrating the same flow for other people. |
| Date and timezone | Aware timestamps and a configured supported date/window and display timezone. The pure decision rules have no fixed demo-date constant. | One fictional demo day and `Europe/London`, consistently used across fixtures and options. |
| Events and journeys | Normalised event and journey records, joined by location ID. | Eight fictional events and four fictional destinations are sufficient. |
| Money | Integer pence; GBP only in this release. | Student-scale budget defaults; configurable limits. |

Generality means separating data/configuration from rules. It does **not** mean building a profile platform, arbitrary-city search, multi-currency engine, or every transport mode during the hackathon. Both configured origins reuse the same screen and activity model; the city-centre demo needs only a small simulated travel fixture, not a second product. A synthetic date-change test also checks that the decision engine has no fixed-date dependency.

## 3. Scope and priorities

| Priority | Scope | Exit condition |
| --- | --- | --- |
| **P0: complete flow** | Configured options → preference form → two actual mock HTTP feeds → normalisation/join → feasibility/ranking → recommendation and reasons. | Both sources materially affect the calculated answer; the browser uses the real API. |
| **P0: honest failures** | Validation, no match, missing/invalid records, source failure, loading and retry. | Every outcome has a distinguishable API/UI state; no hidden fixture fallback. |
| **P0: delivery** | Tests, contract parity, one-command startup, README/architecture/trade-offs, factual AI log and a short demo. | Acceptance scenarios pass and both teammates can explain the flow. |
| **P1: only after P0** | Better visual polish, richer rejection summaries, additional configured origins beyond the two demo cases, explicit fixture demo selector. | No contract break or loss of test/demo time; team agrees. |
| **Deferred** | Live providers, arbitrary geocoding, maps, transport schedules/routing, different return destination, multi-activity itineraries, overnight windows, group planning, accounts, database, payments, scraping, runtime LLM, multi-currency and production deployment. | Separate future decisions; none required for this MVP. |

## 4. Functional requirements

All requirements below are P0 unless marked P1. IDs are stable so code, tasks, and tests can refer to them. “Configured” permits a single supported value in the demo, without baking it into the decision algorithm.

| ID | Requirement | Evidence |
| --- | --- | --- |
| **FR-01** | Supply supported origin(s), date/window, timezone, interests, currency, limits, and defaults through application options/configuration. Frontend labels/defaults derive from these values. | AC-01, AC-12 |
| **FR-02** | Accept an origin, departure, return deadline, integer-pence budget and supported interests. Validate before fetching sources; show correctable input errors. | AC-02 |
| **FR-03** | Fetch both independently shaped event and travel APIs, normalise them through adapters, and join event venues to available journeys for the selected origin. | AC-03, AC-08, AC-09 |
| **FR-04** | Apply every hard feasibility constraint before ranking; check outbound arrival and return-to-origin separately. | AC-04, AC-05, AC-06 |
| **FR-05** | Deterministically rank feasible candidates, showing one recommendation and up to two distinct alternatives; produce a valid no-match response if none qualify. | AC-07, AC-10 |
| **FR-06** | Explain the actual match: ticket price, return travel fare, total price, arrival/return times and interest match. Reasons must follow calculated facts, including when there is no matching interest. | AC-03, AC-07 |
| **FR-07** | Preserve a single documented application contract and error envelope; static fixtures stay explicitly separate from calculated results. | AC-11, AC-13 |
| **FR-08** | Show initial, submitting, success, no-match, validation, source-error and not-yet-implemented states. Prevent stale results from being presented as a newly successful response; allow correction or retry. | AC-11 |
| **FR-09** | Show that both datasets are simulated, with their source names and update timestamps. Preserve warnings for excluded records/missing journeys. | AC-08, AC-09, AC-11 |
| **FR-10** | Provide reproducible startup and demo instructions plus an architecture diagram, known limitations, trade-offs, verification and factual AI-usage records. | AC-13, AC-14 |

## 5. Business and data rules

| ID | Rule |
| --- | --- |
| **BR-01** | Total cost is ticket price plus **one return fare**. `total <= budget` is feasible; exact equality passes. Never double a fare already covering both legs. Raw GBP strings convert with `Decimal`; reject negative, non-finite or sub-penny prices rather than silently rounding. |
| **BR-02** | Arrival = departure + outbound duration; arrival must be at/before event start. Return = event end + return duration; return must be at/before the deadline. Attending the full event is assumed. |
| **BR-03** | Time comparisons use aware datetimes as instants. Display uses the configured timezone; request validation applies the configured supported local date/window. No fixed date, campus ID or student identity belongs in the pure engine. |
| **BR-04** | Rank by interest-match descending, total cost ascending, total travel duration ascending, stable event ID ascending. Selected interests have equal priority. A feasible nonmatching event remains eligible but cannot be described as an interest match. |
| **BR-05** | Unknown journey, unavailable journey, mismatched source origin or incomplete cost/time cannot establish feasibility. Unknown is never zero. Durations/fares must be nonnegative and correctly typed. |
| **BR-06** | Each event ID is unique. Journey keys must be unambiguous for the selected origin and destination. Conflicting duplicates fail the source, rather than selecting an arbitrary record. |
| **BR-07** | Event start must precede event end; required IDs/titles/locations and known categories must be valid. A malformed individual record can be skipped with a warning if valid records remain. A nonempty feed with no valid records fails as invalid source data. |
| **BR-08** | A structurally valid empty event list is a successful no-match search. A valid empty travel list or no usable journey yields no feasible activities, not fabricated travel. |
| **BR-09** | Required-source timeout, HTTP failure or unavailable source fails the recommendation request. Invalid top-level structure, ambiguous joins or origin mismatch fails it as invalid source data. Do not return partial recommendations without the data needed to establish feasibility. |
| **BR-10** | Source update timestamps are shown, not treated as proof of live/fresh information. Fixed travel durations are estimates with no traffic, wait-time, service schedule or route guarantee. |

## 6. Quality and delivery requirements

| ID | Requirement |
| --- | --- |
| **QR-01: separation** | Experience → application orchestration → source integration + pure decision engine. Engine imports no FastAPI/frontend code and performs no file/network I/O. |
| **QR-02: bounded failure** | Source calls have explicit finite timeout bounds; test failure paths without real sleeps or Internet. Set and document the actual timeout before handoff. |
| **QR-03: contract consistency** | Runtime schemas, OpenAPI snapshot, docs, fixtures and frontend all use the same version and money/time units. Shared changes are coordinated; no silent rename. |
| **QR-04: usable interface** | Readable on mobile and desktop; labelled controls, keyboard operation, visible focus/error messages, clear GBP/time formatting and simulated-data label. |
| **QR-05: meaningful verification** | Test budget and both travel-time boundaries, ranking/ties, actual two-source integration and bad/failed sources. Scaffold-only checks are insufficient. Run required lint/format/test commands before handoff. |
| **QR-06: reproducibility** | Existing one-command startup works from documented dependency setup. Demo and core tests require no API key, external credentials or live Internet source. |
| **QR-07: honest AI reporting** | Record actual tool/model use, human decisions/edits and checks. Planned Level 4 is not a claim of final classification or completed human review. |

## 7. Executable acceptance scenarios

All scenarios are **pending** until observed against the implemented application/tests. The baseline below is a synthetic test setup, not live event information. Substitute the configured demo day when constructing aware timestamps.

**Baseline:** one games event A, 17:00–18:00, ticket 300p; journey 15 minutes each way, return fare 200p, available; depart 16:00, return deadline 19:00, budget 1000p, interest games. Expected total 500p, arrival 16:15, return 18:15. Event and travel fixtures are supplied through both source routes/transport in the integration test.

| ID | Given → action → expected result | Verify |
| --- | --- | --- |
| **AC-01** | Student default config is loaded → open options/form → configured campus and city-centre origins, date, limits and timezone appear; no student login/status required. | API + browser |
| **AC-02** | Submit malformed JSON, boolean/fractional/negative budget, missing offset, reversed window, unsupported origin/date/interest, duplicate interests or unknown fields → structured validation error and no calculated result. Correct the inputs → request can be resubmitted. | API tests + form |
| **AC-03** | Baseline → real recommendation POST → A, 500p, 16:15 arrival and 18:15 return, actual reasons and both source labels. Change only fare to 1200p → A is no longer feasible; change only event price to 1100p → also infeasible. | Integration |
| **AC-04** | Baseline → budget 500p → A qualifies; budget 499p → A excluded. | Unit |
| **AC-05** | Event begins 16:30; outbound 15 min → depart 16:15 qualifies; depart 16:16 excludes A. | Unit |
| **AC-06** | A ends 18:00; return 15 min → deadline 18:15 qualifies; deadline 18:14 excludes A. | Unit |
| **AC-07** | Multiple feasible candidates → matching interest wins; ties break by cost, total travel, then ID. Shuffle source order → identical result. All interests unmatched → no false match claim. More than three feasible events → only one recommendation plus at most two unique alternatives. | Unit |
| **AC-08** | A lacks a journey or journey is unavailable → exclude A with the documented warning; missing duration is never zero. Add one safely malformed record alongside valid records → keep valid recommendations and show warning. Conflicting duplicate keys or an all-invalid nonempty feed → invalid-source error. | Source + API |
| **AC-09** | Event or travel source separately times out/fails → structured source-unavailable error; invalid top-level structure or wrong travel origin → invalid-source error. No hidden fixture/partial success; UI offers retry. | Integration + browser |
| **AC-10** | No feasible candidates, valid empty event feed, or valid empty travel feed → successful no-match response with empty results and a clear message; it is distinguishable from failed sources. | API + browser |
| **AC-11** | Browser uses real endpoint → see loading then correct success/no-match/error. Initial 501 is shown honestly while scaffold remains. Force failure after previous success → previous result is cleared or explicitly marked stale. Any explicit fixture mode is visibly labelled and never automatic. | Manual browser check |
| **AC-12** | Select the configured city-centre origin → its travel source origin and journeys are used, and output/UI say return to that origin with no campus-specific assumption. Separately inject another supported date and consistently shifted synthetic events → same relative budget/time outcomes without decision-rule edits. | Config + integration test + browser |
| **AC-13** | Clean documented setup → one command starts app → health, options, page, both feeds and real POST work; generated OpenAPI matches snapshot and fixtures validate against current schemas. Required lint/format/tests pass. | Automated checks + smoke |
| **AC-14** | Rehearse normal recommendation → lower-budget change → source-failure handling. Both teammates explain three layers, hard constraints, deterministic ranking and simulated-data limitations; AI record contains actual work/checks, with outstanding review explicitly noted. | Team rehearsal |

## 8. Work packages and ownership

Read this with `docs/PROJECT_PLAN.md` and the assigned prompt. Coordinate shared contract/dependency/documentation changes before editing them. The sequence allows parallel development without having two people edit the same implementation files.

| Package | Owner | Requirement IDs | Concrete output and dependency |
| --- | --- | --- | --- |
| **S0: scope + contract** | Together | FR-01/02/07; BR-01–04; QR-03 | Agree origin/return semantics, configurable date and exact fields/errors; synchronise schema, docs, OpenAPI and fixtures. Do this before separate implementation. |
| **B1: data adapters** | roXy backend | FR-03/09; BR-01/05–10; QR-02 | Fetch and normalise both sources, preserve provenance and warnings, reject ambiguous/failed sources; source tests. Can run alongside F1 after S0. |
| **B2: pure engine** | roXy backend | FR-04/05/06; BR-01–05; QR-01/05 | Pure feasibility/ranking with fact-based reasons; budget/arrival/return/tie tests. Can begin on normalised synthetic records before B1 is finished. |
| **B3: application wiring** | roXy backend | FR-01/02/07; QR-02/03/06 | Config-driven options and validation; wire B1+B2 into real POST, replace obsolete 501 assertions, update readiness only when implemented; source-failure/config portability integration tests. |
| **F1: preference form** | Wahab frontend | FR-01/02/08; QR-04 | Responsive form using options; labelled controls, clear GBP/time input and validation. Develop against agreed contract fixtures with explicit demo label. |
| **F2: result and states** | Wahab frontend | FR-05/06/08/09; QR-04 | Result/alternatives, cost/time/reasons/provenance; loading/no-match/error/501/retry and stale-result handling. Then connect real POST after B3. |
| **S1: integrated acceptance** | Together | FR-10; QR-03/05–07; AC-01–14 | Run checks, browser flow and rehearsal; review limitations, README, architecture, AI log and final submission instructions. Backend owns automated backend checks; Wahab owns UI checks; both explain complete flow. |

**Integration gate:** do not add P1 work until normal, changed-budget, no-match and failed-source flows work together. Keep the official Sunday 12:00 UK code freeze as the hard deadline; leave a protected rehearsal/documentation period beforehand.

## 9. Assumptions and open questions

| ID | Assumption or question | Handling |
| --- | --- | --- |
| **A-01** | Full attendance, return to the same origin, one user and one activity adequately tell the MVP story. | Chosen product simplification; explain in demo. Validate with Wahab before expanding scope. |
| **A-02** | Single GBP currency, one configured local demo day and fixed estimated travel durations are adequate. | Does not establish real-world route/schedule validity. No overnight or live-traffic claims. |
| **A-03** | The verified opening slides permit self-built mock APIs and static datasets behind a service. The team chooses independently shaped event/travel mock feeds for this prototype. | Demonstrate that both feeds materially affect the result; do not describe them as two independent live providers. Follow any later confirmed sponsor instructions. |
| **A-04** | Budget/time/interest are sufficient personalisation for the demo; interest mismatch is allowed as an alternative. | Team decision, not an official scoring guarantee. Use explicit explanations. |
| **A-05** | No actual student/user research or usability validation is recorded yet. | Present as a prototype hypothesis, not a validated market need. |
| **A-06** | Judging format, exact demo duration and final submission details remain subject to official clarification. | Prepare a short adaptable demo; follow confirmed announcements. |
| **A-07** | Team intends AI Level 4; exact models/plans, actual manual edits and final classification are not yet fully recorded. | Keep factual running logs and report the actual process. |
