# API contract v0.2 / 接口约定

Read together before implementation. `docs/openapi.json` is the machine-readable snapshot; it must match `app/schemas.py` and the running API. v0.2 is an explicitly coordinated breaking scaffold update; URLs remain `/api/v1` because the first completed API has not shipped.

开发前双方共同阅读。`docs/openapi.json` 必须与模型及运行接口一致。v0.2 是已协调的初始化契约更新；首个完整 API 尚未交付，路径暂保留 `/api/v1`。

Here **v0.2 is the contract revision**, not a package release. Application package, `/health.version`, and OpenAPI `info.version` remain **0.1.0** while this is a scaffold.

这里 **v0.2 表示契约修订号**，不是包发布号。骨架阶段应用包、`/health.version` 和 OpenAPI `info.version` 仍为 **0.1.0**。

## Migration / 迁移

- Replace activity result `back_on_campus_at` with **`return_at`**: arrival back at the selected origin. The old field is removed.
- Options replaces `origin_id`/`origin_label` with **`origins: [{id, label}]`**, adding **`supported_dates`** and **`max_budget_pence`**. The initial origin is `default_request.origin_id`.
- `demo_date` remains the date-control default, not the complete support list. Use `supported_dates` for coverage.
- Travel source metadata now includes **`origin_id`**. Integration must request that origin explicitly and verify the returned origin before joining data.
- Money/time units, other business names, envelope, and ranking stay unchanged. Fixtures and OpenAPI migrate together. The engine remains 501.

- 结果 `back_on_campus_at` 改为 **`return_at`**，表示返回所选起点；旧字段移除。
- options 单一起点改为 **`origins: [{id,label}]`**，新增 **`supported_dates`**、**`max_budget_pence`**；初始起点取 `default_request.origin_id`。
- `demo_date` 只是日期默认值；支持范围取 `supported_dates`。
- 交通来源增加 **`origin_id`**；调用显式传起点，关联前验证返回起点。
- 其余金额、时间、字段、包装和排序不变；样例与 OpenAPI 同步迁移，引擎仍为 501。

## Boundaries / 边界

AfterClass helps anyone choose an activity using budget, time, interests, and return travel. Student identity is not required. `app/scenario.py` configures the fictional Glasgow demo's two origins, source-data day, timezone, and budget cap. `app/schemas.py` checks general request structure, not campus identity or fixed dates. See `docs/ARCHITECTURE.md`.

AfterClass 面向任何按预算、时间、兴趣和往返交通选择活动的人，不要求学生身份。`app/scenario.py` 配置虚构格拉斯哥演示的起点、源数据日期、时区和预算上限；`schemas.py` 只做通用结构校验。边界详见 `docs/ARCHITECTURE.md`。

GBP, five activity categories, return to the same origin, fixed travel durations, and fictional feeds remain deliberate activity-MVP limits. This is not an implemented arbitrary-domain decision platform.

英镑、五类活动、返回同一起点、固定交通耗时和虚构源仍是活动 MVP 范围；当前未实现任意领域通用决策平台。

## Conventions / 通用约定

- Same-origin relative URLs; JSON requests use `Content-Type: application/json`.
- Success: `{ "data": ..., "error": null, "warnings": [] }`. Error: `{ "data": null, "error": { "code", "message", "details": [] }, "warnings": [] }`. Exactly one of data/error is non-null.
- Money is **integer pence** (£10 = `1000`). Only raw event `price_gbp` uses decimal GBP strings. Travel cost includes the return journey; do not double it.
- Timestamps are ISO 8601 with UTC offset. Validate scenario dates/display in `Europe/London`. Current default **2026-10-20** uses `+01:00`. Reject naive timestamps.
- `origin_id` is a nonempty lowercase slug; the traveller returns to that selected origin.
- Interests: `games`, `music`, `arts`, `sport`, `learning`; supply 1–5 distinct, equally prioritised interests.
- Structural validation: strict nonnegative integer budget, aware timestamps, `return_by > depart_at`, origin slug, distinct interests, and no extra fields. No configured date/origin lookup or demo budget cap belongs here.
- Application validation: origin must appear in options, both timestamps' London dates must appear in `supported_dates`, and budget must not exceed `max_budget_pence`. Unsupported scenarios return 422 before the current 501 stub.
- All fixtures are fictional. Completed recommendation success responses must include `SIMULATED_DATA`.

