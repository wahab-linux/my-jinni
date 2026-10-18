# Jinni pitch guide

Team 39: Theo and Wahab. Theo owns the backend. Wahab owns the frontend and Electron desktop interface.

Use slides 1-7 for an approximately three-minute pitch. Slides 8-9 are optional answers for judges. Three minutes is a rehearsal target, not a confirmed official presentation limit. The PowerPoint contains the short English script in its speaker notes.

## Main script

### 1. Jinni

Hi, we are Theo and Wahab from Team 39. This is Jinni. It brings separate sources into one decision workspace. You set the conditions, compare the choices, and check the evidence. Our built-in examples use fictional data.

### 2. Maya's journey choice

Meet Maya, our fictional user. She needs one journey within twenty-five pounds and three hours. The catalog names the choices. A separate feed adds their measurements. Neither feed alone gives a complete comparison. Jinni joins them and applies Maya's conditions.

### 3. A workspace for the whole decision

Here is the shared workspace. Conditions and selected sources sit on the left. The comparison stays in the middle. Ask AI stays beside it in the desktop app. We keep the calculated result separate from AI suggestions.

### 4. Maya's feasible journeys

Maya's budget is twenty-five pounds and her time limit is three hours. Train and coach fit. Flight and taxi cost too much. Cycling takes too long. We then score the feasible choices using Maya's priorities. No API key is needed.

### 5. AI with a source you can open

You can import notes or a text PDF and select the evidence. Then ask a question or request new options. Each supported result has source quotations you can open. We check the quote against the selected passage. This does not prove every AI claim is true.

### 6. One interface, two editions

Browser and desktop use the same interface files. Desktop calls our local Python API. Browser uses matching JavaScript rules. AI names the selected provider and keeps keys in session memory. Comparisons still work if AI fails. Theo handles the backend. Wahab handles the frontend and desktop interface.

### 7. Maya's choice and its trade-offs

Maya can see the trade-off. The train is faster and has lower simulated emissions. The coach is cheaper. Her limits make both feasible, and her priorities decide the ranking. The same core also supports other scenarios and custom criteria. Next, we want verified live data adapters and user testing. Thank you.

## Short live demonstration

1. Open the desktop application and choose **Getting around**. Keep the fictional-data banner visible.
2. Set the spending limit to **GBP 25** and the journey-time limit to **180 minutes**. Compare train and coach. Point out why the other choices fail the hard limits.
3. Change one priority or limit and calculate again. Explain that deterministic rules calculate the result.
4. Select a prepared fictional note. Choose a provider and compatible model in AI settings. The app must show the recipient notice before a request.
5. Ask a source question or explicitly request options, then open an exact citation. Explain that source membership checks do not establish the truth of every generated claim.

If AI is unavailable, keep the calculated comparison working and describe the provider error plainly. The source quote shown on slide 5 comes from a controlled mocked-provider example. Do not describe that slide as a screenshot of a live AI answer.

## Short answers

**What makes this different from sorting a spreadsheet?**

We join separately shaped sources, apply hard constraints, and compare the remaining choices using the user's priorities. The interface keeps the original measurements and explanations available.

**How does scoring work?**

We check availability and limits first. Then we normalize the active criteria over feasible choices and combine them using the selected weights. A score describes relative preference fit, not a probability or forecast. Stable IDs resolve ties.

**Can a document change the score automatically?**

No. Selected notes inform AI answers and proposals. They do not silently rewrite comparison metrics or rankings.

**What is local and what goes to the AI provider?**

The library stays local. An explicit AI request sends the question, selected bounded evidence snippets and any explicitly included calculated context to the chosen provider. API-key providers keep separate keys in session memory. Vertex uses its separate ADC path.

**Did you test a real provider?**

Yes. The coordinator verified two actual DeepSeek `deepseek-flash` requests through the chat API: a cited answer and an option-proposal request returning two proposals with checked exact quotations. The returned calculated comparison matched the ordinary calculation. This establishes those API paths, not live desktop interaction, other providers, human usability or real-world source accuracy.

**How did you use AI?**

Codex was the development tool. It generated most implementation, tests and this deck. We chose the product direction and division of work, ran the application, and reviewed code. We did not regularly edit generated code manually. The final usage report follows the event's Level 5 definition rather than claiming the manual-editing condition of Level 4.

## Facts to preserve

- All preset option/measurement feeds and the museum example are fictional. They do not establish live market, transport, availability or emissions accuracy.
- The two differently shaped mock feeds run inside the backend. They are independent data formats, not two verified external organizations.
- The browser and Electron share frontend source files. Browser calculation and passage search remain local; cloud AI is a desktop feature.
- The deck does not claim a packaged Windows installer, complete provider coverage, user research, or human usability acceptance.
- Do not paste credentials into slides, notes, screenshots, source files or the repository.

## Editing and rebuilding

The editable PowerPoint is `Jinni_Pitch.pptx`. Its Artifact Tool JavaScript source is `build_pitch.mjs`; its public screenshot asset is `assets/pitch-comparison.png`. Text, tables and notes are native PowerPoint objects. The screenshot and original lamp artwork are embedded images.

Run the source from the repository root with the bundled Node runtime and `@oai/artifact-tool` environment. It uses the installed Presentations skill's finalizer and the bundled Python runtime. It does not use `python-pptx`.

```powershell
& 'C:\Users\roXy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' docs/presentation/build_pitch.mjs
```

The finalizer refuses to overwrite a final file. For a revision, set a new output filename before running:

```powershell
$env:JINNI_PRESENTATION_FILENAME = 'Jinni_Pitch_revised.pptx'
& 'C:\Users\roXy\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' docs/presentation/build_pitch.mjs
Remove-Item Env:JINNI_PRESENTATION_FILENAME
```

Environment overrides are `JINNI_PRESENTATION_ROOT`, `JINNI_PRESENTATION_MODULES`, `JINNI_PRESENTATION_SKILL` and `JINNI_PRESENTATION_PYTHON`. Temporary drafts and slide previews belong in `tmp/presentation/pitch`, outside the deliverable directory. Inspect every revised slide before presenting. Native PowerPoint application behavior should be checked on the presentation computer.
