# AfterClass requirements / 需求拆分

This document is the product and acceptance baseline, not a claim of completed functionality. It describes application behaviour without defining final JSON field names. Coordinated field definitions live in `docs/API.md`, `app/schemas.py`, `docs/openapi.json`, and `web/fixtures/`.

本文是产品与验收基线，不代表功能已完成，也不单独定义最终 JSON 字段。具体字段由 `docs/API.md`、`app/schemas.py`、`docs/openapi.json` 和 `web/fixtures/` 协同维护。

## 1. Decisions and implementation status / 决策与实现状态

- **Confirmed by the team:** build AfterClass; roXy owns the backend; Wahab owns the frontend; students are the MVP audience, not the boundary of the architecture. / **团队已确认：**开发 AfterClass；roXy 负责后端，Wahab 负责前端；学生是 MVP 人群，不是架构边界。
- **Selected MVP:** a person chooses one activity using budget, available time, and interests, combining event and travel feeds. Return to the same selected origin is the first-version journey model. / **本次 MVP：**根据预算、可用时间和兴趣，整合活动与交通数据，帮助一个人选择一项活动；第一版从同一所选起点出发并返回。
- **Current scaffold, inspected 2026-10-17:** source endpoints, schemas, fixtures, and contract tests exist; the recommendation endpoint deliberately returns HTTP 501. A fixture result, a passing scaffold test, or a mock feed is not a completed recommendation engine. / **2026-10-17 检查的骨架现状：**已有数据源接口、模型、样例和契约测试；推荐接口仍明确返回 501。固定成功样例、骨架测试通过、源接口可用，都不代表推荐引擎完成。
- **Pending implementation:** actual source adaptation, calculated filtering/ranking, integrated UI behaviour, and the business acceptance scenarios below. Leave their completion unchecked until verified. / **待实现：**实际数据适配、筛选排序、完整界面联调及下文业务验收；验证前不得标为完成。
- **Evidence boundary:** this document adds team product choices and implementation requirements. It does not establish new official sponsor rules. Recheck the opening-ceremony material and later notices for submission/assessment requirements. / **证据边界：**本文新增的是团队产品决策和实现要求，不新增官方规定；提交及评分要求仍以开幕式材料与后续通知为准。

## 2. Product and configurable MVP / 产品与可配置 MVP

**Product promise:** help a person answer “What can I realistically do in this time window and budget, and why is it a good fit?” A recommendation is only as reliable as its source data and simplified travel assumptions.

**产品承诺：**帮助用户回答“在这段时间和预算内，我实际能参加什么，为什么适合我？”推荐可信程度受数据质量与简化交通假设限制。

**Primary user story:** As a person with a starting location, departure time, return deadline, budget, and interests, I want a feasible activity and a few alternatives with understandable cost and timing so I can choose confidently.

**通用用户故事：**我有出发地点、可出发时间、返回截止、预算和兴趣，希望获得一个可行活动及少量备选，并看懂费用和时间，从而作出选择。

**Student MVP story:** A Glasgow student has time after class, starts and returns at the main campus, and wants an affordable activity. This is an example configuration of the same product. The system does not require student status, university membership, or an account.

**学生 MVP 故事：**格拉斯哥学生课后有空，从主校区出发并返回，想找负担得起的活动。这是通用产品的一套示例配置；系统不要求学生身份、学校成员资格或账号。

| Concern / 事项 | General core / 通用核心 | Student demo configuration / 学生演示配置 |
| --- | --- | --- |
| Person / 用户 | Preferences and constraints; no student identity model. / 偏好与约束，不建立学生身份模型。 | Student-oriented copy and default interests. / 面向学生的文案与默认兴趣。 |
| Location / 地点 | An origin ID and label supplied through configuration and travel data; return to that origin. / 起点 ID 与名称来自配置和交通数据；返回该起点。 | Glasgow main campus is the student default; Glasgow city centre is a second simulated origin demonstrating the same flow for other people. / 学生默认格大主校区；另提供格拉斯哥市中心模拟起点，证明其他用户使用同一流程。 |
| Date and timezone / 日期与时区 | Aware timestamps and a configured supported date/window and display timezone. The pure decision rules have no fixed demo-date constant. / 时间带时区；支持日期/时间窗及显示时区由配置提供；纯决策规则不写死演示日期。 | One fictional demo day and `Europe/London`, consistently used across fixtures and options. / 一天虚构演示数据，统一使用伦敦时区。 |
| Events and journeys / 活动与交通 | Normalised event and journey records, joined by location ID. / 规范化活动与交通记录，按地点 ID 关联。 | Eight fictional events and four fictional destinations are sufficient. / 8 个虚构活动、4 个虚构目的地即可。 |
| Money / 金额 | Integer pence; GBP only in this release. / 整数便士；本版只支持 GBP。 | Student-scale budget defaults; configurable limits. / 面向学生的默认预算，限额来自配置。 |

