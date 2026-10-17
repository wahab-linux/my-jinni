# AI usage log and submission draft / AI 使用记录与提交草稿

This is a working log, not a completed human-review statement. Update it throughout development. Planned process: Level 4 (AI-led, human directed); final level must reflect the actual process. The official Level 4 description includes regular human edits to AI output. If between levels, the organisers require the higher level.

这是开发记录，不是已完成的人工审查声明。计划按 Level 4 协作，最终按实际过程填写。官方 Level 4 包含经常手动修改 AI 输出；介于两档时选较高档。

## Actual activity / 实际活动

| Date / 日期 | Person/tool / 人员与工具 | AI contribution / AI 工作 | Human decisions/edits / 人工决策与修改 | Verification / 验证 |
| --- | --- | --- | --- | --- |
| 2026-10-17 | Codex; exact model/plan to be recorded from the user's session / 具体模型和套餐待按实际会话补充 | Proposed AfterClass; generated initial structure, API schemas/examples, mock datasets, scaffold, tests, bilingual prompts/docs / 提出方向并生成初始化代码与文档 | User selected AfterClass and assigned backend to self, frontend to Wahab. Further code review/edits are not yet recorded. / 用户选题并决定分工；尚未记录后续人工代码修改 | Agent ran lint and format checks, 21 passing scaffold/contract tests, and actual startup/HTTP smoke checks for the page, options, both sources, OpenAPI, fixtures, and explicit 501 POST. Tests emitted one dependency deprecation warning. Engine/business-rule verification and human review remain outstanding. / 代理通过 lint、格式、21项骨架契约测试及真实启动和HTTP检查；有一条依赖弃用警告。业务引擎验证与人工审查尚待完成。 |

For each subsequent task, add the tool/model/paid plan, why it was used, what it generated, specific human decisions or code edits, and the actual check/result. Keep relevant commits or conversation evidence where available. Do not invent review, metrics, or edits.

每项任务记录工具/模型/付费计划、使用原因、生成内容、实际人工决策或改动、检查方法与结果。保留相关提交或对话；不虚构审查、用量或人工改动。

## Failure and checking / 失败与检查

- Runtime recommendation is planned to use deterministic rules, with no LLM dependency. AI coding mistakes are checked through human review, unit tests, integration tests, lint, and running the app; mark which checks actually happened.
- If event or travel data is unavailable, return a visible error rather than invented recommendations.
- All source datasets and response examples are simulated; some were AI-generated during scaffolding.

推荐计划使用确定性规则，无运行时 LLM 依赖。AI 代码需通过实际人工审查、测试、lint 和运行验证；区分已做和待做。数据源失败明确报错；本仓库模拟数据和样例包含 AI 生成内容。

## Submission paragraph template / 提交段落模板

> We used [tools, exact models and any premium plans] for [planning, coding, debugging, design, or documentation] because [reason]. Our actual AI usage level was [level]. We made the decisions about [scope, API, ranking, architecture] and manually reviewed/edited [specific examples that actually occurred]. We checked the output using [actual tests and demo checks]. [Explain what happens if AI is wrong or unavailable.] Our event and travel datasets are clearly labelled simulated data.

> 我们使用了［工具、具体模型和付费计划］完成［任务］，原因是［原因］。实际 AI 等级为［等级］。我们决定了［范围、接口、排序、架构］，并人工审查/修改了［实际例子］。通过［实际测试与演示检查］验证。［说明 AI 错误或不可用时如何处理］。活动和交通数据均明确标注为模拟数据。

Replace every placeholder with verified facts before submission. Also follow any later sponsor/organiser submission instructions.

提交前用已核实事实替换全部占位符，并遵循后续主办方和赞助商通知。
