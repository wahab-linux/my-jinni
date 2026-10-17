# Frontend development prompt / 前端开发提示词

Wahab can copy **one** language version into an AI session at his checkout. Both versions request the same work. Follow the early integration checkpoints in `docs/TASKS.md`; do not wait for a polished UI before trying the real API.

Wahab 在自己的仓库副本 AI 会话中复制**一种**语言即可。两版任务相同；按 `docs/TASKS.md` 尽早联调，不等界面打磨完成。

## 中文提示词

你正在 `wahab-linux/my-jinni` 开发 AfterClass，参加 DYHTG 2026 BlackRock challenge。我是 Wahab，负责前端；队友负责后端。请分阶段完成可操作界面、实际联调和异常状态，不要重新选题，也不要只给设计方案。

先阅读 `AGENTS.md`、`docs/REQUIREMENTS.md`、`docs/PROJECT_PLAN.md`、`docs/API.md`、`docs/TASKS.md`、`docs/openapi.json` 和 `web/fixtures/`。有效推荐请求目前可能仍返回明确 501；先用显式样例模式开发，但正常模式必须接真实 API。

### 产品边界与协作

- 产品服务于有预算/时间/兴趣约束的人。学生课后活动是首个 MVP 场景，不能把界面和 API 写成只能学生使用。品牌仍用 AfterClass，初始默认可以校园，但起点/日期必须读配置。
- 使用现有 HTML/CSS/原生 JavaScript，主要修改 `web/index.html`、`web/styles.css`、新增 `web/*.js` 和资源。不编辑 `app/`、后端测试、共享 fixture、契约或依赖；必要变更先协调。不能添加登录、地图、聊天、支付、数据库、新框架或任意场景平台。
- FastAPI 已提供 `/`、`/static/`、`/fixtures/`；资源用 `/static/...`，API 用相对 URL，保留 `uv run python -m app` 一条命令启动。
- 以 v0.2 为准：返回时间字段为 `return_at`，显示“Return to starting point / Back by”等通用措辞，不依赖 `back_on_campus_at`。金额为整数便士，统一 `data/error/warnings` 包装。
- 如可用子代理，可把独立的金额/时间辅助模块或只读可访问性审查交给一个代理；先约定文件归属。协调代理负责页面和请求状态；不要让多个代理并发编辑同一文件。

### Stage 1：最小页面和第一轮真接口联调，约 45–60 分钟

对应 `T1-F` 和 `T1-I`（F1 及首次联调）：

1. 调用 `GET /api/v1/options`，读取 `origins[{id,label}]`、`supported_dates`、`demo_date`、`timezone`、`max_budget_pence`、兴趣和 `default_request`。`demo_date` 只是默认日期；不再读取旧单一 `origin_id/origin_label`。选项加载失败需明确提示和重试，不能显示不可用的提交表单。
2. 做一个简单完整表单：可选起点、支持日期、预算（GBP）、出发时间、最晚返回时间、至少一个兴趣。使用服务器默认值，标签和按钮用清楚短英文。日期目前只有一个也仍来自 options，不能在 JavaScript 写死校园或演示日。
3. 校验英镑金额最多两位小数，精确转整数便士，拒绝科学计数法/负数/超出 `max_budget_pence`。输出带 UTC offset 的 ISO 时间，不能直接依赖浏览器时区。当前只有一个支持日期，可用该日期的 `default_request` 偏移；不能把 `+01:00` 当成任意日期的通用规则。若未来配置加入其他日期，须先支持可测试的 `options.timezone` 转换或协调日期偏移元数据。
4. 正常模式真实 `POST /api/v1/recommendations`。先展示一个推荐卡：名称、总价、活动时间、到达/返回时间、理由与来源，持续显示“Simulated demo data”。真实 501 显示“Recommendation engine is not ready yet”，不能偷换成功样例。
5. 前端可在显式 `?demo=success|empty|error` 模式读取样例，持续显示“Campus fixture preview — not calculated”。默认模式不能自动回退到样例。error 文件通过静态服务以 200 读取，但代表真实 503 状态。
6. 尽快交付第一轮联调，不等视觉打磨：后端准备好后，在同一已同步提交上用默认请求看到 `event-board-games`、£5、18:15 返回；预算 £4 看到 `event-music`。用浏览器 Network 检查字段和单位；记录实际接口状态与问题，然后继续 Stage 2。