Generality means separating data/configuration from rules. It does **not** mean building a profile platform, arbitrary-city search, multi-currency engine, or every transport mode during the hackathon. Both configured origins reuse the same screen and activity model; the city-centre demo needs only a small simulated travel fixture, not a second product. A synthetic date-change test also checks that the decision engine has no fixed-date dependency.

通用化的含义是分开配置、数据和决策规则。本次不开发用户画像平台、任意城市搜索、多货币引擎或所有交通方式。两个配置起点复用同一页面和活动模型；市中心只需少量模拟交通记录，不另做产品。另用合成日期变更测试检查决策引擎没有固定日期依赖。

## 3. Scope and priorities / 范围与优先级

| Priority / 优先级 | Scope / 范围 | Exit condition / 完成标准 |
| --- | --- | --- |
| **P0: complete flow / 完整流程** | Configured options → preference form → two actual mock HTTP feeds → normalisation/join → feasibility/ranking → recommendation and reasons. / 配置选项→偏好表单→实际调用两套 mock HTTP 源→规范化关联→筛选排序→推荐与理由。 | Both sources materially affect the calculated answer; the browser uses the real API. / 两个源都实际影响计算结果，浏览器调用真实 API。 |
| **P0: honest failures / 真实失败处理** | Validation, no match, missing/invalid records, source failure, loading and retry. / 请求校验、无结果、缺失/无效记录、源失败、加载与重试。 | Every outcome has a distinguishable API/UI state; no hidden fixture fallback. / 各状态可区分，不静默用成功样例替代失败。 |
| **P0: delivery / 可交付** | Tests, contract parity, one-command startup, README/architecture/trade-offs, factual AI log and a short demo. / 测试、契约一致、一条命令启动、README/架构/取舍、真实 AI 记录和简短演示。 | Acceptance scenarios pass and both teammates can explain the flow. / 验收场景通过，两人都能解释完整流程。 |
| **P1: only after P0 / P0 后再做** | Better visual polish, richer rejection summaries, additional configured origins beyond the two demo cases, explicit fixture demo selector. / 视觉优化、更详细排除原因、两个演示起点之外的额外配置、明确的样例演示切换。 | No contract break or loss of test/demo time; team agrees. / 团队同意，且不破坏契约、不挤占测试演示时间。 |
| **Deferred / 延期** | Live providers, arbitrary geocoding, maps, transport schedules/routing, different return destination, multi-activity itineraries, overnight windows, group planning, accounts, database, payments, scraping, runtime LLM, multi-currency and production deployment. / 实时源、任意地址解析、地图、公交时刻/路径规划、不同返回地点、多活动行程、跨夜时间窗、多人规划、账号、数据库、支付、爬虫、运行时 LLM、多货币和生产部署。 | Separate future decisions; none required for this MVP. / 以后单独决策，本次 MVP 不要求。 |

## 4. Functional requirements / 功能需求

All requirements below are P0 unless marked P1. IDs are stable so code, tasks, and tests can refer to them. “Configured” permits a single supported value in the demo, without baking it into the decision algorithm.

除明确 P1 外，下列需求均为 P0。ID 用于关联任务、代码和测试。“配置化”允许演示只有一个有效选项，但不能把该值写进决策算法。