同源 JSON、统一包装；金额为整数便士，交通费已含往返。时间带时区。结构校验检查预算、时间、起点 slug、兴趣和未知字段；应用层按 options 检查演示支持的起点、日期和预算上限。返回所选起点，不固定“返校”。所有源均为虚构数据，完成后的成功推荐必须有模拟警告。

## Endpoints / 接口

| Method | Path | Purpose / 用途 | Scaffold / 骨架 |
| --- | --- | --- | --- |
| GET | `/health` | Server and `recommendations_ready` / 服务与引擎状态 | Implemented; false / 已实现，false |
| GET | `/api/v1/options` | Origins, dates, interests, defaults / 起点、日期、兴趣和默认值 | Implemented / 已实现 |
| POST | `/api/v1/recommendations` | Calculated activity decision / 个性化推荐 | **501 for supported requests / 合法演示请求仍501** |
| GET | `/mock/events` | Independent event feed / 独立活动源 | Implemented / 已实现 |
| GET | `/mock/travel?origin_id=...` | Selected-origin travel feed / 所选起点交通源 | Implemented / 已实现 |

`/docs` and `/openapi.json` provide developer documentation. `/` serves frontend, `/static/` serves assets, `/fixtures/*.json` serves explicit examples rather than computed results.

`/docs` 和 `/openapi.json` 为开发文档；`/` 为前端，`/static/` 为资源；`/fixtures/*.json` 是样例，不是计算结果。

## Options / 配置

`GET /api/v1/options` returns this data object (the actual interests list contains all five categories):

`GET /api/v1/options` 的 data 如下（实际 interests 含五类，示例缩短）：

```json
{
  "demo_date": "2026-10-20",
  "supported_dates": ["2026-10-20"],
  "timezone": "Europe/London",
  "origins": [
    {"id": "glasgow-main-campus", "label": "University of Glasgow main campus"},
    {"id": "glasgow-city-centre", "label": "Glasgow city centre"}
  ],
  "max_budget_pence": 20000,
  "currency": "GBP",
  "interests": [{"id": "games", "label": "Games"}],
  "default_request": {
    "origin_id": "glasgow-main-campus",
    "budget_pence": 1000,
    "depart_at": "2026-10-20T16:00:00+01:00",
    "return_by": "2026-10-20T19:00:00+01:00",
    "interests": ["games"]
  },
  "is_simulated": true
}
```

The city-centre choice requires no student identity. The single date reflects source coverage, not a core algorithm constraint.

市中心起点无需学生身份。单日期来自样例数据覆盖，不是核心算法限制。

## POST request / 推荐请求

```json
{
  "origin_id": "glasgow-main-campus",
  "budget_pence": 1000,
  "depart_at": "2026-10-20T16:00:00+01:00",
  "return_by": "2026-10-20T19:00:00+01:00",
  "interests": ["games"]
}
```

Changing the origin to `glasgow-city-centre` passes application validation and reaches 501; it never returns the campus success fixture. Other dates/origins can pass structural validation while receiving application 422 because this demo lacks coverage.

改为市中心可通过应用校验，随后仍为501，不会返回校园成功样例。其他起点/日期可符合模型结构，但因演示无覆盖而返回应用422。

## Responses / 响应

`data.recommended` is one activity or null; `data.alternatives` has zero to two; `data.message` explains the outcome; `data.sources` records source labels, timestamps, simulated status, and travel `origin_id`.

Each activity has `event_id`, `title`, `venue_name`, `category`, `starts_at`, `ends_at`, `ticket_cost_pence`, `travel_cost_pence`, `total_cost_pence`, `outbound_minutes`, `return_minutes`, `arrive_at`, **`return_at`**, and `reasons`.

首选可为null，备选最多两个；来源保留名称、时间、模拟状态及交通起点。**`return_at`** 表示返回请求起点的时间，不默认是校园。

Canonical campus examples / 标准校园样例:

