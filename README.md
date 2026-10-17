# AfterClass

Choose an activity that fits your interests, budget, and journey back.

Combine activity and travel information to help anyone choose a feasible plan. Students choosing after-class activities are the first MVP audience.

结合活动与交通信息，帮助有预算、时间和兴趣约束的人选择可行活动。学生课后活动是首个 MVP 场景。

DYHTG 2026 · BlackRock challenge · Backend: roXy · Frontend: Wahab

Repository / 仓库: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni) (the original `jinni` URL redirects here / 原 `jinni` 链接重定向至此).

## Run / 启动

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run from the repository root:

先安装 uv，然后在项目根目录执行；首次运行会准备 Python 和依赖环境：

```sh
uv run python -m app
```

- Website / 页面: <http://127.0.0.1:8000>
- Interactive API / 交互式接口文档: <http://127.0.0.1:8000/docs>
- OpenAPI JSON: <http://127.0.0.1:8000/openapi.json>

The initial scaffold serves the landing page, options, two mock source APIs, and frontend fixtures. The recommendation endpoint deliberately returns **501 NOT_IMPLEMENTED** until the backend task is completed. A running server does not mean the decision engine is finished.

初始版本可启动，包含占位页面、选项接口、两个模拟数据源和前端样例。推荐接口在后端任务完成前明确返回 **501 NOT_IMPLEMENTED**；服务已启动不代表推荐引擎已完成。

All event names, venues, travel times, fares, and availability are fictional simulated data. The first scenario supports **20 October 2026**, in `Europe/London`; this is scenario configuration, not a core decision-model restriction or live information. It includes campus and city-centre origins to check that the architecture is not tied to student identity.

活动、地点、交通耗时、票价和可用性均为虚构模拟数据。首个场景支持日期为 **2026-10-20**，时区为 `Europe/London`；日期和可用起点属于场景配置。校园及市中心两个起点用于验证核心不依赖学生身份。这不是黑客松日期或实时信息。

## Start development / 开始开发

1. Read [Project plan / 项目计划](docs/PROJECT_PLAN.md), [Requirements / 需求与验收](docs/REQUIREMENTS.md), [Architecture / 架构](docs/ARCHITECTURE.md), [API contract / 接口约定](docs/API.md), and [Task packages / 工作包](docs/TASKS.md).
2. Backend owner: copy either language version from [Backend prompt / 后端提示词](docs/prompts/backend.md).
3. Wahab: copy either language version from [Frontend prompt / 前端提示词](docs/prompts/frontend.md).
4. Use separate Git branches. Agree before changing shared schemas or fixtures. Merge the first working flow after 60–90 minutes.

先阅读需求、架构、接口和任务包，再把对应提示词的一种语言版本交给 AI。双方使用不同分支；更改共享字段或样例前先同步。按任务包尽早完成首轮纵向联调。

```text
app/
  main.py               API routing and application wiring / 接口与应用组装
  schemas.py            Shared request/response models / 共享模型
  errors.py             Consistent error responses / 统一错误
  settings.py           Runtime paths / 运行路径
  scenario.py           Supported origins/dates and application policy / 场景能力与应用校验
  sources/              Source APIs and future adapters / 数据源与适配器
  decision/             Future pure decision engine / 待实现的纯推荐逻辑
data/                   Two simulated source datasets / 两套模拟数据
web/                    Wahab's HTML, CSS, JavaScript / 前端
  fixtures/             Shared contract examples / 共享响应样例
tests/                  Backend and contract verification / 测试
scripts/                OpenAPI export / 文档导出
docs/
  API.md                Bilingual contract / 双语接口说明
  openapi.json          Committed machine-readable contract / 机器可读契约
  PROJECT_PLAN.md        Scope, architecture, and task ownership / 范围与分工
  REQUIREMENTS.md        Identified requirements and acceptance scenarios / 需求编号与验收
  ARCHITECTURE.md        Reusable activity core and scenario boundaries / 核心与场景边界
  TASKS.md               Small, ordered development packages / 可联调的小工作包
  AI_USAGE.md            Development log and submission draft / AI 记录与提交草稿
  prompts/              Copyable bilingual development prompts / 可复制双语提示词
```

## Check / 验证

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

After an agreed schema change, regenerate and commit the API snapshot:

双方同意修改契约后，重新导出并提交快照：

```sh
uv run python -m scripts.export_openapi
```

Dependencies are locked in `uv.lock`. No database, account, API key, or paid runtime AI service is required for this scaffold.

依赖由 `uv.lock` 固定。初始化版本不需要数据库、账号、API Key 或付费 AI 运行服务。

## Contract v0.2 migration / 契约升级

Activity output now uses `return_at` instead of `back_on_campus_at`. Options expose `origins` and `supported_dates`; use `default_request` for initial values rather than the removed single-origin fields. Read `docs/API.md` before merging frontend work based on v0.1. The core supports general activity decisions; other industries or a universal plugin platform are outside this MVP.

输出字段从 `back_on_campus_at` 改为 `return_at`。选项公开 `origins` 和 `supported_dates`，初始值读取 `default_request`；旧单一起点字段已移除。基于 v0.1 的前端合并前需迁移。通用范围是活动决策，其他行业或万能插件平台不在本次 MVP 中。

## Remaining work / 待完成

- Implement source fetching/normalisation and the deterministic decision engine.
- Build the interactive frontend and connect it to the recommendation endpoint.
- Add business-rule unit tests and integration tests covering source failure.
- Complete demo practice, architecture/trade-off notes, and the factual AI usage report.

待完成：数据适配和推荐引擎、交互前端、业务测试与失败测试、演示及最终 AI 说明。