| ID | Requirement / 需求 | Evidence / 验收依据 |
| --- | --- | --- |
| **FR-01** | Supply supported origin(s), date/window, timezone, interests, currency, limits, and defaults through application options/configuration. Frontend labels/defaults derive from these values. / 应用配置与选项提供支持的起点、日期/时间窗、时区、兴趣、货币、限额及默认值；前端据此显示和初始化。 | AC-01, AC-12 |
| **FR-02** | Accept an origin, departure, return deadline, integer-pence budget and supported interests. Validate before fetching sources; show correctable input errors. / 接收起点、出发/返回截止、整数便士预算和有效兴趣；取源前校验，界面显示可修正的错误。 | AC-02 |
| **FR-03** | Fetch both independently shaped event and travel APIs, normalise them through adapters, and join event venues to available journeys for the selected origin. / 实际读取两种独立结构的活动与交通 API，经适配器规范化，按所选起点及活动地点关联可用交通。 | AC-03, AC-08, AC-09 |
| **FR-04** | Apply every hard feasibility constraint before ranking; check outbound arrival and return-to-origin separately. / 排序前应用全部硬约束；去程到达与返程回到起点分别检查。 | AC-04, AC-05, AC-06 |
| **FR-05** | Deterministically rank feasible candidates, showing one recommendation and up to two distinct alternatives; produce a valid no-match response if none qualify. / 确定性排序，展示一个首选及最多两个不同备选；没有候选时返回合法无结果。 | AC-07, AC-10 |
| **FR-06** | Explain the actual match: ticket price, return travel fare, total price, arrival/return times and interest match. Reasons must follow calculated facts, including when there is no matching interest. / 展示实际门票、往返交通费、总价、到达/返回时间及兴趣匹配；理由来自计算事实，无兴趣匹配时也如实说明。 | AC-03, AC-07 |
| **FR-07** | Preserve a single documented application contract and error envelope; static fixtures stay explicitly separate from calculated results. / 保持统一文档化接口和错误包装；静态样例与计算结果明确分开。 | AC-11, AC-13 |
| **FR-08** | Show initial, submitting, success, no-match, validation, source-error and not-yet-implemented states. Prevent stale results from being presented as a newly successful response; allow correction or retry. / 展示初始、提交中、成功、无结果、校验失败、源错误及未实现状态；不得把旧结果冒充新请求成功，支持修正或重试。 | AC-11 |
| **FR-09** | Show that both datasets are simulated, with their source names and update timestamps. Preserve warnings for excluded records/missing journeys. / 显示两套数据为模拟数据、源名称及更新时间；保留坏记录/缺失交通警告。 | AC-08, AC-09, AC-11 |
| **FR-10** | Provide reproducible startup and demo instructions plus an architecture diagram, known limitations, trade-offs, verification and factual AI-usage records. / 提供可复现启动/演示说明、架构图、局限、取舍、验证及真实 AI 记录。 | AC-13, AC-14 |

## 5. Business and data rules / 业务与数据规则

