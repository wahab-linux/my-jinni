# Development tasks and integration checkpoints / 开发任务与联调检查点

This executes `docs/REQUIREMENTS.md`; it is not a completion report. All checkboxes start open. Timeboxes are suggested elapsed working time from team agreement, not official competition timings. Official code freeze is Sunday 18 October at 12:00 UK time. Protect the final 60–90 minutes for fixes, submission checks and rehearsal.

这是 `docs/REQUIREMENTS.md` 的执行计划，不是完成报告；验收框初始全部未勾选。时间盒从双方确认方案后计算，不是官方日程。官方周日 10 月 18 日英国时间 12:00 停码，最后 60–90 分钟留给修错、提交检查和演练。

## Product and ownership / 产品与职责

**General core:** choose a feasible activity from two sources under budget, time and interest constraints. **Configured scenario:** supported origins, dates, timezone, categories, budget limit and defaults. **First MVP:** a Glasgow student planning time after class. Student identity is not required. Return to the selected origin remains the MVP rule; a different return destination is deferred.

**通用核心：**结合两源，在预算、时间和兴趣约束下选择可行活动。**场景配置：**支持的起点、日期、时区、类别、预算上限和默认值。**首个 MVP：**格拉斯哥学生课后安排，不要求学生身份。返回同一所选起点仍是本版规则，不同终点延期。

| Owner / 负责人 | Owns / 负责 | Coordinates first / 先协调 |
| --- | --- | --- |
| You / 你 | Backend: `app/`, `data/`, `tests/`, `scripts/` / 后端实现 | Schema/source contracts / 模型与源契约 |
| Wahab | Frontend: `web/` / 前端实现 | Shared fixtures; no competing field names / 共享样例，不自建另一套字段 |
| Together / 共同 | Scope, contract, integration, code explanations, demo, factual AI log / 范围、接口、联调、代码解释、演示和真实 AI 记录 | `docs/`, dependencies, `app/schemas.py`, `web/fixtures/`, OpenAPI / 共享文档与契约 |

AI agents implement the human owners' tasks; the humans decide scope and understand the flow. When delegating, assign bounded deliverables and exclusive file lists. Backend adapters/engine can be separate tasks; an isolated frontend helper or read-only accessibility review can be separate. One coordinator integrates each checkpoint. Do not assign all frontend files to another agent while Wahab is editing them.

AI 代理执行各负责人任务，人仍要决定范围并理解流程。子代理任务指定小交付物和独占文件；后端可分适配器/引擎，前端可分独立辅助模块或只读可访问性审查；由一个协调者联调。Wahab 在改前端时，不再派另一代理并发重做整个前端。

## Requirement → package → checkpoint → acceptance / 需求→工作包→检查点→验收

S0/B1/B2/B3/F1/F2/S1 are the work-package IDs from `REQUIREMENTS.md`. T0/T1/T2/T3 below are delivery checkpoints that slice those packages into smaller runnable increments, not a second competing package list. A package may contribute to both the first flow and later hardening.

S0/B1/B2/B3/F1/F2/S1 沿用需求文档的工作包 ID；下文 T0/T1/T2/T3 是把工作包拆成可运行小交付的检查点，不是另一套冲突的任务编号。同一工作包可以先交正常链路，再补异常。

| Requirement IDs / 需求 | Package / 工作包 | Checkpoints / 检查点 | Acceptance IDs / 验收 |
| --- | --- | --- | --- |
| FR-01/02/07; BR-01–04; QR-03 | S0: contract / 契约 | T0 | AC-01/02/13 |
| FR-03/09; BR-01/05–10; QR-02 | B1: adapters / 适配器 | T1-B normal path → T2-B failures → T2-I origin check / 正常→异常→起点核对 | AC-03/08/09/12 |
| FR-04/05/06; BR-01–05; QR-01/05 | B2: pure engine / 纯引擎 | T1-B normal path → T2-B boundaries → T2-I portability / 正常→边界→可配置验证 | AC-04–07/10/12 |
| FR-01/02/07; QR-02/03/06 | B3: wiring / 应用联接 | T1-B real POST → T1-I → T2-B/T2-I errors/config / 真实接口→首次联调→异常配置 | AC-01/02/03/09/12/13 |
| FR-01/02/08; QR-04 | F1: form / 表单 | T1-F basics → T1-I → T2-F validation / 基础→首次联调→校验 | AC-01/02/11/12 |
| FR-05/06/08/09; QR-04 | F2: result/states / 结果状态 | T1-F one result → T1-I → T2-F/T2-I full states / 单结果→首次联调→完整状态 | AC-07/09–12 |
| FR-10; QR-03/05–07 | S1: joint acceptance / 联合验收 | T1-I → T2-I → T3 | AC-01–14 |

