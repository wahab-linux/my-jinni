# Backend development prompt / 后端开发提示词

Copy **one** language version into the backend owner's AI session at this repository root. Both versions request the same work. Read `docs/TASKS.md` for the integration checkpoints. This prompt is an implementation assignment, not evidence that the engine is complete.

在后端负责人的仓库根目录 AI 会话中复制**一种**语言版本即可。两版任务相同；联调检查点见 `docs/TASKS.md`。这是开发任务，不能据此宣称引擎已完成。

## 中文提示词

你正在 `wahab-linux/my-jinni` 开发 AfterClass，参加 DYHTG 2026 BlackRock challenge。我负责后端，Wahab 负责前端。请实施以下有验收条件的小任务，先交付首个可运行闭环，再补全规则和异常。不要只返回计划，不要重新选题。

先阅读 `AGENTS.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`、`docs/API.md`、`docs/TASKS.md`、`docs/openapi.json`、`app/schemas.py`、`app/scenario.py`、`data/` 和 `web/fixtures/`。若文档与代码不一致，先报告具体差异并协调共享契约，不能猜字段。

### 产品边界与协作

- AfterClass 是有预算、时间和兴趣约束的活动选择工具。学生课后活动是首个 MVP 场景，**学生身份不是推荐算法的前提**。不要求学生账号、学号或校园位置。
- 分开三层：体验层是 `web/` 界面；决策层只接收规范化活动、当前起点的交通和偏好；数据集成层获取并适配两个 feed。FastAPI 应用编排负责接口、场景校验和三层组装，不另建服务。决策层不导入 FastAPI，不访问 HTTP/文件，不硬编码校园、固定日期或页面文字。
- `app/scenario.py` 配置当前支持的起点/日期和预算上限，应用层据此拒绝不支持的请求；通用请求模型只约束结构、单位和带时区时间先后。当前提供校园和 `glasgow-city-centre` 两个演示起点，仍只有一个支持日期。保留学生默认值，但不能把默认值写成算法限制。
- 这只是可配置的活动推荐工具；不为未来场景建设账户系统、数据库、任意领域插件平台、地图、支付、爬虫、机器学习或运行时 LLM。
- 主要修改 `app/`、`data/`、`tests/`、`scripts/`，使用现有 Python/FastAPI/httpx/Pydantic/uv。保留 `uv run python -m app` 一条命令启动。
- Wahab 拥有 `web/` 实现。`app/schemas.py`、`docs/API.md`、`docs/openapi.json`、`web/fixtures/`、依赖和共享文档先协调再改。已有 v0.2 契约使用 `return_at`，不再使用 `back_on_campus_at`；金额、其余请求字段和 `data/error/warnings` 包装保持不变。
- 如可用子代理，把数据适配和纯引擎拆成明确文件归属的小任务，协调代理负责接口组装与联调；不要让多个代理同时修改同一文件。读现有实现再分配，不重复队友工作。

### Stage 1：最小真实闭环，约 45–60 分钟

对应 `docs/TASKS.md` 的 T1-B（完成 B1/B2/B3 的正常路径），输入为已冻结的 v0.2 契约、两个 mock feed、默认请求。当前有效请求仍明确返回 HTTP 501；这是骨架状态，不能用成功 fixture 冒充计算结果。

1. 建立简单的规范化活动/交通/偏好模型和纯计算函数。使用现有默认数据，先实现正常路径的两源获取、精确金额转换、按地点关联、三项可行性筛选和确定性排序，不增加产品功能。
2. 注入 `httpx.AsyncClient`，通过 `/mock/events` 与 `/mock/travel?origin_id=<当前请求起点>` 获取两源；同进程 mock 使用 `ASGITransport`，不绑定硬编码端口。核对交通 feed 的 `data.origin_id` 与请求一致，禁止换起点后复用校园交通。
3. 票价从 GBP 字符串经 `Decimal` 精确转成整数便士；往返交通费已经含返程，不乘二。用带时区时间计算：总价 `<= budget_pence`，`depart_at + outbound_minutes <= starts_at`，`ends_at + return_minutes <= return_by`。等于边界允许。
4. 排序为兴趣匹配降序、总价升序、往返分钟升序、活动 ID 升序。返回一个首选、最多两个备选和由实际事实生成的理由；返回时间字段用 `return_at`。
5. 将推荐路由接到实际计算，在确实可用后把 health 的 `recommendations_ready` 改为 true。把 `tests/test_contract.py` 中仅断言 501/ready=false 的骨架测试替换为业务断言；不能为了保留旧测试继续返回 501，也不能删除其他有用的契约检查。
6. 立刻交付联调：启动应用，真实 POST 默认请求应选 `event-board-games`，总价 500 便士，`return_at=2026-10-20T18:15:00+01:00`；预算改为 400 应选 `event-music`。告知 Wahab 实际状态、启动命令和请求示例，约定 `T1-I` 联调。确认契约未改，然后继续 Stage 2，不等待前端所有视觉工作完成。

Stage 1 只说明正常链路已运行；此时不能声称异常、完整测试或提交材料已完成。未完成项必须显式列出。

### Stage 2：规则、异常、通用场景验证与交付