### Stage 2：完整状态、可访问性与交付

对应 `T2-F`、`T2-I` 和 `T3`（F2/S1）：

1. 首选卡片补全门票＋往返交通＝总价、地点、类别、起止时间、到达/返回与推荐理由；最多两个备选。按 `Europe/London` 显示时间，以 GBP 两位小数显示金额。交通费本身就是往返，不再乘二。
2. 覆盖初始、选项加载失败、提交加载、成功、无结果、422、502、503、501、网络失败状态。区分正常无结果和系统错误；展示可操作错误、warnings、来源与模拟标记，不泄露原始堆栈。
3. 防止重复提交、过期响应覆盖新结果；失败时清除旧推荐或清楚标记旧结果；保留输入以便重试。选项尚未加载、兴趣为空、时间倒置时禁止无效提交并给明确提示。
4. 起点来自 `options.origins`。切换 `glasgow-city-centre` 后发送其 ID，返回时间文字仍通用。展示 travel 来源的 `origin_id` 或可读名称以便核对，不沿用“返校”字段/文案。前端不自行进行推荐或假造交通数据。
5. 做清楚、有品牌层级的响应式界面；检查桌面与约 390px 宽。所有字段有 label，异步状态有 aria-live，错误易读、键盘可操作、焦点明显。优先完整流程与可读性，再做视觉细节。
6. 验证预算 £0/£4/£10、没有兴趣、非法/反向时间、全部样例状态、真实源失败、初始 501、请求过期/重复点击。后端可用后验证真实默认/£4/£0和第二起点，确认响应确实发生变化。若某失败只通过注入 transport 或样例检查，报告时写明。
7. 可给真正存在风险的金额/时间辅助函数写轻量测试，不引入沉重构建流程。执行项目要求的 `uv run ruff check .`、`uv run ruff format --check .`、`uv run pytest`；浏览器验证需单独报告，不能用 Python 检查代替。
8. 协调补充 README 使用说明、demo步骤和 `docs/AI_USAGE.md`。记录实际工具/模型、AI生成内容、真实人工决定/修改及检查；人工审核、修改和最终 AI 等级尚未发生的部分标待做，不能代人声称完成。

交付时说明各阶段改动文件、实际浏览器/命令检查、真实 API 或样例模式的区别、剩余问题，以及我需要亲自读懂的金额/时间转换、请求状态和渲染代码。使用清晰的小提交，Git 操作沿用当前会话授权，不强推或改写队友历史。

## English prompt

You are developing AfterClass in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I am Wahab and own the frontend; my teammate owns the backend. Deliver an interactive UI, real integration, and failure states in stages. Do not choose a different product or stop at a design proposal.

Read `AGENTS.md`, `docs/REQUIREMENTS.md`, `docs/PROJECT_PLAN.md`, `docs/API.md`, `docs/TASKS.md`, `docs/openapi.json`, and `web/fixtures/` first. Valid recommendation requests may still return an explicit 501. Use an explicit fixture mode during development, but normal mode must call the real API.

### Product boundary and collaboration

- The product serves people with budget, time, and interest constraints. Student life after class is the first MVP scenario, not a student-only API/UI restriction. Keep the AfterClass brand and campus defaults, but read origins/dates from configuration.
- Use existing HTML/CSS/vanilla JavaScript. Own `web/index.html`, `web/styles.css`, new `web/*.js`, and assets. Do not edit `app/`, backend tests, shared fixtures, contracts, or dependencies without coordination. Do not add accounts, maps, chat, payments, a database, a new framework, or an arbitrary-scenario platform.
- FastAPI serves `/`, `/static/`, and `/fixtures/`. Use `/static/...` for assets, relative API URLs, and retain `uv run python -m app`.
- Use the v0.2 field `return_at` and general UI wording such as “Return to starting point” or “Back by”; do not depend on `back_on_campus_at`. Preserve integer pence and the `data/error/warnings` envelope.
- Where subagents are available, assign an isolated money/time helper module or read-only accessibility review with explicit file ownership. The coordinating agent owns the page and request states; do not have agents edit the same files concurrently.

