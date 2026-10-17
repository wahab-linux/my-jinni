# API contract v0.1 / 接口约定

Read this together before implementation. `docs/openapi.json` is the machine-readable snapshot; `app/schemas.py` defines the same models. The snapshot must remain consistent with the running API.

开发前双方共同阅读。`docs/openapi.json` 是机器可读契约快照，`app/schemas.py` 使用相同模型；快照必须与运行接口一致。

## Conventions / 通用约定

- Base URL: same origin, e.g. `http://127.0.0.1:8000`. Frontend uses relative URLs.
- JSON requests use `Content-Type: application/json`.
- Application and mock APIs use the same outer shape: `{ "data": ..., "error": null, "warnings": [] }` on success; `{ "data": null, "error": { "code", "message", "details": [] }, "warnings": [] }` on error. Exactly one of data/error is non-null.
- Money: **integer pence** in application requests/responses. £10 = `1000`. Only raw event source `price_gbp` uses a decimal GBP string.
- Time: ISO 8601 with UTC offset; display/validate using `Europe/London`. The fixed demo date is **2026-10-20**, which uses `+01:00`. Naive timestamps are rejected.
- Origin: only `glasgow-main-campus`; return to that same origin.
- Categories: `games`, `music`, `arts`, `sport`, `learning`. Supply 1–5 distinct interests.
- Budget: integer 0–20000 pence. Both timestamps must fall on the demo day in London, and `return_by` must be after `depart_at`. Unknown request fields are rejected.
- Sources and fixtures are simulated. All success responses from the completed engine include a `SIMULATED_DATA` warning.

同源请求、JSON 格式、统一 data/error/warnings 包装；金额为整数便士；时间必须带 UTC offset 并按伦敦时区解释。只支持固定日期和校园起点。预算为 0–20000 便士，兴趣不重复，拒绝未知字段。模拟数据必须标注。

## Endpoints / 接口

| Method | Path | Purpose / 用途 | Scaffold status / 初始化状态 |
| --- | --- | --- | --- |
| GET | `/health` | Server status; `recommendations_ready` / 服务与推荐引擎状态 | Implemented / 已实现，ready=false |
| GET | `/api/v1/options` | Categories, demo date, origin, defaults / 兴趣、日期、起点和默认值 | Implemented / 已实现 |
| POST | `/api/v1/recommendations` | Personalised calculated decision / 个性化推荐 | **501 until backend implemented / 后端完成前返回 501** |
| GET | `/mock/events` | Independent event feed / 模拟活动源 | Implemented / 已实现 |
| GET | `/mock/travel` | Independent travel feed / 模拟交通源 | Implemented / 已实现 |

`/docs` and `/openapi.json` provide developer documentation. `/` serves the frontend; `/static/` serves frontend assets. `/fixtures/*.json` are explicit development examples, not a live recommendation API.

`/docs` 和 `/openapi.json` 提供开发文档；`/` 为前端，`/static/` 为资源。`/fixtures/*.json` 是开发样例，不是实际推荐接口。

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

## Response / 响应

`data.recommended` is one activity or null; `data.alternatives` has zero to two activities; `data.message` explains the outcome; `data.sources` records both source labels, timestamps, and simulated status.

`recommended` 为首选或 null；`alternatives` 最多两个；`message` 解释结果；`sources` 保留两源名称、时间与模拟状态。

Each activity has: `event_id`, `title`, `venue_name`, `category`, `starts_at`, `ends_at`, `ticket_cost_pence`, `travel_cost_pence` (return fare), `total_cost_pence`, `outbound_minutes`, `return_minutes`, `arrive_at`, `back_on_campus_at`, and `reasons`.

活动包含标识、名称、地点、类别、活动起止时间、门票/往返交通/总费用、去返程耗时、到达/返校时间、推荐理由。不得把 `travel_cost_pence` 再乘二。

Canonical examples / 标准样例:

- Request: `web/fixtures/recommendation-request.json`
- Success (HTTP 200): `web/fixtures/recommendation-success.json`
- No match (HTTP 200): `web/fixtures/recommendation-empty.json`
- Source failure (HTTP 503): `web/fixtures/recommendation-error.json`

The no-match example corresponds to the default request with `budget_pence: 0`. Its empty recommendation is a successful search, not an API failure. Source-failure fixtures are fetched over HTTP 200 as static files, but represent the body of a real HTTP 503; explicit frontend demo mode must model that status.

无结果样例对应默认请求预算改为 0；它是成功搜索。静态失败样例文件本身以 200 提供，但代表实际 503 的响应体，前端演示模式需要模拟这个状态。

## Error codes / 错误

| HTTP | Code | Meaning / 含义 |
| --- | --- | --- |
| 422 | `VALIDATION_ERROR` | Invalid JSON/body, units, date, time order, interests, or extra fields / 请求校验失败 |
| 404 | `NOT_FOUND` | Missing endpoint / 接口不存在 |
| 405 | `METHOD_NOT_ALLOWED` | Wrong method / 方法错误 |
| 501 | `NOT_IMPLEMENTED` | Engine is still the explicit scaffold stub / 推荐引擎尚未实现 |
| 502 | `INVALID_SOURCE_DATA` | Required source has invalid/ambiguous structure / 数据源结构无效或有歧义 |
| 503 | `SOURCE_UNAVAILABLE` | Source timeout or upstream failure / 源超时或失败 |
| 500 | `INTERNAL_ERROR` | Unexpected error; no stack trace in response / 未预期错误，响应不暴露堆栈 |

Error body / 错误体:

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check your request.",
    "details": [{"field": "body.budget_pence", "message": "Input should be a valid integer"}]
  },
  "warnings": []
}
```

Warnings have `{ "code": "...", "message": "..." }`. Reserved codes: `SIMULATED_DATA`, `INVALID_RECORD_SKIPPED`, `MISSING_JOURNEY`. Never use a warning to conceal that a required source entirely failed.

警告包含 code/message，可用于模拟数据、跳过坏记录、缺失交通。整源失败必须返回错误，不能用警告掩盖。

## Source formats / 原始源格式

Event source: `data.provider`, `data.is_simulated`, `data.updated_at`, `data.events[]`. An event uses `id`, nested `venue.id/name`, `category`, aware `starts_at/ends_at`, and `price_gbp` such as `"3.00"`.

Travel source: `data.provider`, `data.is_simulated`, `data.updated_at`, `data.origin_id`, `data.journeys[]`. A journey uses `destination_id`, `outbound_minutes`, `return_minutes`, `return_fare_pence`, and `available`.

活动源使用嵌套地点与英镑字符串；交通源使用目的地 ID、分钟和往返便士。适配器负责关联和统一格式；前端只调用应用 API。

## Frontend development mode / 前端开发模式

Wahab may implement an explicit `?demo=success`, `?demo=empty`, or `?demo=error` selector that loads the matching fixture and visibly labels the state as a demo. Default mode calls the real POST endpoint and must display its initial 501 state honestly. Never silently fall back to a success fixture after a failed real request.

可用明确的 demo 查询参数选择样例，并持续显示演示标记。默认模式调用真实 POST，明确显示尚未实现的 501。真实失败时不能自动替换成固定成功结果。
