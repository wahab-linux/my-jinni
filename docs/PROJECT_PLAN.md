# AfterClass project plan / 项目计划

## Product boundary / 产品边界

AfterClass helps people choose an activity using their interests, budget, available time, and journey constraints. Students choosing after-class activities are the first MVP audience. The reusable scope is activity selection; a universal decision platform for finance, shopping, or arbitrary industries is not part of this hackathon.

AfterClass 帮助有兴趣、预算、时间和出行约束的人选择活动。学生课后活动是首个 MVP 用户场景。通用范围是活动选择，本次不建设面向金融、购物等任意行业的万能决策平台。

Core story: Given a departure point, budget, time window, and interests, recommend one feasible activity, show alternatives, and explain the total cost and return time.

核心用户故事：输入起点、预算、时间窗和兴趣，得到一个可行活动、备选及总费用和返回时间的解释。

## Read the requirements before building / 开发前先看需求

- `docs/REQUIREMENTS.md`: requirement IDs, P0/P1 scope, business/data rules, quality requirements, acceptance scenarios, and assumptions.
- `docs/ARCHITECTURE.md`: reusable activity core, scenario/application policy, source adapters, and extension limits.
- `docs/API.md` and `docs/openapi.json`: v0.2 contract and migration from the scaffold's earlier campus-specific fields.
- `docs/TASKS.md`: small work packages with owners, dependencies, outputs, timeboxes, and runnable acceptance checks.
- `docs/prompts/backend.md` and `docs/prompts/frontend.md`: copyable Chinese/English implementation instructions.
- `docs/AI_USAGE.md`: actual AI assistance, human decisions/edits, checks, and submission draft.

需求、架构、接口、任务包、开发提示词和 AI 记录分别维护，先明确用户决策与验收，再按依赖开发，不能把有页面或能启动视为业务已完成。

## MVP configuration / 首个演示场景

- Student-oriented experience, with campus as the default departure and return point.
- One supported demonstration day, 2026-10-20 in Europe/London. This is scenario data, not a restriction in the reusable request/decision model.
- A city-centre origin with its own transport feed checks that activity selection does not require student identity or campus-specific semantics.
- Two independent mock source APIs: activities and travel. All activities, venues, fares, durations, and availability are fictional and labelled simulated.
- Travel times are fixed estimates, not scheduled buses or a live routing service. Return is to the chosen origin.
- One recommendation and up to two alternatives. Deterministic ranking and fact-based explanations, with no runtime LLM.

MVP 默认面向学生，校园为默认起点；演示日期属于配置。市中心起点使用对应交通数据，验证核心不依赖学生身份。活动和交通是两个自建模拟来源；不冒充实时数据。返回所选起点，输出一个首选和最多两个备选，运行不依赖 LLM。

The second origin is an architecture/contract acceptance scenario, not a commitment to build separate products or interfaces for multiple audiences during the hackathon.

第二起点是架构与接口验收样例，不代表本次要额外完成多个用户群的独立产品。

## Architectural responsibility / 架构职责

1. Experience: render available scenario options and request states. The UI reads capabilities from the API rather than hardcoding campus or supported dates.
2. Application/scenario: select supported origins/dates, validate source capabilities, coordinate fetching, and map failures to the shared API envelope.
3. Decision: pure activity feasibility and ranking over normalised inputs. No student-role checks, campus constants, demo date, FastAPI, network, or file I/O.
4. Integration: fetch independent feeds, convert source formats, preserve provenance, and validate origin/data consistency.

1. 界面读取 API 公布的场景能力，不写死起点和支持日期。
2. 应用和场景层检查数据支持范围、协调获取和错误转换。
3. 决策层只处理通用活动可行性与排序，不判断学生身份，也不依赖校园、演示日期或 I/O。
4. 数据适配层获取和统一两源，保留出处并验证起点匹配。

These responsibilities fit the challenge's three layers: experience; decision/application; data integration. Scenario configuration is a boundary inside the application, not a new deployed service.