- Request: `web/fixtures/recommendation-request.json`
- Success (HTTP 200): `web/fixtures/recommendation-success.json`
- No match (HTTP 200, default request budget 0): `web/fixtures/recommendation-empty.json`
- Source failure (HTTP 503): `web/fixtures/recommendation-error.json`

Static error files return HTTP 200 as files but represent a real 503 body; explicit frontend demo mode must model that status. Campus examples must not be presented as calculated city-centre results. City-centre travel to `venue-west` takes 35 minutes and costs 400 pence return, versus campus's 15 minutes and 200 pence.

静态错误文件以HTTP200提供，但代表真实503响应体；前端演示需模拟其状态。校园样例不能当作市中心计算结果。市中心到venue-west去程35分钟、往返400便士；校园15分钟、200便士。

## Errors and warnings / 错误与警告

| HTTP | Code | Meaning / 含义 |
| --- | --- | --- |
| 422 | `VALIDATION_ERROR` | Invalid structure or unsupported scenario / 结构无效或场景不支持 |
| 404 | `NOT_FOUND` | Missing endpoint / 接口不存在 |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method / 方法错误 |
| 501 | `NOT_IMPLEMENTED` | Engine remains a scaffold / 引擎未实现 |
| 502 | `INVALID_SOURCE_DATA` | Invalid/ambiguous source or origin mismatch / 源无效、有歧义或起点不匹配 |
| 503 | `SOURCE_UNAVAILABLE` | Source timeout/failure / 源超时或失败 |
| 500 | `INTERNAL_ERROR` | Unexpected error; no stack trace exposed / 未预期错误，不暴露堆栈 |

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check your request.",
    "details": [{"field": "body.origin_id", "message": "Choose an origin from /api/v1/options."}]
  },
  "warnings": []
}
```

Warnings use `{ "code": "...", "message": "..." }`. Reserved: `SIMULATED_DATA`, `INVALID_RECORD_SKIPPED`, `MISSING_JOURNEY`. Never conceal a required-source failure with a warning.

警告用于模拟数据、跳过坏记录和缺失交通；整源失败必须报错。

## Source formats and isolation / 源格式与隔离

Events: `data.provider`, `data.is_simulated`, `data.updated_at`, `data.events[]`. Each event has `id`, nested `venue.id/name`, `category`, aware `starts_at/ends_at`, and decimal `price_gbp` such as `"3.00"`.

Travel: `data.provider`, `data.is_simulated`, `data.updated_at`, **`data.origin_id`**, `data.journeys[]`. Journeys have `destination_id`, `outbound_minutes`, `return_minutes`, `return_fare_pence`, `available`.

- `/mock/travel` defaults to campus for compatibility. Future integration must explicitly pass the request's origin.
- Campus reads `data/travel.json`; city centre reads `data/travel-city-centre.json`. Each has distinct origin metadata, provider label, durations, and costs.
- Unknown origin returns422; no fallback to campus. A selected file whose origin differs from the query returns502 `INVALID_SOURCE_DATA`.
- The future adapter must check `feed.origin_id == preferences.origin_id` before joining venue/destination IDs, and include origin in travel source status.
- Source status with `id:"travel"` requires `origin_id`; `id:"events"` is origin-independent.
- These are independently shaped mock event/travel feeds, not independent live organisations. A second origin is another travel scenario, not a third source.

活动源使用嵌套地点与英镑字符串；交通源包含起点、目的地、分钟及往返便士。两起点独立文件与费用，未知起点不回退校园，源起点不匹配502。未来适配器必须检查起点再关联并保留来源起点。两源为自建mock，不冒充真实外部组织；第二起点不是第三个源。

## Frontend demo mode / 前端演示模式

Explicit `?demo=success`, `?demo=empty`, or `?demo=error` modes may load fixtures and must visibly identify them as campus demos. Default mode calls the real endpoint and honestly shows501. No automatic fixture fallback. Derive origins/dates from options and use neutral “Return by” wording.

可显式选择样例并持续标注“校园模拟样例”；默认真实POST，诚实显示501，不自动回退。起点日期来自options，文案用“Return by”，不写死“返校”。
