import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.env.JINNI_PRESENTATION_ROOT ?? process.cwd());
const modules = process.env.JINNI_PRESENTATION_MODULES ?? "C:/Users/roXy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const skill = process.env.JINNI_PRESENTATION_SKILL ?? "C:/Users/roXy/.codex/plugins/cache/openai-primary-runtime/presentations/26.1017.11052/skills/presentations";
const python = process.env.JINNI_PRESENTATION_PYTHON ?? "C:/Users/roXy/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
process.env.RUNTIME_NODE_MODULES ??= modules;
const require = createRequire(import.meta.url);
const { Presentation, PresentationFile } = await import(pathToFileURL(require.resolve("@oai/artifact-tool", { paths: [modules] })).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, "container_tools/artifact_tool_utils.mjs")).href);
const build = path.join(root, "tmp/presentation/pitch");
const output = path.join(root, "docs/presentation");
await fs.mkdir(build, { recursive: true });
await fs.mkdir(output, { recursive: true });
const C = { paper: "#F7F6FC", ink: "#242039", muted: "#625B74", purple: "#58458D", gold: "#E9C779", pale: "#ECE7F8", white: "#FFFFFF", line: "#D8D2E5" };
const font = "Arial";
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const notes = [];

function text(slide, value, x, y, width, height, size = 28, color = C.ink, bold = false) {
  const shape = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width, height }, fill: "none", line: { fill: "none", width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: font, fontSize: size, color, bold, insets: 0, wrap: "square", autoFit: "none", verticalAlignment: "top" };
  return shape;
}

function slide(title, spoken, references, { dark = false, backup = false } = {}) {
  const s = deck.slides.add();
  s.background.fill = dark ? C.ink : C.paper;
  if (title) text(s, title, 72, 54, 1136, 80, 46, dark ? C.white : C.ink, true);
  if (backup) text(s, "Backup", 1100, 661, 108, 25, 19, dark ? C.gold : C.muted);
  s.speakerNotes.text = `${spoken}\n\nRepository evidence:\n${references.map(x => `- ${x}`).join("\n")}`;
  notes.push({ title, spoken, references, backup });
  return s;
}

async function image(slide, imagePath, x, y, width, height, alt, contentType = "image/png") {
  const bytes = await fs.readFile(imagePath);
  slide.images.add({ blob: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType, alt, fit: "contain", position: { left: x, top: y, width, height } });
}

function table(slide, values, x, y, width, height, columnWidths, { bodySize = 25 } = {}) {
  const t = slide.tables.add({ rows: values.length, columns: values[0].length, left: x, top: y, width, height, columnWidths, values });
  t.borders.assign({ fill: C.line, width: 0.7, style: "solid" });
  for (let r = 0; r < values.length; r += 1) {
    for (let c = 0; c < values[0].length; c += 1) {
      const cell = t.getCell(r, c);
      cell.fill = r === 0 ? C.purple : (r % 2 ? C.white : C.pale);
      cell.text.style = { typeface: font, fontSize: r === 0 ? bodySize - 1 : bodySize, color: r === 0 ? C.white : C.ink, bold: r === 0, verticalAlignment: "middle", insets: 14 };
    }
  }
  return t;
}

{
  const s = slide("", "Hi, we are Theo and Wahab from Team 39. This is Jinni. It brings separate sources into one decision workspace. You set the conditions, compare the choices, and check the evidence. Our built-in examples use fictional data.", ["README.md", "docs/GENERAL_DECISIONS.md", "web/icon.svg"], { dark: true });
  text(s, "Jinni", 80, 158, 730, 154, 112, C.white, true);
  text(s, "Compare choices using separate sources\nand your priorities", 85, 335, 725, 122, 36, C.white);
  text(s, "Team 39: Theo and Wahab\nDo You Have the GUTS? 2026\nBlackRock challenge", 85, 550, 720, 104, 23, C.gold);
  await image(s, path.join(root, "web/icon.svg"), 885, 205, 245, 245, "Jinni's original lamp icon", "image/svg+xml");
}

{
  const s = slide("Maya's journey choice", "Meet Maya, our fictional user. She needs one journey within twenty-five pounds and three hours. The catalog names the choices. A separate feed adds their measurements. Neither feed alone gives a complete comparison. Jinni joins them and applies Maya's conditions.", ["data/decisions/travel-options.json", "data/decisions/travel-metrics.json", "app/comparison/adapters.py"]);
  text(s, "One journey within £25 and three hours", 80, 161, 1120, 65, 36, C.purple, true);
  table(s, [["Input", "What it contributes"], ["Option catalog", "The choices and their identities"], ["Measurement feed", "Cost, journey time and emissions"], ["Your conditions", "Budget, hard limits and priorities"]], 80, 259, 1120, 265, [310, 810], { bodySize: 27 });
  text(s, "Jinni joins the sources and explains what fits", 80, 588, 1120, 58, 32, C.ink, true);
}

