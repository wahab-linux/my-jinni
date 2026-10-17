# AfterClass

Choose an activity that fits your interests, budget, and journey back.

结合活动与交通信息，推荐预算内、赶得上、能按时返校的课后活动。

DYHTG 2026 · BlackRock challenge · Backend: roXy · Frontend: Wahab

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

All event names, venues, travel times, fares, and availability are fictional simulated data. The fixed scenario date is **20 October 2026**, in `Europe/London`; it is not the hackathon date or live information.

活动、地点、交通耗时、票价和可用性均为虚构模拟数据。固定演示日期为 **2026-10-20**，时区为 `Europe/London`；这不是黑客松日期，也不是实时信息。

## Start development / 开始开发

1. Read [Project plan / 项目计划](docs/PROJECT_PLAN.md) and [API contract / 接口约定](docs/API.md).
2. Backend owner: copy either language version from [Backend prompt / 后端提示词](docs/prompts/backend.md).
3. Wahab: copy either language version from [Frontend prompt / 前端提示词](docs/prompts/frontend.md).
4. Use separate Git branches. Agree before changing shared schemas or fixtures. Merge the first working flow after 60–90 minutes.

先阅读计划和接口文档，再把对应提示词的一种语言版本交给 AI。双方使用不同分支；更改共享字段或样例前先同步。第一轮约 60–90 分钟后合并。

```text
app/
  main.py               API routing and application wiring / 接口与应用组装
  schemas.py            Shared request/response models / 共享模型
  errors.py             Consistent error responses / 统一错误
  settings.py           Fixed demo configuration / 演示配置
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

## Remaining work / 待完成

- Implement source fetching/normalisation and the deterministic decision engine.
- Build the interactive frontend and connect it to the recommendation endpoint.
- Add business-rule unit tests and integration tests covering source failure.
- Complete demo practice, architecture/trade-off notes, and the factual AI usage report.

待完成：数据适配和推荐引擎、交互前端、业务测试与失败测试、演示及最终 AI 说明。