对应 `T2-B`、`T2-I`、`T3`（补齐 B1/B2，完成 B3/S1）：

1. 缺失/不可用交通排除该活动；未知金额/耗时不能按零。预算 0 在默认时间窗应返回 HTTP 200、`recommended: null`、空备选。交通费与去/返程耗时必须分别验证。
2. 安全可跳过的个别坏记录附 `INVALID_RECORD_SKIPPED`；缺交通使用 `MISSING_JOURNEY`。整源结构无效、重复 ID 造成关联歧义、非空 feed 全为坏记录或交通返回错误起点，按契约返回 502 `INVALID_SOURCE_DATA`。合法空列表是正常无结果。
3. 两个源都设可测试的有界超时/失败处理。必需源失败/超时返回 503 `SOURCE_UNAVAILABLE`，不返回陈旧或固定推荐，不用警告掩盖整源失败。不要向响应暴露堆栈。
4. 保留严格非负便士整数、兴趣不重复、带时区时间、时间先后和未知字段校验。不支持的起点/日期和超出 `options.max_budget_pence` 的预算由场景应用层返回统一 422；模型与纯引擎不能绑定演示日或预算上限。所有实际成功响应保留来源/时间、`SIMULATED_DATA` 和模拟标记；travel 来源记录当前 `origin_id`。
5. 单元测试覆盖预算/去程/返程等于边界与刚刚越界、兴趣排序和每级同分排序、无结果、缺交通、无效记录。集成测试真实走两条 mock HTTP 路由，分别改变活动价格和交通费用/耗时，证明两源都影响结果；另测源失败、无效数据和起点不匹配。注入 transport，测试不依赖互联网或 sleep。
6. 用 `glasgow-city-centre` 实际请求对应交通源；验证相同活动的费用/到达或返回时间来自该起点的数据，并与校园不同。市中心到 `venue-west` 去程 35 分钟，默认 16:00 出发赶不上 16:30 桌游，不能沿用校园 15 分钟路线把桌游判可行。再给纯引擎传入非校园起点和另一日期的合成有效数据，证明规则不依赖学生/演示日；这不代表 MVP 已提供该日期的真实数据。
7. 若只更新实现状态，可同步移除 OpenAPI 中的 501 骨架描述，运行 `uv run python -m scripts.export_openapi` 并检查差异。业务字段有变更需先协调，不能绕过共享契约。
8. 执行 `uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`；实际启动后检验默认、£4、£0、第二起点。与 Wahab 联调默认成功、结果变化、无结果、失败重试。
9. 协调更新 README/架构取舍和 `docs/AI_USAGE.md`：记录真实工具/模型、AI 生成内容、实际人工决定/代码修改和验证。用户已选择产品和后端分工；算法批准、人工读代码/修改和最终 AI 等级仍需按实际发生填写，不能代为声称已审核。

交付时报告：各阶段改动文件、实际命令与结果、实际联调结果、未完成项、局限，以及我需要亲自阅读和解释的适配器、可行性规则和排序代码。使用清晰的小提交，Git 操作沿用当前会话授权，不强推或改写队友历史。

## English prompt

You are developing AfterClass in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I own the backend; Wahab owns the frontend. Implement the bounded tasks below, delivering a working vertical slice first and then completing rules and failure handling. Do not stop at a plan or choose a different product.

Read `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/PROJECT_PLAN.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json`, `app/schemas.py`, `app/scenario.py`, `data/`, and `web/fixtures/` first. Report concrete discrepancies before coordinating shared-contract changes; do not guess fields.

### Product boundary and collaboration

- AfterClass chooses activities under budget, time, and interest constraints. Student life after class is the first MVP scenario; **student identity is not an algorithm requirement**. No student account, student ID, or campus-only location is needed.
- Keep three layers: experience is the `web/` UI; decision receives normalised activities, travel for the requested origin, and preferences; integration fetches and adapts both feeds. FastAPI application orchestration handles the API, scenario validation, and layer assembly without an additional service. The decision layer must not import FastAPI, use HTTP/files, or hardcode a campus, demo date, or UI copy.
- `app/scenario.py` configures supported origins/dates and the budget cap; application validation rejects unsupported requests. The general request model validates structure, units, aware times, and ordering. The current demo offers campus and `glasgow-city-centre`, with one supported date. Keep student defaults without making them algorithm restrictions.
- Build a configurable activity tool, not accounts, a database, an arbitrary-domain plugin platform, maps, payments, scraping, machine learning, or a runtime LLM.
- Own `app/`, `data/`, `tests/`, and `scripts/`. Use the existing Python/FastAPI/httpx/Pydantic/uv stack and retain `uv run python -m app`.
- Wahab owns frontend implementation in `web/`. Coordinate changes to `app/schemas.py`, `docs/API.md`, `docs/openapi.json`, `web/fixtures/`, dependencies, and shared documentation first. The v0.2 contract uses `return_at`, replacing `back_on_campus_at`; preserve units, remaining request fields, and the `data/error/warnings` envelope.
- Where subagents are available, delegate adapters and the pure engine as bounded tasks with explicit file ownership; retain API wiring and integration with the coordinating agent. Do not have agents edit the same files. Inspect existing work before assigning tasks and avoid duplicating the teammate's work.