{
  const s = slide("A workspace for the whole decision", "Here is the shared workspace. Conditions and selected sources sit on the left. The comparison stays in the middle. Ask AI stays beside it in the desktop app. We keep the calculated result separate from AI suggestions.", ["web/index.html", "web/decision-app.mjs", "web/desktop-ai.mjs", "docs/AI_OPTIONS.md", "docs/presentation/assets/pitch-comparison.png"]);
  text(s, "1\nSet conditions", 72, 185, 205, 115, 29, C.purple, true);
  text(s, "2\nCompare choices", 72, 345, 205, 115, 29, C.purple, true);
  text(s, "3\nCheck evidence", 72, 505, 205, 115, 29, C.purple, true);
  await image(s, path.join(output, "assets/pitch-comparison.png"), 300, 151, 910, 526, "Jinni desktop with conditions, a calculated fictional travel comparison and the Ask AI panel");
  text(s, "Fictional preset data. This screenshot makes no live AI request claim.", 300, 681, 910, 25, 18, C.muted);
}

{
  const s = slide("Maya's feasible journeys", "Maya's budget is twenty-five pounds and her time limit is three hours. Train and coach fit. Flight and taxi cost too much. Cycling takes too long. We then score the feasible choices using Maya's priorities. No API key is needed.", ["data/decisions/travel-options.json", "data/decisions/travel-metrics.json", "app/comparison/engine.py"]);
  text(s, "Budget £25     Journey limit 180 minutes", 80, 151, 1120, 55, 29, C.purple, true);
  table(s, [["Choice", "Cost", "Time", "Emissions", "Hard limits"], ["Train", "£18", "70 min", "2.2 kg CO2e", "Fits"], ["Coach", "£8", "120 min", "5 kg CO2e", "Fits"], ["Flight", "£70", "45 min", "60 kg CO2e", "Over budget"], ["Taxi", "£45", "60 min", "18 kg CO2e", "Over budget"], ["Cycle", "£0", "240 min", "0.3 kg CO2e", "Over time"]], 80, 230, 1120, 340, [205, 130, 170, 255, 360], { bodySize: 25 });
  text(s, "Hard limits filter first. Your priorities rank what remains.", 80, 603, 1120, 48, 28, C.ink, true);
  text(s, "Simulated journeys and emissions. Scores measure relative preference fit.", 80, 666, 1120, 29, 21, C.muted);
}

{
  const s = slide("AI with a source you can open", "You can import notes or a text PDF and select the evidence. Then ask a question or request new options. Each supported result has source quotations you can open. We check the quote against the selected passage. This does not prove every AI claim is true.", ["docs/AI_EXTENSION.md", "docs/AI_OPTIONS.md", "tests/desktop/options-ui.cjs"], { dark: true });
  text(s, "“The fictional museum opens at 11:00. The entrance has a ramp.”", 80, 206, 665, 250, 43, C.white, true);
  text(s, "Fictional museum guide\nMocked-provider example", 80, 495, 650, 70, 24, C.gold);
  text(s, "Your selected evidence", 820, 197, 360, 85, 32, C.gold, true);
  text(s, "Ask a question or request options.\n\nOpen the exact quote in its original context.", 820, 311, 360, 235, 28, C.white);
  text(s, "Quote validation checks source membership. People still judge the answer.", 80, 629, 1120, 57, 25, C.white);
}

{
  const s = slide("One interface, two editions", "Browser and desktop use the same interface files. Desktop calls our local Python API. Browser uses matching JavaScript rules. AI names the selected provider and keeps keys in session memory. Comparisons still work if AI fails. Theo handles the backend. Wahab handles the frontend and desktop interface.", ["docs/ARCHITECTURE.md", "docs/BROWSER.md", "web/platform.mjs", "docs/AI_PROVIDERS.md", "Team 39 role confirmation, 2026-10-18"]);
  table(s, [["", "Browser", "Electron desktop"], ["Interface", "Shared web interface", "Shared web interface"], ["Calculation", "Equivalent JavaScript", "Local Python API"], ["Source library", "Local IndexedDB", "Local SQLite"], ["Evidence help", "Original passage search", "Optional cited cloud AI"]], 80, 176, 1120, 350, [240, 440, 440], { bodySize: 26 });
  text(s, "The desktop identifies the selected AI recipient. Keys stay in session memory.\nCalculated comparisons stay available when AI fails.", 80, 563, 1120, 79, 26, C.purple, true);
  text(s, "Theo: backend     Wahab: frontend and desktop interface", 80, 665, 1000, 32, 23, C.muted);
}

