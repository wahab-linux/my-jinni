# Jinni hackathon closeout

**Event:** Do You Have the GUTS? 2026, BlackRock challenge, 17–18 October 2026.

**Team 39:** Theo — backend; Wahab — frontend and Electron desktop interface.

Theo confirmed on 18 October that the event had ended and requested closeout and archiving. Hackathon development is closed. Further product work belongs to a future increment.

## Repository baseline

- Repository: [wahab-linux/my-jinni](https://github.com/wahab-linux/my-jinni).
- Final pre-freeze repository commit: `aaa1a66`, 18 October 2026 at 11:58:59 UK time.
- The closeout commit changes documentation only. Application code stays at the final pre-freeze baseline.
- Archive tag: `dyhtg-2026-final`. The tag includes this closeout record and the final product files.
- The GitHub repository remains available for future personal development.

## Delivered product

- A shared browser/Electron interface with Jinni branding, three decision panels and five interface languages.
- Deterministic comparisons across market, travel, student, sustainability and custom scenarios, with explicit priorities, hard limits and two separately shaped simulated feeds per preset.
- The retained detailed activity planner, including exact budget, outbound-arrival and return checks.
- Local notes, TXT/Markdown/text-PDF ingestion, selected-source retrieval and original quotation viewing. Desktop uses SQLite; browser uses IndexedDB.
- Optional desktop AI questions and two or three source-grounded proposals, separate from deterministic scores. OpenAI, DeepSeek, Gemini and Claude use separate keys; Vertex AI retains its ADC route.
- OS-encrypted, provider-bound saved keys, explicit deletion, restart restoration and no plaintext fallback. Windows persistence was tested through Electron safeStorage.

All preset feeds and supplied demonstration sources are fictional. Imported notes do not automatically become numeric comparison measurements. Exact quotation checks validate selected-source membership, not the truth of every model claim.

## Final materials

| Material | File |
| --- | --- |
| Final presentation | [Jinni Pitch v3](presentation/Jinni_Pitch_v3.pptx) |
| English script and questions | [Pitch guide](presentation/Jinni_Pitch_Guide.md) |
| Demonstration walkthrough | [Judges guide](JUDGES.md) |
| Three packs and nine importable sources | [Demo libraries](../demo-library/README.md) |
| AI usage report | [PDF](AI_USAGE_SUBMISSION.pdf) and [editable text](AI_USAGE_SUBMISSION.md) |
| Development evidence | [AI usage and verification log](AI_USAGE.md) |

Earlier presentations are historical snapshots. Use v3. Development AI was **GPT-6.1 Sol through Codex**, with paid access used by at least one teammate; the final report records **Level 5 — Vibe coded**. Theo reported sending the AI statement. Agents did not send Discord messages or upload a replacement attachment. Judging, prizes and final presentation outcomes were not reported and are not inferred.

## Verification record

The final implementation passed 677 Python tests, 93 desktop Node tests, 44 browser Node tests, 36 actual Electron checks, 52 actual Chromium checks, ten focused shared native-UI/ADC checks, lint/format and the static build across the recorded final increments. Actual Electron verified Windows encrypted-key persistence and restart restoration. Automated provider responses were mocked. The full sequence and boundaries are in the AI log.

Separately, two real DeepSeek `deepseek-flash` requests through the chat API passed selected-source citation checks: an answer and two proposals. The calculated comparison was unchanged. No other live provider account or live desktop AI interaction was verified.

Closeout reran the required Ruff lint/format checks and all 677 Python tests. The existing Starlette/httpx TestClient deprecation warning remains. No application feature or dependency was changed during closeout.

## Preserved local data

The source archive contains Git-tracked project files. It excludes credentials, personal SQLite libraries, browser storage, local virtual environments, Node dependencies, temporary renders and the opening ceremony PDF. Existing local libraries and encrypted saved credentials are left in place. Any temporary provider key previously shared in chat must be revoked by its owner; this closeout does not access or change provider accounts.

## Future backlog

These are deferred product ideas, not unfinished archive work:

1. Add one verified live-data adapter and test source freshness, availability and failure handling.
2. Test real account access for additional AI providers and run human source-answer quality checks.
3. Offer an explicit, reviewable document-to-metric extraction flow before changing comparison data.
4. Package a Windows installer with a reproducible Python runtime.
5. Resolve the TestClient deprecation and the artifact renderer's native-shutdown issue before relying on a new build environment.

## Resume later

Continue from the existing `main` checkout or create a branch from `dyhtg-2026-final`. Read `AGENTS.md`, the current requirements and architecture before changing code. Install dependencies with `uv sync --locked` and `npm ci`, then use `start-my-jinni.cmd`. The source archive contains no application runtime or credentials.