AC-03's synthetic test baseline and the repository's default demo fixture are different setups. Keep their event start times separate: the default Board Game Night starts at 16:30; the generic AC-03 test example starts at 17:00. Expected amounts/times must follow the actual input used.

AC-03 的合成测试基线与仓库默认演示样例不同：默认桌游 16:30 开始，AC-03 通用例子 17:00 开始；不要混用开始时间，预期必须来自实际测试输入。

## Execution order / 执行顺序

`T0 → (T1-B ∥ T1-F) → T1-I → (T2-B ∥ T2-F) → T2-I → T3`

Do not wait for both large halves to be “finished”. The first checkpoint is a real default recommendation in the browser; later checkpoints add failures and prove that another origin uses its own travel data.

不要等前后端“大块做完”才合并。第一检查点就在浏览器拿到真实推荐；后续补异常，并证明另一所选起点使用自己的交通数据。

### T0 — Agree v0.2 / 确认 v0.2

- **Owner / 负责人:** Together / 共同.
- **Timebox / 时间盒:** 10–15 minutes first / 最先 10–15 分钟.
- **Inputs / 输入:** Requirements, API docs, OpenAPI, request/response fixtures and source examples / 需求、契约、快照、样例和原始源.
- **Output / 产物:** Agreed story, fields, ranking, ownership and a shared baseline revision / 双方确认故事、字段、排序、文件归属和基线版本.
- **Dependency / 依赖:** None / 无.
- **Runnable acceptance / 可运行验收:** `uv run python -m app`; GET options and both mock feeds, including city-centre travel. The initial scaffold's default POST must show its honest 501. Together check `return_at`, pence, offsets, `max_budget_pence`, options origins and travel origin query. / 启动应用，读 options 和双起点交通；初始 POST 明确 501；共同核对新字段、便士、时区、限额、起点和查询参数.
- [ ] Both agree that student life is a scenario; future accounts/platform work is excluded. / 确认学生是场景，不做未来账户或平台工程.
- [ ] Record actual decisions rather than claiming all code has been human-reviewed. / 只记录真实决定，不宣称已读完全部代码.

### T1-B — Minimum real backend slice / 最小真实后端闭环

- **Owner / 负责人:** You with backend AI / 你与后端 AI.
- **Timebox / 时间盒:** 45–60 minutes after T0, parallel with T1-F / T0 后 45–60 分钟，与 T1-F 并行.
- **Inputs / 输入:** Agreed models/default request, `/mock/events`, `/mock/travel?origin_id=...` / 已确认模型、默认请求与两源.
- **Output / 产物:** B1/B2/B3 normal path: fetching/adaptation, pure feasibility/ranking, wired POST and a real default integration test / B1/B2/B3 正常路径：接入适配、纯筛选排序、推荐接口及真实默认集成测试.
- **Dependency / 依赖:** T0 only; do not wait for UI / 只依赖 T0，不等界面.
- **Runnable acceptance / 可运行验收:** Real default POST combines both feeds and returns `event-board-games`, 500p, `return_at` 18:15; 400p returns `event-music`. Replace obsolete 501/ready=false assertions only when actual calculation works; retain useful contract tests. / 真实默认 POST 得桌游、500 便士、18:15 返回；400 便士得音乐。计算真正完成才替换旧骨架断言，保留契约检查.
- [ ] No success-fixture fallback or network/files/FastAPI in the decision layer. / 不回退固定成功样例，决策层无网络/文件/FastAPI.
- [ ] Share the endpoint and list unfinished edge cases honestly. / 交接口并列明尚未完成的异常.

### T1-F — Minimum usable frontend slice / 最小可用前端闭环