### Stage 1: a real minimum vertical slice, approximately 45–60 minutes

This is `T1-B` in `docs/TASKS.md` (normal paths of B1/B2/B3), using the agreed v0.2 contract, both mock feeds, and the default request. Valid requests currently return an explicit HTTP 501. That is a scaffold state; never present the success fixture as a calculated result.

1. Define simple normalised activity/travel/preference models and a pure calculation function. Implement the normal path: fetch both feeds, convert money precisely, join venues, apply all three feasibility rules, and rank deterministically. Do not add product features.
2. Inject `httpx.AsyncClient` and call `/mock/events` and `/mock/travel?origin_id=<requested origin>`. Use `ASGITransport` for same-process feeds instead of a hardcoded port. Check that travel `data.origin_id` matches the request; never reuse campus travel after changing the origin.
3. Convert GBP price strings with `Decimal` to integer pence. Travel fare already includes the return journey. Use aware datetimes and require total cost `<= budget_pence`, `depart_at + outbound_minutes <= starts_at`, and `ends_at + return_minutes <= return_by`. Equality is allowed.
4. Sort by interest match descending, total cost ascending, total travel minutes ascending, then event ID ascending. Return one recommendation, up to two alternatives, and explanations from actual facts. Use `return_at` for the return timestamp.
5. Wire the actual engine into the endpoint and set health's `recommendations_ready` to true only when it works. Replace scaffold-only 501/ready=false assertions in `tests/test_contract.py` with business assertions; do not preserve the stub to satisfy obsolete tests or remove useful contract checks.
6. Deliver integration immediately: start the app and POST the default request. It should select `event-board-games`, cost 500 pence, and have `return_at=2026-10-20T18:15:00+01:00`; budget 400 should select `event-music`. Give Wahab the real status, startup command, and example request for `T1-I`. Confirm the contract is unchanged, then continue Stage 2 without waiting for every visual improvement.

Stage 1 proves only the normal flow. Explicitly list unfinished error handling, tests, and submission work; do not claim full completion.

### Stage 2: rules, failures, scenario independence, and handoff

This covers `T2-B`, `T2-I`, and `T3` (finish B1/B2 and complete B3/S1):

1. Exclude missing/unavailable travel; unknown cost or duration is never zero. Budget 0 in the default window returns HTTP 200 with `recommended: null` and no alternatives. Validate return fare and outbound/return durations separately.
2. Safely skippable malformed records produce `INVALID_RECORD_SKIPPED`; missing travel uses `MISSING_JOURNEY`. Invalid feed structure, ambiguous duplicate IDs, a nonempty feed with no valid records, or a travel feed for the wrong origin produce 502 `INVALID_SOURCE_DATA`. Structurally valid empty lists are normal no-match cases.
3. Implement testable bounded timeouts/failures for both sources. A required feed failure/timeout is 503 `SOURCE_UNAVAILABLE`; do not substitute stale/fixed recommendations or conceal a feed failure with a warning. Do not expose stack traces.
4. Preserve strict nonnegative integer pence, distinct interests, aware times, ordering, and extra-field validation. Application scenario validation returns the shared 422 error for unsupported origins/dates or a budget over `options.max_budget_pence`; general models and the pure engine must not be bound to the demo day or budget cap. All successful calculated responses retain provenance/timestamps, `SIMULATED_DATA`, and simulation labels; travel provenance records the requested `origin_id`.
5. Unit-test equality and just-over boundaries for budget/outbound/return; interest ranking and every tie-breaker; no match; missing travel; malformed records. Integration tests must use both actual mock HTTP routes and independently change event prices and travel costs/durations to prove both feeds affect results. Also test source failure, invalid data, and origin mismatch. Inject transports; do not depend on Internet access or sleeps.
6. Request `glasgow-city-centre` and verify the same activity's cost/arrival or return uses that origin's travel and differs from campus. The city-centre journey to `venue-west` takes 35 minutes outbound, so leaving at 16:00 misses the 16:30 board-game start; do not reuse the campus 15-minute route. Separately give the pure engine synthetic valid data for a non-campus origin and another date to prove it does not depend on students or the demo day. This does not claim that the MVP supplies data for that date.
7. You may update implementation status, remove the 501 scaffold description, and run `uv run python -m scripts.export_openapi`; inspect the diff. Coordinate business-field changes before editing the shared contract.
8. Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Start the app and check default, £4, £0, and the second origin. Integrate with Wahab for success, changed results, no match, and failure/retry.
9. Coordinate README/architecture trade-offs and `docs/AI_USAGE.md` updates. Record actual tools/models, generated work, human decisions/edits, and checks. The user chose the product and backend role; human approval of rules, code review/edits, and the final AI level must reflect what actually happens. Never claim review on the humans' behalf.

Report files changed in each stage, actual commands/results, actual integration outcomes, outstanding work, limitations, and the adapter/feasibility/ranking code I should personally read and explain. Keep small clear commits, follow the session's Git authorisation, and do not force-push or rewrite a teammate's history.
