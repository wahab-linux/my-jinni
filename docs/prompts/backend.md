# Backend development prompt / 后端开发提示词

Copy either the Chinese or English version into your AI coding session at the repository root. They describe the same task. Backend owner: roXy; frontend owner: Wahab.

在仓库根目录的 AI 编程会话中复制中文或英文版本即可，两版任务相同。你负责后端，Wahab 负责前端。

## 中文提示词

你正在 `wahab-linux/jinni` 仓库开发 AfterClass，参加 DYHTG 2026 的 BlackRock challenge。我负责后端，Wahab 独立负责前端。请直接完成后端实现和验证，不要重新选题。

先阅读 `AGENTS.md`、`docs/PROJECT_PLAN.md`、`docs/API.md`、`docs/openapi.json`、`app/schemas.py`、`data/` 和 `web/fixtures/`。现有项目是初始化骨架，`POST /api/v1/recommendations` 有意返回 501。你要把它替换为实际两源整合和确定性推荐。

**范围与协作**

- 使用现有 Python/FastAPI/httpx/Pydantic/uv 技术栈，保留 `uv run python -m app` 一条命令启动。
- 主要修改 `app/`、`data/`、`tests/`、`scripts/`。不要修改 Wahab 的 `web/` 实现或共享响应样例；需要改字段/依赖时先列出原因并与团队同步。
- 复用已约定请求响应字段和 data/error/warnings 包装，不静默改契约。既有 501 状态是待实现标记，完成引擎后更新 health 的 `recommendations_ready`。
- 实现保持三层：`main.py` 组装接口，`sources/` 获取并适配数据，`decision/` 纯筛选排序。决策层不导入 FastAPI、不访问网络和文件。
- 不增加登录、数据库、地图、支付、爬虫、机器学习或运行时 LLM。

**具体行为**

1. 通过两个 mock API 获取活动和交通，而不是直接返回成功样例。注入 `httpx.AsyncClient`；同进程模拟 API 可用 `ASGITransport`，不要绑定硬编码端口。为各源设置可测试的超时/异常处理，保证请求有界结束。
2. 活动票价从英镑字符串用 `Decimal` 精确转成整数便士；交通费已经是往返总价，不再乘二。统一带时区时间，按地点 ID 关联。保留来源、模拟标记和时间。
3. 过滤：总价不超过预算，去程能赶上活动开始，活动结束加返程不晚于返校截止。边界相等允许。交通缺失或 unavailable 时排除该活动，未知不能按零。
4. 排序键：兴趣匹配优先、总价升序、往返耗时升序、活动 ID 升序。返回首选及最多两个备选；解释必须由实际数据生成，不虚构理由。
5. 无结果返回 HTTP 200，recommended=null。整源超时/失败返回 503 SOURCE_UNAVAILABLE；结构无效、重复 ID 造成歧义或全为坏记录返回 502 INVALID_SOURCE_DATA。可安全跳过的个别坏记录附带警告。合法空列表按无匹配处理。不能把失败替换为固定成功响应。
6. 保留严格输入校验，处理非法 JSON、未知字段、便士类型、时区、时间先后和固定演示日期。所有成功推荐标注 SIMULATED_DATA。初始数据全部虚构。

**验证和交付**

- 单元测试覆盖预算等于边界、去程/返程等于边界、兴趣/同分排序、无结果、缺失交通、坏记录。
- 至少一个集成测试通过真实应用路由获取两个 mock feed 并返回实际推荐；另测源超时/失败和无效数据，使用可注入 transport，不依赖互联网或睡眠。
- 默认请求应首选 event-board-games，500 便士，18:15 返校；预算400应选 event-music；预算0应无结果。
- 将现有断言501和ready=false的骨架测试替换为实现后的业务断言，不要为了保留旧测试而继续返回501。
- 如果契约的业务字段未变，仅为移除 501 或更新实现说明而重新导出 OpenAPI，可更新快照并说明差异。命令：`uv run python -m scripts.export_openapi`。
- 执行 `uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`，实际启动并验证一次 POST。
- 在 `docs/AI_USAGE.md` 如实追加本次工具、任务、验证和待人工检查项；不要声称人类已审查或修改 AI 代码。
- 最后说明改动文件、验证结果、局限，以及我应该亲自阅读、解释或修改的代码位置。先简短说明对规则的理解，然后直接实施；不以只有计划作为交付。