- **Owner / 负责人:** Wahab with frontend AI / Wahab 与前端 AI.
- **Timebox / 时间盒:** 45–60 minutes after T0, parallel with T1-B / T0 后 45–60 分钟，与 T1-B 并行.
- **Inputs / 输入:** Options contract, request fixture and explicitly labelled success fixture / options 契约、请求与明确标注的成功样例.
- **Output / 产物:** F1/F2 normal path: configured form, exact money/time serialisation, one result card, live POST wiring and honest 501 / 配置表单、精确序列化、单结果卡、真实请求和明确 501.
- **Dependency / 依赖:** T0; calculation need not be ready / 依赖 T0，暂不依赖引擎.
- **Runnable acceptance / 可运行验收:** Load `/`, choose origin/preferences, inspect fields in browser Network. Explicit fixture preview, if implemented, is labelled; normal mode only uses real API status. A preview selector is optional, not a reason to delay integration. / 打开页面选起点偏好，在 Network 查字段。若做样例预览则明确标注；正常模式只走真接口；预览切换是可选项，不拖延联调.
- [ ] Origins, date, defaults and budget cap come from options, not campus/date constants. / 起点、日期、默认值及限额来自 options，不写死.
- [ ] Visible simulation label and general return-to-origin wording. / 明示模拟数据，使用通用返回起点措辞.

### T1-I — First integration / 第一轮联调

- **Owner / 负责人:** Together / 共同.
- **Timebox / 时间盒:** 15 minutes immediately after both T1 slices / 双方 T1 后立即 15 分钟.
- **Inputs / 输入:** T1-B and T1-F on one synchronised revision / 同一版本的后端与前端.
- **Output / 产物:** One browser input-to-calculated-result flow and a short issue list / 一条真实浏览器闭环与简短问题单.
- **Dependency / 依赖:** T1-B + T1-F.
- **Runnable acceptance / 可运行验收:** Start once; normal browser mode requests £10/games and gets Board Game Night £5, then £4 and gets Acoustic Hour. Inspect both responses and confirm no fixture fallback. / 一次启动，正常模式 £10/games 得桌游 £5，£4 得音乐；核对响应非样例.
- [ ] Each person explains input → both feeds → filters → result once. / 两人各解释一次输入→两源→筛选→结果.
- [ ] Fix contract mismatches now, before independent polish. / 先解决契约差异再分头优化.

### T2-B — Rules, errors and tests / 规则、异常与测试

- **Owner / 负责人:** You with backend AI / 你与后端 AI.
- **Timebox / 时间盒:** 60–90 minutes after T1-I / T1-I 后 60–90 分钟.
- **Inputs / 输入:** Working slice, BR rules and error catalogue / 正常闭环、业务规则与错误约定.
- **Output / 产物:** Complete B1/B2/B3: bounded failures, all rules, boundary and two-source integration tests / 完成 B1/B2/B3：有界失败、完整规则及边界/两源测试.
- **Dependency / 依赖:** T1-I.
- **Runnable acceptance / 可运行验收:** Execute AC-02–10: budget 500 passes/499 fails in its synthetic baseline; exact/one-minute-late outbound and return boundaries; all tie-breakers; no match; missing/unavailable travel; valid empty feeds; malformed records versus invalid whole feed; wrong origin; timeout/failure. Independently change event price and travel fare/duration and observe changed feasibility/ranking. / 执行对应验收：合成基线预算 500 可行/499 不可行，去返程恰好及越界一分钟，全部排序、无结果、缺/坏交通、空源、坏记录与整源、错起点、失败；分别改变两源证明影响.
- [ ] 200/no match, 502/invalid source and 503/unavailable source stay distinct. / 正常无结果与坏源/失败区分.
- [ ] No invented zero values, fixed answers, stack traces or hidden whole-feed failures. / 不虚构零值/固定推荐，不暴露堆栈，不掩盖整源失败.

### T2-F — Complete UI states / 完整界面状态

- **Owner / 负责人:** Wahab with frontend AI / Wahab 与前端 AI.
- **Timebox / 时间盒:** 60–90 minutes after T1-I, parallel with T2-B / T1-I 后 60–90 分钟，与 T2-B 并行.
- **Inputs / 输入:** Working form/result and error/warning examples / 已联调表单、结果与错误警告样例.
- **Output / 产物:** Complete F1/F2: alternatives, cost breakdown, provenance, loading/empty/error/retry and accessible responsive UI / 完整 F1/F2：备选、费用明细、来源、各状态重试和响应式可访问界面.
- **Dependency / 依赖:** T1-I; explicit fixture preview may cover unfinished backend error states / 后端异常未完成时可用明确样例预览推进.
- **Runnable acceptance / 可运行验收:** AC-11 plus desktop/~390px and keyboard use; missing interests; reversed time; exact £ conversion; options failure; loading/no result/422/501/502/503/network error; repeat click and stale response. Error preserves inputs without presenting old recommendations as fresh. / 检查宽窄屏键盘、无兴趣、反向时间、金额、选项失败、加载无结果各错误、重复点击与过期响应；错误保留输入，不把旧结果当新结果.
- [ ] Simulation/provenance/warnings remain visible; real failure never becomes fixture success. / 标注来源警告可见，真失败不换样例成功.
- [ ] Record whether each check used real API, a controlled transport or fixtures. / 记录各项用了真接口、受控 transport 还是样例.

