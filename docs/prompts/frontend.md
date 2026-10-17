# Frontend development prompt / 前端开发提示词

Copy either language version into Wahab's AI coding session at his checkout of this repository. Both versions describe the same task.

Wahab 在自己的仓库副本中复制任意一种语言版本给 AI，两版任务相同。

## 中文提示词

你正在 `wahab-linux/my-jinni` 仓库开发 AfterClass，参加 DYHTG 2026 的 BlackRock challenge。我是 Wahab，负责前端；队友负责后端，正在实现推荐引擎。请直接实现前端，不要重新选题。

先阅读 `AGENTS.md`、`docs/PROJECT_PLAN.md`、`docs/API.md`、`docs/openapi.json` 和 `web/fixtures/`。后端目前可能明确返回 501，请依据既定契约和样例独立推进，不等待后端完成。

**范围与协作**

- 使用现有 HTML/CSS/原生 JavaScript。修改范围主要是 `web/index.html`、`web/styles.css` 和新增的 `web/*.js`/资源。不要修改 `app/`、后端测试、共享 fixture 或契约，不添加需要单独构建服务的框架。
- FastAPI 已提供 `/`、`/static/` 和 `/fixtures/`。脚本样式使用 `/static/...`；API 使用相对 URL，保持 `uv run python -m app` 一条命令启动。
- 界面使用清楚简短的英文，产品名 AfterClass。只围绕一次活动选择；不加入登录、地图、聊天、支付或多页产品。

**界面与数据流程**

1. 启动时调用 `GET /api/v1/options`，读取固定演示日期、伦敦时区、起点、兴趣和默认请求。
2. 表单包含英镑预算、可出发时间、最晚返校时间、至少一个兴趣。明确写出固定演示日期和校园起点/返校点。金额严格校验最多两位小数，再精确转成整数便士；不要接受浮点误差或科学计数法作为金额。
3. 构造带 UTC offset 的 ISO 时间；固定演示日期使用 options.default_request 的 +01:00 偏移，不依赖浏览器所在时区。显示时间用 Europe/London，金额用 GBP 两位小数。
4. 提交 `POST /api/v1/recommendations`。一个突出的首选卡片展示活动、类别、地点、门票＋往返交通＝总价、活动起止、到达/返校时间和推荐理由。最多两个备选，显示来源和模拟数据标签。
5. 完成初始、加载、成功、无结果、输入422、源失败502/503、引擎未实现501、网络失败状态。显示可操作的错误和重试。防止重复提交和过期响应覆盖较新的结果；错误时清除旧推荐或明确标为旧结果。
6. 开发可支持显式 `?demo=success|empty|error`，从 `/fixtures/` 读取对应样例；该模式持续显示开发演示标记。error fixture代表503，不能当作成功。默认模式访问真实接口，真实请求失败时绝不能偷偷显示成功fixture。演示模式注明样例不是动态计算结果。
7. 移动端和电脑端都能用；表单有 label，状态有 aria-live，错误可读，键盘可操作，焦点明显。视觉统一、有自己的品牌与清楚层级。

**验证与交付**

- 验证宽屏和约390px宽屏；键盘填表；预算£0/£4/£10；没有兴趣；非法或反向时间；成功/无结果/失败样例；真实接口返回501的情况。
- 对照 `docs/API.md` 检查发送字段、便士转换、带时区时间及 error/warnings。后端可用后，用默认请求验证桌游£5、18:15返校，再改预算£4验证结果变化。
- 可添加真正覆盖金额/时间转换风险的轻量测试；不要引入沉重构建流程。
- 如实记录使用的工具、生成内容、人工决定和实际验证；与队友协调更新 `docs/AI_USAGE.md`。不要声称尚未发生的人工审查。
- 最后列出改动、实际检查、剩余问题，以及需要我亲自读懂或修改的代码。先简短复述接口和状态要求，然后直接实施，不以只有设计方案作为交付。

## English prompt

You are developing AfterClass in `wahab-linux/my-jinni` for the DYHTG 2026 BlackRock challenge. I am Wahab and own the frontend; my teammate owns the backend and is implementing the decision engine. Build the frontend now and keep the agreed product scope.

First read `AGENTS.md`, `docs/PROJECT_PLAN.md`, `docs/API.md`, `docs/openapi.json`, and `web/fixtures/`. The backend may still return an explicit 501. Work independently against the agreed contract and examples.

**Scope and collaboration**

- Use the existing HTML/CSS/vanilla JavaScript setup. Own `web/index.html`, `web/styles.css`, and new `web/*.js`/assets. Do not modify `app/`, backend tests, shared fixtures, or the contract. Do not introduce a framework requiring a separate build server.
- FastAPI already serves `/`, `/static/`, and `/fixtures/`. Load assets from `/static/...`, use relative API URLs, and preserve one-command startup: `uv run python -m app`.
- Use clear, short English UI copy and the name AfterClass. Focus on choosing one activity; no accounts, maps, chat, payments, or extra product pages.

**Interface and data flow**

1. Fetch `GET /api/v1/options` for the fixed demo date, London timezone, origin, interests, and defaults.
2. Build inputs for budget in GBP, departure time, return deadline, and at least one interest. Show the demo date and campus origin/return point. Validate money to at most two decimal places and convert exactly to integer pence; reject imprecise/scientific-notation money input.
3. Submit offset-aware ISO timestamps. For this fixed demo date use the +01:00 offset from options.default_request, not the browser's local timezone. Display times in Europe/London and money as GBP with two decimals.
4. POST to `/api/v1/recommendations`. Show one prominent recommendation with activity, category, venue, ticket + return travel = total cost, event times, arrival/return times, and reasons. Show up to two alternatives, source information, and a visible simulated-data label.
5. Handle initial, loading, success, no match, 422 validation error, 502/503 source failure, 501 engine-not-ready, and network error states. Provide useful messages and retry. Prevent duplicate submissions and stale responses overwriting newer results. Clear old recommendations on error or clearly identify them as stale.
6. You may implement explicit `?demo=success|empty|error` modes loading the corresponding `/fixtures/` examples, with a persistent development-demo label. The error fixture represents 503. Default mode calls the real API. Never silently use a success fixture after a real request fails; fixture previews are not dynamically calculated results.
7. Support desktop and mobile layouts, explicit labels, aria-live status, readable errors, keyboard navigation, and visible focus. Use a cohesive branded design with clear hierarchy.

**Verification and handoff**

- Check desktop and approximately 390px widths, keyboard use, budgets £0/£4/£10, missing interests, invalid/reversed times, all fixture states, and the real API's initial 501.
- Verify fields, integer pence, aware timestamps, and error/warning handling against `docs/API.md`. When the engine is ready, check the default result: Board Game Night, £5 total, return at 18:15; budget £4 should change the result.
- Lightweight tests for genuine money/time conversion risks are welcome; do not add a heavy build pipeline.
- Record actual tools, generated work, human decisions, and checks; coordinate edits to `docs/AI_USAGE.md`. Do not claim human review that did not occur.
- Report changes, actual checks, remaining issues, and code I should personally understand or edit. Briefly restate the contract and state requirements, then implement; do not stop at a design proposal.