| ID | Rule / 规则 |
| --- | --- |
| **BR-01** | Total cost is ticket price plus **one return fare**. `total <= budget` is feasible; exact equality passes. Never double a fare already covering both legs. Raw GBP strings convert with `Decimal`; reject negative, non-finite or sub-penny prices rather than silently rounding. / 总价为门票加**一份往返总票价**；等于预算可行，不再乘二。英镑字符串用 `Decimal` 转便士；负数、非有限数或不足一便士精度的价格拒绝，不静默四舍五入。 |
| **BR-02** | Arrival = departure + outbound duration; arrival must be at/before event start. Return = event end + return duration; return must be at/before the deadline. Attending the full event is assumed. / 到达时间＝出发＋去程耗时，不能晚于活动开始；返回时间＝结束＋返程耗时，不能晚于截止；假设全程参加。 |
| **BR-03** | Time comparisons use aware datetimes as instants. Display uses the configured timezone; request validation applies the configured supported local date/window. No fixed date, campus ID or student identity belongs in the pure engine. / 使用带时区的时间点比较；显示和有效日期/时间窗校验使用配置。纯引擎中不写死日期、校园 ID 或学生身份。 |
| **BR-04** | Rank by interest-match descending, total cost ascending, total travel duration ascending, stable event ID ascending. Selected interests have equal priority. A feasible nonmatching event remains eligible but cannot be described as an interest match. / 排序依次为兴趣匹配优先、总价升序、往返耗时升序、稳定活动 ID 升序；兴趣同权。无兴趣匹配的可行活动仍可推荐，但不能声称兴趣匹配。 |
| **BR-05** | Unknown journey, unavailable journey, mismatched source origin or incomplete cost/time cannot establish feasibility. Unknown is never zero. Durations/fares must be nonnegative and correctly typed. / 未知/不可用交通、源起点不一致、缺失费用或耗时均不能证明可行；未知不等于零，费用耗时须类型正确且非负。 |
| **BR-06** | Each event ID is unique. Journey keys must be unambiguous for the selected origin and destination. Conflicting duplicates fail the source, rather than selecting an arbitrary record. / 活动 ID 唯一；所选起点与目的地的交通键不歧义；重复造成歧义时源报错，不任取一条。 |
| **BR-07** | Event start must precede event end; required IDs/titles/locations and known categories must be valid. A malformed individual record can be skipped with a warning if valid records remain. A nonempty feed with no valid records fails as invalid source data. / 活动开始早于结束，必要 ID/名称/地点及类别有效。若仍有有效记录，可跳过个别坏记录并警告；非空源若全无有效记录则源无效。 |
| **BR-08** | A structurally valid empty event list is a successful no-match search. A valid empty travel list or no usable journey yields no feasible activities, not fabricated travel. / 合法空活动列表是成功的无结果；合法空交通列表或无可用交通也产生无可行活动，不编造交通。 |
| **BR-09** | Required-source timeout, HTTP failure or unavailable source fails the recommendation request. Invalid top-level structure, ambiguous joins or origin mismatch fails it as invalid source data. Do not return partial recommendations without the data needed to establish feasibility. / 必需源超时、HTTP 失败或不可用使请求失败；顶层结构错误、关联歧义或起点不一致按数据无效处理；缺少证明可行的数据时不返回不完整推荐。 |
| **BR-10** | Source update timestamps are shown, not treated as proof of live/fresh information. Fixed travel durations are estimates with no traffic, wait-time, service schedule or route guarantee. / 展示更新时间，不把它当作实时/新鲜数据保证；固定耗时为估计，不保证交通、等候、班次或路线。 |

## 6. Quality and delivery requirements / 质量与交付需求

| ID | Requirement / 需求 |
| --- | --- |
| **QR-01: separation / 分层** | Experience → application orchestration → source integration + pure decision engine. Engine imports no FastAPI/frontend code and performs no file/network I/O. / 体验层→应用编排→数据整合与纯决策引擎；引擎不导入 FastAPI/前端，不读文件或请求网络。 |
| **QR-02: bounded failure / 有界失败** | Source calls have explicit finite timeout bounds; test failure paths without real sleeps or Internet. Set and document the actual timeout before handoff. / 源请求具有显式有限超时；不依赖真实等待/互联网测试失败路径；交付前记录实际超时值。 |
| **QR-03: contract consistency / 契约一致** | Runtime schemas, OpenAPI snapshot, docs, fixtures and frontend all use the same version and money/time units. Shared changes are coordinated; no silent rename. / 运行模型、OpenAPI 快照、文档、样例和前端版本/单位一致；共享修改同步，不静默改名。 |
| **QR-04: usable interface / 可用界面** | Readable on mobile and desktop; labelled controls, keyboard operation, visible focus/error messages, clear GBP/time formatting and simulated-data label. / 桌面与手机可读，表单有标签、支持键盘与明显焦点/错误，英镑与时间格式清楚，模拟标记可见。 |
| **QR-05: meaningful verification / 有效验证** | Test budget and both travel-time boundaries, ranking/ties, actual two-source integration and bad/failed sources. Scaffold-only checks are insufficient. Run required lint/format/test commands before handoff. / 测预算、去返程边界、排序/同分、实际两源整合、无效/失败源；不能只测骨架。交付前运行规定的 lint、格式与测试。 |
| **QR-06: reproducibility / 可复现** | Existing one-command startup works from documented dependency setup. Demo and core tests require no API key, external credentials or live Internet source. / 按依赖说明后可一条命令启动；演示/核心测试无需 API key、凭据或实时互联网源。 |
| **QR-07: honest AI reporting / 真实 AI 报告** | Record actual tool/model use, human decisions/edits and checks. Planned Level 4 is not a claim of final classification or completed human review. / 记录实际工具/模型、人工决策/修改和验证；计划 Level 4 不代表最终分类，也不代表人工审查已完成。 |