### T2-I — Second origin and regression / 第二起点与回归

- **Owner / 负责人:** Together / 共同.
- **Timebox / 时间盒:** 20–30 minutes after T2-B/T2-F / 双方 T2 后 20–30 分钟.
- **Inputs / 输入:** Both origins' mock data and integrated UI/backend / 双起点源与完整前后端.
- **Output / 产物:** S1 evidence of a second configured origin without engine edits; integrated error/retry check / 不改引擎的第二起点证据，以及错误重试联调.
- **Dependency / 依赖:** T2-B + T2-F.
- **Runnable acceptance / 可运行验收:** AC-12: select city centre in the real UI; request and travel provenance show `glasgow-city-centre`. `venue-west` travel is 35/30 minutes and 400p, versus campus 15/15 and 200p. Default city-centre departure at 16:00 must exclude the 16:30 Board Game Night; returning it with campus values fails acceptance. Separately shift synthetic engine data to another date without rule edits; unsupported app dates remain 422. Verify £0/no match and a controlled source failure/retry. / 真页面选市中心，请求来源均正确；west 为 35/30 分钟、400 便士，校园为15/15、200；市中心16:00出发必须排除16:30桌游，沿用校园值即失败。另日期合成数据不改规则即可算，但应用不支持日期仍422；验无结果和失败重试.
- [ ] Two configurations do not imply unlimited places/dates or real travel data. / 双配置不代表支持任意地点日期或真实交通.
- [ ] Both explain scenario configuration, decision and adapters separately. / 两人可分别解释场景配置、决策和适配.

### T3 — Verify, explain and prepare submission / 验证、解释与提交准备

- **Owner / 负责人:** You: backend checks/architecture; Wahab: UI/demo; together: review/AI record/submission / 你负责后端架构检查，Wahab负责界面演示，共同审查AI记录及提交.
- **Timebox / 时间盒:** 30–45 minutes; protect final 60–90-minute buffer before freeze / 30–45 分钟，停码前保留60–90分钟缓冲.
- **Inputs / 输入:** Integrated app, actual checks and latest official submission instructions / 联调应用、实际检查和最新官方提交要求.
- **Output / 产物:** Accurate README, architecture/trade-offs, AI document, short English demo/Q&A and clean startup / 准确 README、架构取舍、AI说明、简短英文演示问答及可启动项目.
- **Dependency / 依赖:** T2-I; documentation notes can accumulate earlier / 文档记录可提前积累.
- **Runnable acceptance / 可运行验收:** AC-13/14: `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`; start with `uv run python -m app`; rehearse default → lower budget → source failure. Each person actually reads/explains relevant code and records actual manual edits. / 三项检查和一条命令启动；演练默认→改预算→源失败；两人实际读懂解释代码并记录人工修改.
- [ ] Record real tools/models, generated work, decisions/edits and check results; no invented review/final AI level. / 不虚构工具审核或最终等级.
- [ ] Check latest official submission requirements; these docs alone do not establish compliance. / 核对最新提交要求，不假设这些文档已完全满足.
- [ ] Exclude credentials, `.venv`, temporary renders and the opening PDF. / 不包含凭据、虚拟环境、临时渲染和开幕PDF.

## If time runs short / 时间不足时

Keep the real two-source calculation, all three feasibility checks, simulation labels, source-failure handling, critical boundary tests and one complete demo. Defer animation, extra visual polish, more categories/dates/providers and live integrations. Use the already configured second origin as a small architecture check; add no further scenarios during the hackathon. Never claim an unimplemented requirement passed.

保留真实两源计算、三项可行性、模拟标注、源失败、关键边界测试和完整演示。先舍弃动画、额外美化、更多类别日期数据商和实时接入。用已有第二起点做小范围架构检查，比赛中不再加场景；未完成需求不宣称已验收。