## English prompt

You are developing AfterClass in `wahab-linux/jinni` for the DYHTG 2026 BlackRock challenge. I own the backend; Wahab independently owns the frontend. Implement and verify the backend now; keep the agreed product scope.

First read `AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/API.md`, `docs/openapi.json`, `app/schemas.py`, `data/`, and `web/fixtures/`. The current project is a scaffold: `POST /api/v1/recommendations` deliberately returns 501. Replace that stub with actual integration of both sources and deterministic recommendations.

**Scope and collaboration**

- Use the existing Python/FastAPI/httpx/Pydantic/uv stack. Preserve one-command startup: `uv run python -m app`.
- Own `app/`, `data/`, `tests/`, and `scripts/`. Do not edit Wahab's frontend implementation or shared response fixtures. Explain and coordinate schema/dependency changes before making them.
- Preserve the agreed fields and data/error/warnings envelope. Set health's `recommendations_ready` to true once the engine actually works.
- Keep three layers: API wiring, source integration/adapters, and a pure decision engine. The decision layer must not import FastAPI, perform HTTP, or read files.
- Do not add authentication, a database, maps, payments, scraping, machine learning, or a runtime LLM.

**Required behaviour**

1. Fetch events and travel through both mock APIs; never return the success fixture as a computed answer. Inject an `httpx.AsyncClient`; an `ASGITransport` can call same-process mock APIs without a hardcoded port. Use testable bounded timeouts/error handling.
2. Convert GBP ticket-price strings to integer pence using `Decimal`. Travel fare already includes the return journey. Use aware timestamps and join by venue ID. Preserve source names, timestamps, and simulated status.
3. Require total cost <= budget, arrival <= event start, and event end + return journey <= return deadline. Equality is allowed. Exclude missing/unavailable journeys; unknown values are not zero.
4. Sort by interest match descending, total cost ascending, total travel minutes ascending, then event ID ascending. Return one recommendation and up to two alternatives, with fact-based explanations.
5. No match is HTTP 200 with recommended=null. A required source failure/timeout is 503 SOURCE_UNAVAILABLE. Invalid feed structure, ambiguous duplicate IDs, or an entirely invalid nonempty feed is 502 INVALID_SOURCE_DATA. Safely skippable bad records produce warnings. Valid empty lists produce no matches. Never replace failure with a fixed success response.
6. Preserve strict request validation for malformed JSON, extra fields, pence, timezone awareness, time order, and the demo date. Successful recommendation responses carry SIMULATED_DATA. All initial source data is fictional.

**Verification and handoff**

- Unit-test equality boundaries for budget/outbound/return, interest ranking and tie-breakers, no match, missing journeys, and malformed records.
- Include an integration test using actual application routes for both mock feeds and a calculated result. Also test timeout/failure and invalid data using injectable transports, without Internet access or sleeps.
- The default request selects event-board-games, costs 500 pence, and returns at 18:15. Budget 400 selects event-music; budget 0 yields no match.
- Replace scaffold-only tests asserting 501 and ready=false with assertions for the implemented behaviour; do not retain the stub to satisfy obsolete tests.
- If business fields stay unchanged, you may regenerate the OpenAPI snapshot to reflect removing the 501 stub or updating implementation descriptions; explain the diff. Use `uv run python -m scripts.export_openapi`.
- Run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Start the app and verify a real POST.
- Append factual tool/task/check notes and outstanding human review to `docs/AI_USAGE.md`. Do not claim human review or manual editing that has not happened.
- Report changed files, actual verification results, limitations, and the code I should personally read, explain, or edit. Briefly state your understanding of the rules, then implement; do not stop at a plan.