上述职责仍落实为界面、决策/应用、数据接入三个层次；场景配置无需额外部署服务。

## Rules and failure policy / 规则与失败策略

- Ticket plus return travel must fit the budget; outbound arrival must not miss the start; event end plus return travel must meet the return deadline. Equality at each boundary is allowed.
- Rank by interest match, then lower total cost, shorter total travel, and stable activity ID. Selected interests have equal priority.
- Missing/unavailable journeys exclude the affected activity; unknown cost/time is never zero. A mismatched source origin must never be used for ranking.
- No feasible activity is a successful empty result. Required-source failure is an error, not a reason to silently use a success fixture. Invalid source structure differs from no results.
- Model syntax validation and scenario capability validation are different: a structurally valid request may still ask for an unsupported origin or date.

总价、到达和返回三个约束必须同时满足，边界相等允许；兴趣优先，再比费用、耗时和稳定 ID。缺失交通不能当作免费或零分钟；不同起点的数据不可混用。无结果、整源失败、数据损坏、请求超出场景能力是不同状态。

## Ownership and integration / 分工与联调

| Owner / 负责人 | Primary files / 主要文件 | Responsibility / 职责 |
| --- | --- | --- |
| User / 你 | `app/`, `data/`, `tests/`, `scripts/` | Scenario validation, adapters, pure engine, API and tests / 场景校验、适配、推荐、接口与测试 |
| Wahab | `web/index.html`, `web/styles.css`, new web JS/assets | Options-driven form, results, error states, accessibility / 按场景能力生成界面、结果、异常与可访问性 |
| Together / 共同 | Schemas, fixtures, OpenAPI, integration acceptance | Agree and version contract changes before merging / 先同步契约，再联调合并 |
| Each person / 各自 | AI usage notes; coordinate shared edits | Record actual tool use, decisions, edits and verification / 记录实际工具、决策、修改和验证 |

Suggested branches remain `backend` and `frontend`. The first handoff is a narrow vertical slice, not a complete backend and a complete frontend developed in isolation. Follow `docs/TASKS.md` for timeboxes and acceptance checks. Pull the v0.2 contract before starting or merging v0.1 work.

建议分别使用 backend/frontend 分支。第一次交付是小型纵向闭环，不是两边各自做完全部系统才联调。具体时序和验收见任务包，开发或合并旧版本前先拉取 v0.2 契约。

## Current delivery status / 当前完成状态

This revision provides requirements, architecture boundaries, migrated scaffold contracts/fixtures, and implementation handoffs. The calculated recommendation engine and interactive frontend remain outstanding. The explicit HTTP 501 stub must be replaced by actual source integration and decision logic; static success fixtures do not prove that implementation works.

本次修订交付需求、架构边界、新版骨架契约/样例和开发任务。实际推荐引擎与交互前端仍待实现。必须以两源整合和真实规则替换 501；固定成功样例不能证明推荐业务已完成。

## Schedule and completion / 时间与完成标准

Aim for an early end-to-end slice, then complete edge cases, source failures and documentation. Before finishing Saturday, run the complete main flow and rehearse once. Suggested Sunday 10:30 onward: fixes, final verification, documentation and demo practice. Official code freeze is Sunday 12:00 UK time; suggested milestones are team planning, not additional official rules.

先尽早完成端到端小闭环，再补边界、数据失败与文档。周六结束前跑通主流程并演练一次；建议周日 10:30 起集中修错、最终验证和演示准备。官方周日英国时间 12:00 停码，其他里程碑为团队建议。

Completion means the P0 requirement acceptance scenarios pass, both people can explain the flow and trade-offs, simulated data is visible, the app starts with one command, and the AI report reflects actual work. Do not tick requirements merely because scaffold tests pass.

完成标准是 P0 验收通过、两人能解释流程和取舍、模拟数据标注清楚、一条命令启动、AI 报告如实记录；骨架测试通过不代表需求全部完成。