### Stage 1: minimum page and first real integration, approximately 45–60 minutes

This covers `T1-F` and `T1-I` (F1 and first integration):

1. Fetch `GET /api/v1/options` for `origins[{id,label}]`, `supported_dates`, `demo_date`, `timezone`, `max_budget_pence`, interests, and `default_request`. `demo_date` is only a default. Do not read the obsolete singular `origin_id/origin_label`. An options-loading failure needs a clear message and retry, not an unusable submission form.
2. Build a complete simple form for origin, supported date, budget in GBP, departure time, return deadline, and at least one interest. Use server defaults and short English labels/buttons. Even if only one date is supported, read it from options rather than hardcoding a campus or date in JavaScript.
3. Validate money to at most two decimal places and convert precisely to integer pence; reject scientific notation, negatives, and values over `max_budget_pence`. Send ISO timestamps with UTC offsets, independent of browser timezone. The current single supported date may use the corresponding offset in `default_request`; do not treat `+01:00` as correct for arbitrary dates. Future additional dates require tested conversion for `options.timezone` or coordinated date-offset metadata.
4. In normal mode POST to the real `/api/v1/recommendations`. Start with one card showing title, total cost, event/arrival/return times, reasons, and sources. Keep “Simulated demo data” visible. Show a real 501 as “Recommendation engine is not ready yet”; never substitute a success fixture.
5. You may offer explicit `?demo=success|empty|error` fixture modes with a persistent “Campus fixture preview — not calculated” label. Normal mode must not fall back to fixtures. The static error file is fetched with HTTP 200 but represents a real 503 response.
6. Deliver the first integration before visual polishing: on the same synchronised revision, verify the real default request returns `event-board-games`, £5, and 18:15 return; £4 returns `event-music`. Inspect Network for correct fields/units. Record actual API status and issues, then continue Stage 2.

### Stage 2: complete states, accessibility, and handoff

This covers `T2-F`, `T2-I`, and `T3` (F2/S1):

1. Complete the recommendation card with ticket + return travel = total, venue, category, event times, arrival/return, and explanations; show at most two alternatives. Display times in `Europe/London` and GBP with two decimals. Travel fare already includes the return journey.
2. Handle initial, options-loading failure, submitting, success, no match, 422, 502, 503, 501, and network-error states. Distinguish a successful no-match search from a system error. Show actionable errors, warnings, provenance, and simulation labels without raw stack traces.
3. Prevent duplicate submissions and stale responses overwriting newer results. Clear old results on failure or clearly mark them stale; preserve inputs for retry. Block invalid submission before options load, without interests, or with reversed times and explain the issue.
4. Populate origins from `options.origins`. Selecting `glasgow-city-centre` sends that ID, with general return wording. Display the travel source's `origin_id` or readable label for verification; do not retain campus-only fields/copy. Do not calculate recommendations or invent travel in the frontend.
5. Build a clear branded responsive page and check desktop and approximately 390px widths. Use labels, aria-live async status, readable errors, keyboard support, and visible focus. Prioritise a complete readable flow before visual polish.
6. Check £0/£4/£10, missing interests, malformed/reversed times, every fixture state, real source failure, initial 501, stale responses, and repeat clicks. Once the backend works, verify real default/£4/£0 and second-origin requests produce actual changed results. State explicitly if a failure was checked only with an injected transport or fixture.
7. Lightweight tests for genuine money/time helper risks are welcome; do not add a heavy build pipeline. Run the required `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Report browser checks separately; Python checks do not verify the UI.
8. Coordinate README instructions, demo steps, and `docs/AI_USAGE.md`. Record actual tools/models, AI-generated work, human decisions/edits, and checks. Mark unperformed human review, editing, and final AI-level decisions as outstanding rather than claiming them.

Report files changed in each stage, actual browser/command checks, the distinction between live API and fixture previews, remaining issues, and the conversion/request-state/rendering code I should personally understand. Keep small clear commits, follow the session's Git authorisation, and do not force-push or rewrite a teammate's history.