## 7. Executable acceptance scenarios / 可执行验收场景

All scenarios are **pending** until observed against the implemented application/tests. The baseline below is a synthetic test setup, not live event information. Substitute the configured demo day when constructing aware timestamps.

所有场景在实际实现验证前均为**待验收**。下列基线为合成测试数据，不是真实活动；时间使用已配置演示日的带时区时间。

**Baseline:** one games event A, 17:00–18:00, ticket 300p; journey 15 minutes each way, return fare 200p, available; depart 16:00, return deadline 19:00, budget 1000p, interest games. Expected total 500p, arrival 16:15, return 18:15. Event and travel fixtures are supplied through both source routes/transport in the integration test.

**基线：**桌游活动 A 为 17:00–18:00、门票 300 便士；去返程各 15 分钟、往返 200 便士且可用；16:00 出发、19:00 返回截止、预算 1000、兴趣桌游。预期总价 500、16:15 到达、18:15 返回。集成测试经两套源路由/transport 提供活动与交通数据。

| ID | Given → action → expected result / 前提→操作→预期 | Verify / 验证 |
| --- | --- | --- |
| **AC-01** | Student default config is loaded → open options/form → configured campus and city-centre origins, date, limits and timezone appear; no student login/status required. / 学生默认配置→打开选项/表单→显示配置的校园及市中心起点、日期、限额、时区，不要求学生登录/身份。 | API + browser / 接口＋浏览器 |
| **AC-02** | Submit malformed JSON, boolean/fractional/negative budget, missing offset, reversed window, unsupported origin/date/interest, duplicate interests or unknown fields → structured validation error and no calculated result. Correct the inputs → request can be resubmitted. / 提交非法 JSON、布尔/小数/负预算、无时区、倒置时间、无效配置值、重复兴趣或未知字段→明确校验错误；修正后可重新提交。 | API tests + form / 接口测试＋表单 |
| **AC-03** | Baseline → real recommendation POST → A, 500p, 16:15 arrival and 18:15 return, actual reasons and both source labels. Change only fare to 1200p → A is no longer feasible; change only event price to 1100p → also infeasible. / 基线→真实 POST→A 及正确费用/时间/两源；仅交通费改为 1200 或仅门票改为 1100，分别使 A 不可行，证明两源都参与。 | Integration / 集成 |
| **AC-04** | Baseline → budget 500p → A qualifies; budget 499p → A excluded. / 基线→预算 500 可行，499 排除。 | Unit / 单元 |
| **AC-05** | Event begins 16:30; outbound 15 min → depart 16:15 qualifies; depart 16:16 excludes A. / 活动 16:30 开始、去程 15 分钟→16:15 出发可行，16:16 排除。 | Unit / 单元 |
| **AC-06** | A ends 18:00; return 15 min → deadline 18:15 qualifies; deadline 18:14 excludes A. / 活动 18:00 结束、返程 15 分钟→截止 18:15 可行，18:14 排除。 | Unit / 单元 |
| **AC-07** | Multiple feasible candidates → matching interest wins; ties break by cost, total travel, then ID. Shuffle source order → identical result. All interests unmatched → no false match claim. More than three feasible events → only one recommendation plus at most two unique alternatives. / 多个可行活动→依次按兴趣、费用、耗时、ID；打乱源顺序结果不变；无兴趣匹配不虚构理由；超过三个可行活动仍最多返回三个不同活动。 | Unit / 单元 |
| **AC-08** | A lacks a journey or journey is unavailable → exclude A with the documented warning; missing duration is never zero. Add one safely malformed record alongside valid records → keep valid recommendations and show warning. Conflicting duplicate keys or an all-invalid nonempty feed → invalid-source error. / A 缺交通或不可用→排除并警告；缺耗时不能当零；混入一条可安全跳过的坏记录→有效推荐保留；歧义重复键或非空源全坏→数据无效错误。 | Source + API / 适配器＋接口 |
| **AC-09** | Event or travel source separately times out/fails → structured source-unavailable error; invalid top-level structure or wrong travel origin → invalid-source error. No hidden fixture/partial success; UI offers retry. / 分别模拟活动/交通源超时失败→源不可用；顶层结构或交通起点错误→数据无效；不偷偷用样例/部分成功，界面可重试。 | Integration + browser / 集成＋浏览器 |
| **AC-10** | No feasible candidates, valid empty event feed, or valid empty travel feed → successful no-match response with empty results and a clear message; it is distinguishable from failed sources. / 无可行候选、合法空活动或空交通→成功但无结果，有清晰说明，与源失败可区分。 | API + browser / 接口＋浏览器 |
| **AC-11** | Browser uses real endpoint → see loading then correct success/no-match/error. Initial 501 is shown honestly while scaffold remains. Force failure after previous success → previous result is cleared or explicitly marked stale. Any explicit fixture mode is visibly labelled and never automatic. / 浏览器真实请求→加载后正确状态；骨架 501 如实显示；上次成功后本次失败→清除旧结果或明确标旧；样例模式始终标明且不自动启用。 | Manual browser check / 浏览器人工检查 |
| **AC-12** | Select the configured city-centre origin → its travel source origin and journeys are used, and output/UI say return to that origin with no campus-specific assumption. Separately inject another supported date and consistently shifted synthetic events → same relative budget/time outcomes without decision-rule edits. / 选择市中心起点→使用对应源起点与交通记录，界面/输出表示返回该起点而非校园；另注入另一有效日期并同步平移合成活动→不改决策规则即可得出相同相对费用/时间结果。 | Config + integration test + browser / 配置＋集成测试＋浏览器 |
| **AC-13** | Clean documented setup → one command starts app → health, options, page, both feeds and real POST work; generated OpenAPI matches snapshot and fixtures validate against current schemas. Required lint/format/tests pass. / 按文档安装→一条命令启动→状态/选项/页面/两源及真实 POST 可用；OpenAPI、快照和样例一致，规定检查通过。 | Automated checks + smoke / 自动检查＋启动冒烟 |
| **AC-14** | Rehearse normal recommendation → lower-budget change → source-failure handling. Both teammates explain three layers, hard constraints, deterministic ranking and simulated-data limitations; AI record contains actual work/checks, with outstanding review explicitly noted. / 排练正常推荐→预算变化→源失败；双方能解释三层、约束、排序和模拟局限，AI 记录真实工作/检查并注明待审项。 | Team rehearsal / 团队演练 |