{
  const s = slide("Maya's choice and its trade-offs", "Maya can see the trade-off. The train is faster and has lower simulated emissions. The coach is cheaper. Her limits make both feasible, and her priorities decide the ranking. The same core also supports other scenarios and custom criteria. Next, we want verified live data adapters and user testing. Thank you.", ["docs/GENERAL_DECISIONS.md", "docs/AI_OPTIONS.md", "docs/REQUIREMENTS.md", "data/decisions/travel-metrics.json"], { dark: true });
  text(s, "Train: £18, 70 minutes, 2.2 kg CO2e\nCoach: £8, 120 minutes, 5 kg CO2e", 80, 175, 1120, 122, 36, C.gold, true);
  text(s, "Her hard limits make both feasible.\nHer priorities decide the ranking.", 80, 335, 1120, 105, 32, C.white);
  text(s, "The same core supports market, student, sustainability\nand custom examples.", 80, 464, 1120, 77, 26, C.white);
  text(s, "Next: verified live data adapters and user testing", 80, 551, 1120, 53, 25, C.gold);
  text(s, "github.com/wahab-linux/my-jinni\nPrototype with fictional presets", 80, 625, 1120, 64, 23, C.white);
}

{
  const s = slide("Implementation and scoring", "The layers are experience, pure decision logic and data integration. OpenAPI documents request and response models. Tests cover boundaries, ranking, both sources and failures. Hard limits come first. We normalize feasible options and apply weights. Unknown required data excludes a choice. AI proposals do not silently change measurements or scores.", ["app/comparison/engine.py", "docs/GENERAL_DECISIONS.md", "docs/AI_OPTIONS.md", "docs/openapi.json", "docs/ARCHITECTURE.md"], { backup: true });
  text(s, "Shared interface     Pure decision core     Source adapters", 80, 162, 1120, 60, 28, C.purple, true);
  text(s, "1   Check availability and hard limits", 80, 251, 1120, 60, 31, C.ink, true);
  text(s, "2   Normalize feasible options and apply weights", 80, 346, 1120, 60, 31, C.ink, true);
  text(s, "score = 100 × Σ(weight × normalized value) / Σ(weight)", 80, 450, 1120, 65, 30, C.purple, true);
  text(s, "Unknown required data excludes a choice. Ties use stable IDs.\nNotes and AI proposals do not silently rewrite measurements or scores.", 80, 546, 1120, 76, 25, C.muted);
  text(s, "OpenAPI contract. Tests for boundaries, ranking, both sources and failures.", 80, 646, 1000, 36, 23, C.muted);
}

{
  const s = slide("Questions we expect", "These are short answers for questions. Our numbers are fictional. AI discusses evidence and proposes choices, while the calculation stays deterministic. Only explicit questions, selected snippets and requested context go to the selected provider. Codex was our development tool. The team reviewed code. The coordinator verified two real DeepSeek API requests: a cited answer and two cited options. That does not verify live desktop use or real-world data.", ["AGENTS.md", "docs/AI_EXTENSION.md", "docs/AI_OPTIONS.md", "docs/AI_USAGE.md", "Team 39 role/tool/review confirmation and live DeepSeek verification report, 2026-10-18"], { backup: true });
  const entries = [
    ["Why use AI?", "To discuss selected evidence and propose options.\nThe score stays deterministic."],
    ["Are the numbers live?", "No. The preset data is explicitly fictional."],
    ["What leaves the device?", "The question, selected snippets and explicitly requested\ncalculated context go to the chosen provider."],
    ["What did AI help build?", "Codex helped with planning, code, tests and this deck.\nThe team reviewed code and records human decisions."],
  ];
  for (let i = 0; i < entries.length; i += 1) {
    const y = 170 + i * 121;
    text(s, entries[i][0], 80, y, 345, 94, 28, C.purple, true);
    text(s, entries[i][1], 445, y, 745, 96, 27, C.ink);
  }
  text(s, "Live DeepSeek API checks passed for cited answers and option proposals.", 80, 671, 990, 24, 19, C.muted);
}

for (let i = 0; i < deck.slides.items.length; i += 1) {
  const s = deck.slides.items[i];
  const png = await deck.export({ slide: s, format: "png", scale: 1 });
  await fs.writeFile(path.join(build, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const draft = path.join(build, "Jinni_Pitch.draft.pptx");
await (await PresentationFile.exportPptx(deck)).save(draft);
const finalPath = path.join(output, process.env.JINNI_PRESENTATION_FILENAME ?? "Jinni_Pitch.pptx");
const result = await finalizePresentation({ workspaceDir: root, candidatePath: draft, finalPath, pythonExecutable: python, integrityValidatorPath: path.join(skill, "container_tools/inspect_presentation_package_integrity.py"), layoutValidatorPath: path.join(skill, "container_tools/inspect_presentation_layout_geometry.py"), layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit", ...[2, 4, 6].flatMap(number => ["--require-native-table-slide", String(number)])], explicitTotalSlideCount: 9, requiredNativeTableOwnerSlides: [2, 4, 6], requiredNativeChartOwnerSlides: [], fontPolicy: { basis: "design", families: [font] }, verifyArtifactToolImport: true, receiptPath: path.join(build, `${path.basename(finalPath)}.validation.json`) });
await fs.writeFile(path.join(build, "speaker-notes.json"), JSON.stringify(notes, null, 2));
console.log(JSON.stringify({ finalPath, slideCount: deck.slides.items.length, result }, null, 2));