## 8. Work packages and ownership / 工作包与责任

Read this with `docs/PROJECT_PLAN.md` and the assigned prompt. Coordinate shared contract/dependency/documentation changes before editing them. The sequence allows parallel development without having two people edit the same implementation files.

结合项目计划与各自提示词使用。共享契约/依赖/文档先同步再改。下列顺序支持并行，避免双方同时改相同实现文件。

| Package / 工作包 | Owner / 负责人 | Requirement IDs / 需求 | Concrete output and dependency / 交付与依赖 |
| --- | --- | --- | --- |
| **S0: scope + contract / 范围与契约** | Together / 共同 | FR-01/02/07; BR-01–04; QR-03 | Agree origin/return semantics, configurable date and exact fields/errors; synchronise schema, docs, OpenAPI and fixtures. Do this before separate implementation. / 先确认起返语义、可配日期及具体字段/错误，同步模型/文档/快照/样例，再分开开发。 |
| **B1: data adapters / 数据适配器** | roXy backend / 后端 | FR-03/09; BR-01/05–10; QR-02 | Fetch and normalise both sources, preserve provenance and warnings, reject ambiguous/failed sources; source tests. Can run alongside F1 after S0. / 两源读取适配、保留来源警告、处理歧义失败及测试；S0 后与 F1 并行。 |
| **B2: pure engine / 纯引擎** | roXy backend / 后端 | FR-04/05/06; BR-01–05; QR-01/05 | Pure feasibility/ranking with fact-based reasons; budget/arrival/return/tie tests. Can begin on normalised synthetic records before B1 is finished. / 纯筛选排序、事实理由及边界/同分测试；B1 未完可先用规范化合成记录开发。 |
| **B3: application wiring / 应用联接** | roXy backend / 后端 | FR-01/02/07; QR-02/03/06 | Config-driven options and validation; wire B1+B2 into real POST, replace obsolete 501 assertions, update readiness only when implemented; source-failure/config portability integration tests. / 配置选项校验、联接真实 POST、替换旧 501 断言，真正实现后再更新 ready；源失败及配置可复用集成测试。 |
| **F1: preference form / 偏好表单** | Wahab frontend / 前端 | FR-01/02/08; QR-04 | Responsive form using options; labelled controls, clear GBP/time input and validation. Develop against agreed contract fixtures with explicit demo label. / 按选项做响应式表单、标签/金额时间/校验；可用已约定样例开发但显式标演示。 |
| **F2: result and states / 结果与状态** | Wahab frontend / 前端 | FR-05/06/08/09; QR-04 | Result/alternatives, cost/time/reasons/provenance; loading/no-match/error/501/retry and stale-result handling. Then connect real POST after B3. / 结果备选、费用时间理由来源、全部请求状态/重试/旧结果处理；B3 后接真实 POST。 |
| **S1: integrated acceptance / 联合验收** | Together / 共同 | FR-10; QR-03/05–07; AC-01–14 | Run checks, browser flow and rehearsal; review limitations, README, architecture, AI log and final submission instructions. Backend owns automated backend checks; Wahab owns UI checks; both explain complete flow. / 跑检查、浏览器与演练，核对局限/README/架构/AI 记录和提交要求；后端负责后端自动验证，Wahab 负责界面验证，双方解释完整流程。 |

**Integration gate:** do not add P1 work until normal, changed-budget, no-match and failed-source flows work together. Keep the official Sunday 12:00 UK code freeze as the hard deadline; leave a protected rehearsal/documentation period beforehand.

**联调门槛：**正常、改预算、无结果和源失败能完整运行后再做 P1。周日英国时间 12:00 停码是硬截止，之前保留不可挤占的演练/文档时间。

## 9. Assumptions and open questions / 假设与待确认项

| ID | Assumption or question / 假设或问题 | Handling / 处理 |
| --- | --- | --- |
| **A-01** | Full attendance, return to the same origin, one user and one activity adequately tell the MVP story. / 全程参加、返回同一起点、单用户单活动足以讲清 MVP。 | Chosen product simplification; explain in demo. Validate with Wahab before expanding scope. / 产品简化，演示说明；扩大前双方确认。 |
| **A-02** | Single GBP currency, one configured local demo day and fixed estimated travel durations are adequate. / 单英镑、一天配置演示及固定估计耗时足够。 | Does not establish real-world route/schedule validity. No overnight or live-traffic claims. / 不证明真实班次/路径可行，不声称跨夜或实时路况。 |
| **A-03** | The verified opening slides permit self-built mock APIs and static datasets behind a service. The team chooses independently shaped event/travel mock feeds for this prototype. / 已核对的开幕式材料允许自建 mock API 和自有服务后的静态数据；团队为本原型选择结构独立的活动与交通模拟源。 | Demonstrate that both feeds materially affect the result; do not describe them as two independent live providers. Follow any later confirmed sponsor instructions. / 验收两源实际影响推荐，不冒充两个独立实时提供方；遵循后续已确认通知。 |
| **A-04** | Budget/time/interest are sufficient personalisation for the demo; interest mismatch is allowed as an alternative. / 预算时间兴趣足够演示个性化，无兴趣匹配仍可作备选。 | Team decision, not an official scoring guarantee. Use explicit explanations. / 团队选择，不是得分保证；如实解释。 |
| **A-05** | No actual student/user research or usability validation is recorded yet. / 尚无实际学生/用户调研或可用性验证记录。 | Present as a prototype hypothesis, not a validated market need. / 作为原型假设，不声称已验证需求。 |
| **A-06** | Judging format, exact demo duration and final submission details remain subject to official clarification. / 评审方式、演示时长和完整提交细节待官方确认。 | Prepare a short adaptable demo; follow confirmed announcements. / 准备可伸缩短演示，按确认通知执行。 |
| **A-07** | Team intends AI Level 4; exact models/plans, actual manual edits and final classification are not yet fully recorded. / 团队计划 Level 4，具体模型/套餐、实际人工改动和最终等级尚未完整记录。 | Keep factual running logs and report the actual process. / 持续如实记录，最终按实际申报。 |
