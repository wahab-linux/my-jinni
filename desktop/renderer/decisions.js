/* global $, element, uiElement, uiText, bindUIAttribute, i18n, clear, call, unwrap, ServiceError, showFeedback, showError, renderWarnings, invalidateChat */
/* exported initDecisionUI, loadDecisionCatalog, currentDecisionRequest, renderDecisionBrief, playFeedback */
"use strict";

const decisionState = {
  scenarios: [], scenario: null, dataset: null, custom: null, customDirty: false,
  token: 0, catalogToken: 0, result: null, busy: false, sound: false, audio: null,
};

function displayMeasure(value, criterion, custom = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return i18n.t("Unknown");
  if (criterion.unit === "pence") return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
  const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 }).format(value);
  return `${number}${criterion.unit ? ` ${custom ? criterion.unit : i18n.t(criterion.unit)}` : ""}`;
}

function configuredText(value, custom = Boolean(decisionState.custom)) {
  return custom ? value : i18n.t(value);
}

function configuredElement(tag, className, value, custom = Boolean(decisionState.custom)) {
  return custom ? element(tag, className, value) : uiElement(tag, className, value);
}

function decisionReason(text, custom = false) {
  const rules = [
    [/^For (.+), lower values are preferred\.$/, "For {label}, lower values are preferred."],
    [/^For (.+), higher values are preferred\.$/, "For {label}, higher values are preferred."],
    [/^Missing value for (.+)\.$/, "Missing value for {label}."],
    [/^(.+) exceeds its selected maximum\.$/, "{label} exceeds its selected maximum."],
    [/^(.+) is below its selected minimum\.$/, "{label} is below its selected minimum."],
  ];
  for (const [pattern, key] of rules) {
    const match = pattern.exec(text);
    if (match) return uiElement("span", "", key, { label: () => configuredText(match[1], custom) });
  }
  return uiElement("span", "", text);
}

function metricValue(metrics, id) {
  return Object.hasOwn(metrics, id) ? metrics[id] : null;
}

function fitLabel(score) {
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(score)} / 100`;
}

function setDecisionBusy(busy) {
  decisionState.busy = busy;
  $("decision-submit").disabled = busy || !decisionState.scenario;
  $("decision-submit").replaceChildren(uiElement("span", "", busy ? "Comparing both sources…" : "Compare my options"), element("span", "", "↗"));
}

function decisionPlaceholder(pending = false) {
  clear($("decision-results"));
  const placeholder = element("div", "decision-placeholder");
  placeholder.dataset.testid = "decision-empty";
  placeholder.append(element("span", "", "↗"), uiElement("h3", "", pending ? "Comparing your options…" : "Your comparison will appear here."), uiElement("p", "", pending ? "The service is checking both sources, applying hard limits and comparing your priorities." : "Set the importance of each measure and any hard limits, then choose Compare my options. You will see actual measurements, relative fit and the trade-offs behind the result."));
  $("decision-results").append(placeholder);
}

function invalidateDecision(message = "Priorities changed. Compare again to see an updated result.") {
  const hadResult = decisionState.result !== null || decisionState.busy;
  decisionState.token += 1;
  decisionState.result = null;
  setDecisionBusy(false);
  decisionPlaceholder();
  if (hadResult) showFeedback("decision-feedback", message);
  if ($("include-decision").checked) invalidateChat("Comparison settings changed. Ask again to include the updated decision.");
}

function criteriaControls(scenario) {
  clear($("decision-controls"));
  const defaults = scenario.default_request || {};
  for (const criterion of scenario.criteria) {
    const control = element("section", "criterion-control");
    const heading = element("div", "criterion-heading");
    const label = configuredElement("label", "", criterion.label);
    label.htmlFor = `weight-${criterion.id}`;
    heading.append(label, uiElement("span", "criterion-direction", criterion.direction === "minimize" ? "Lower is better" : "Higher is better"));
    const row = element("div", "weight-row");
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "any";
    slider.id = `range-${criterion.id}`; slider.dataset.testid = slider.id;
    bindUIAttribute(slider, "aria-label", "{label} importance", { label: () => configuredText(criterion.label) });
    const number = document.createElement("input");
    number.type = "number"; number.min = "0"; number.max = "100"; number.step = "any";
    number.id = `weight-${criterion.id}`; number.dataset.testid = number.id;
    const weights = defaults.weights || {};
    number.value = String(Object.hasOwn(weights, criterion.id) ? weights[criterion.id] : criterion.default_weight);
    slider.value = number.value;
    slider.addEventListener("input", () => { number.value = slider.value; invalidateDecision(); });
    number.addEventListener("input", () => { slider.value = number.value; invalidateDecision(); });
    row.append(slider, number);
    const constraint = defaults.constraints?.find((limit) => limit.criterion_id === criterion.id);
    const check = document.createElement("input");
    check.type = "checkbox"; check.id = `limit-enabled-${criterion.id}`; check.dataset.testid = check.id; check.checked = Boolean(constraint);
    const checkLabel = element("label", "check-row limit-label");
    checkLabel.append(check, uiElement("span", "", "Hard limit"));
    if (criterion.unit) checkLabel.append(element("span", "", " · "), configuredElement("span", "", criterion.unit === "pence" ? "GBP" : criterion.unit));
    const limitRow = element("div", "limit-row");
    const operator = document.createElement("select");
    operator.id = `limit-operator-${criterion.id}`; operator.dataset.testid = operator.id;
    bindUIAttribute(operator, "aria-label", "{label} limit comparison", { label: () => configuredText(criterion.label) });
    for (const [text, value] of [["At most", "lte"], ["At least", "gte"]]) { const option = new Option("", value); uiText(option, text); operator.append(option); }
    operator.value = constraint?.operator || (criterion.direction === "minimize" ? "lte" : "gte");
    const limit = document.createElement("input");
    limit.type = "text"; limit.inputMode = "decimal"; limit.autocomplete = "off";
    limit.id = `limit-${criterion.id}`; limit.dataset.testid = limit.id;
    bindUIAttribute(limit, "aria-label", criterion.unit === "pence" ? "{label} hard limit in pounds" : "{label} hard limit", { label: () => configuredText(criterion.label) });
    bindUIAttribute(limit, "placeholder", "Enter a limit");
    if (constraint) limit.value = criterion.unit === "pence" ? (constraint.value / 100).toFixed(2) : String(constraint.value);
    limitRow.hidden = !check.checked;
    check.addEventListener("change", () => { limitRow.hidden = !check.checked; invalidateDecision(); if (check.checked) limit.focus(); });
    for (const input of [operator, limit]) input.addEventListener("input", () => invalidateDecision());
    limitRow.append(operator, limit);
    control.append(heading, row, checkLabel, limitRow);
    $("decision-controls").append(control);
  }
}

function finiteInput(value, name, limit = 1e12) {
  if (!value.trim() || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new ServiceError("Enter a valid number for {name}.", 422, [], { name });
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > limit) throw new ServiceError("{name} must be finite and no larger than {limit} in magnitude.", 422, [], { name, limit });
  return number;
}

function currentDecisionRequest() {
  const scenario = decisionState.scenario;
  if (!scenario) throw new ServiceError("Choose a scenario and wait for its sources to load.", 422);
  if (decisionState.customDirty) throw new ServiceError("Apply your edited custom definition before comparing.", 422);
  const weights = {};
  const constraints = [];
  for (const criterion of scenario.criteria) {
    const weight = finiteInput($(`weight-${criterion.id}`).value, `${criterion.label} importance`, 100);
    if (weight < 0) throw new ServiceError("Importance weights must be between 0 and 100.", 422);
    weights[criterion.id] = weight;
    if ($(`limit-enabled-${criterion.id}`).checked) {
      const text = $(`limit-${criterion.id}`).value;
      let value;
      if (criterion.unit === "pence") {
        const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
        if (!match) throw new ServiceError("{label} needs a GBP amount with at most two decimal places.", 422, [], { label: () => configuredText(criterion.label) });
        value = (Number(match[2]) * 100 + Number((match[3] || "").padEnd(2, "0"))) * (match[1] === "-" ? -1 : 1);
        if (!Number.isSafeInteger(value) || Math.abs(value) > 1e12) throw new ServiceError("{label} exceeds the supported money range.", 422, [], { label: () => configuredText(criterion.label) });
      } else value = finiteInput(text, criterion.label);
      constraints.push({ criterion_id: criterion.id, operator: $(`limit-operator-${criterion.id}`).value, value });
    }
  }
  if (!Object.values(weights).some((weight) => weight > 0)) throw new ServiceError("Give at least one measure a positive importance weight.", 422);
  return { scenario_id: scenario.id, weights, constraints, ...(decisionState.custom ? { custom: decisionState.custom } : {}) };
}

function renderDecisionBrief(container, result) {
  const card = element("article", "decision-recommendation");
  const heading = element("div", "decision-recommendation-heading");
  heading.append(uiElement("span", "eyebrow", "CALCULATED RECOMMENDATION"), result.recommended ? element("span", "fit-score", fitLabel(result.recommended.score)) : uiElement("span", "fit-score", "No match"));
  card.append(heading);
  if (!result.recommended) {
    card.append(uiElement("h3", "", "No option meets these limits."), uiElement("p", "section-copy", result.summary));
  } else {
    card.append(element("h3", "", result.recommended.name), element("p", "section-copy", result.recommended.description));
    const facts = element("div", "decision-facts");
    for (const criterion of result.criteria) {
      const fact = element("div", "decision-fact");
      fact.append(configuredElement("span", "", criterion.label, result.scenario_id === "custom"), uiElement("strong", "", "{value}", { value: () => displayMeasure(metricValue(result.recommended.metrics, criterion.id), criterion, result.scenario_id === "custom") }));
      facts.append(fact);
    }
    card.append(facts);
    const reasons = element("ul", "reasons");
    for (const reason of result.recommended.reasons || []) { const item = element("li"); item.append(decisionReason(reason, result.scenario_id === "custom")); reasons.append(item); }
    card.append(reasons);
  }
  card.append(uiElement("p", "fit-explainer", "Relative preference fit among feasible options, not a probability, forecast or independent truth check."));
  container.append(card);
}

function renderDecision(container, result, warnings) {
  clear(container);
  container.classList.remove("result-enter");
  container.append(uiElement("p", "comparison-summary", result.summary));
  renderDecisionBrief(container, result);
  if (result.ranked.length) {
    const heading = element("div", "comparison-table-heading");
    heading.append(uiElement("h3", "", "Compare the trade-offs"), uiElement("span", "micro-copy", "{count} feasible · {excluded} excluded", { count: result.ranked.length, excluded: result.excluded.length }));
    container.append(heading);
    const scroll = element("div", "comparison-scroll");
    scroll.tabIndex = 0; scroll.setAttribute("role", "region"); bindUIAttribute(scroll, "aria-label", "Option comparison table");
    const table = element("table", "comparison-table");
    table.dataset.testid = "decision-table";
    const caption = uiElement("caption", "sr-only", "Feasible options ranked by relative preference fit. Actual measurements and units are listed for comparison.");
    const head = element("thead");
    const headingRow = element("tr");
    headingRow.append(uiElement("th", "", "Option"), uiElement("th", "", "Relative fit"));
    for (const criterion of result.criteria) headingRow.append(configuredElement("th", "", criterion.label, result.scenario_id === "custom"));
    head.append(headingRow);
    const body = element("tbody");
    for (const [index, option] of result.ranked.entries()) {
      const row = element("tr", index === 0 ? "recommended-row" : "");
      const name = element("th", "", option.name); name.scope = "row";
      name.append(element("small", "", option.category));
      const score = element("td", "table-score", fitLabel(option.score));
      const meter = document.createElement("meter"); meter.min = 0; meter.max = 100; meter.value = option.score; bindUIAttribute(meter, "aria-label", "{name} relative fit", { name: option.name });
      score.append(meter);
      row.append(name, score);
      for (const criterion of result.criteria) row.append(uiElement("td", "", "{value}", { value: () => displayMeasure(metricValue(option.metrics, criterion.id), criterion, result.scenario_id === "custom") }));
      body.append(row);
    }
    table.append(caption, head, body); scroll.append(table); container.append(scroll);
    const explanation = element("details", "decision-explanation");
    explanation.append(uiElement("summary", "", "Why this result? Show weighted contributions"));
    for (const contribution of result.recommended.contributions || []) explanation.append(uiElement("p", "", "{label}: {value} · importance {weight} · {points} fit points.", { label: () => configuredText(contribution.label, result.scenario_id === "custom"), value: () => displayMeasure(contribution.value, contribution, result.scenario_id === "custom"), weight: contribution.weight, points: Number(contribution.points.toFixed(2)) }));
    container.append(explanation);
  }
  if (result.excluded.length) {
    const excluded = element("details", "decision-excluded");
    excluded.dataset.testid = "decision-exclusions"; excluded.open = true;
    excluded.append(uiElement("summary", "", "{count} excluded by limits, availability or missing data", { count: result.excluded.length }));
    for (const option of result.excluded) {
      const item = element("div", "excluded-option");
      item.append(element("strong", "", option.name));
      const reasons = element("p");
      for (const reason of option.reasons) reasons.append(decisionReason(reason, result.scenario_id === "custom"), document.createTextNode(" "));
      item.append(reasons);
      excluded.append(item);
    }
    container.append(excluded);
  }
  const provenance = element("details", "provenance decision-provenance");
  provenance.append(uiElement("summary", "", "Two-source provenance and limitations"));
  for (const source of result.sources) provenance.append(uiElement("p", "", "{label} · {simulation} · Updated {date}", { label: source.label, simulation: () => i18n.t(source.is_simulated ? "Simulated" : "User-labelled; not independently verified"), date: source.updated_at }));
  for (const limitation of result.limitations || []) provenance.append(uiElement("p", "", limitation));
  container.append(provenance);
  renderWarnings(container, warnings);
  requestAnimationFrame(() => container.classList.add("result-enter"));
}

async function evaluateDecision(event) {
  event?.preventDefault();
  if (decisionState.busy) return;
  let request;
  try { request = currentDecisionRequest(); }
  catch (error) { decisionPlaceholder(); showError("decision-feedback", error); return; }
  const token = ++decisionState.token;
  decisionState.result = null;
  setDecisionBusy(true);
  decisionPlaceholder(true);
  showFeedback("decision-feedback", "Fetching both sources and applying your priorities…", "loading");
  try {
    const envelope = unwrap(await call("evaluateDecision", request));
    if (token !== decisionState.token) return;
    decisionState.result = envelope.data;
    renderDecision($("decision-results"), envelope.data, envelope.warnings);
    showFeedback("decision-feedback", envelope.data.recommended ? "Comparison complete. Review the measures and trade-offs." : "Comparison complete. No option meets the selected limits.", "success");
    playFeedback("result");
  } catch (error) {
    if (token !== decisionState.token) return;
    decisionPlaceholder();
    showError("decision-feedback", error, evaluateDecision);
  } finally {
    if (token === decisionState.token) setDecisionBusy(false);
  }
}

async function loadDecisionScenario(id) {
  invalidateDecision();
  const token = ++decisionState.token;
  decisionState.scenario = null; decisionState.dataset = null; decisionState.custom = null; decisionState.customDirty = false;
  $("decision-fields").disabled = true;
  $("decision-submit").disabled = true;
  $("decision-retry").hidden = true;
  $("custom-editor").hidden = true;
  $("custom-editor").open = false;
  $("decision-scenario").value = id;
  for (const button of $("scenario-shortcuts").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.scenarioId === id));
  showFeedback("decision-feedback", "Loading this scenario's two sources…", "loading");
  try {
    const envelope = unwrap(await call("getDecisionScenario", id));
    if (token !== decisionState.token) return;
    decisionState.scenario = envelope.data.scenario;
    decisionState.dataset = envelope.data.dataset;
    uiText($("scenario-description"), envelope.data.scenario.description);
    uiText($("scenario-notice"), envelope.data.scenario.notice);
    criteriaControls(envelope.data.scenario);
    $("decision-fields").disabled = false;
    setDecisionBusy(false);
    $("custom-editor").hidden = id !== "custom";
    if (id === "custom") $("custom-json").value = JSON.stringify({ title: envelope.data.scenario.title, criteria: envelope.data.scenario.criteria, dataset: envelope.data.dataset }, null, 2);
    showFeedback("decision-feedback", "Sources loaded. Set your priorities, then compare.");
  } catch (error) {
    if (token !== decisionState.token) return;
    showError("decision-feedback", error);
    $("decision-retry").hidden = false;
  }
}

async function loadDecisionCatalog() {
  const token = ++decisionState.catalogToken;
  showFeedback("decision-feedback", "Loading decision scenarios…", "loading");
  try {
    const envelope = unwrap(await call("getDecisionScenarios"));
    if (token !== decisionState.catalogToken) return;
    if (!envelope.data.scenarios?.length) throw new ServiceError("No configured decision scenarios were returned.");
    const previous = $("decision-scenario").value;
    decisionState.scenarios = envelope.data.scenarios;
    clear($("decision-scenario")); clear($("scenario-shortcuts"));
    for (const scenario of decisionState.scenarios) {
      const option = new Option("", scenario.id); uiText(option, scenario.title); $("decision-scenario").append(option);
      const button = uiElement("button", "scenario-shortcut", scenario.title);
      button.type = "button"; button.dataset.scenarioId = scenario.id;
      button.addEventListener("click", () => { playFeedback("select"); void loadDecisionScenario(scenario.id); });
      $("scenario-shortcuts").append(button);
    }
    $("decision-scenario").disabled = false;
    await loadDecisionScenario(decisionState.scenarios.some((scenario) => scenario.id === previous) ? previous : decisionState.scenarios[0].id);
  } catch (error) {
    if (token !== decisionState.catalogToken) return;
    showError("decision-feedback", error);
    $("decision-retry").hidden = false;
  }
}

function applyCustomDefinition() {
  try {
    const definition = JSON.parse($("custom-json").value);
    if (typeof definition.title !== "string" || !definition.title.trim() || !Array.isArray(definition.criteria) || !definition.criteria.length || definition.criteria.length > 10 || !definition.dataset || definition.criteria.some((criterion) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(criterion.id)) || new Set(definition.criteria.map((criterion) => criterion.id)).size !== definition.criteria.length) throw new ServiceError("Provide a title, one to ten uniquely identified criteria, and a dataset.", 422);
    decisionState.custom = definition;
    decisionState.customDirty = false;
    decisionState.scenario = { ...decisionState.scenario, title: definition.title, criteria: definition.criteria, default_request: { scenario_id: "custom", weights: {}, constraints: [] } };
    criteriaControls(decisionState.scenario);
    invalidateDecision();
    showFeedback("decision-feedback", "Custom definition applied. The service will validate both sources and calculate the comparison.", "success");
  } catch (error) {
    showError("decision-feedback", error instanceof ServiceError ? error : new ServiceError("The custom definition must be valid JSON. Check the editor and try again.", 422));
  }
}

function playFeedback(kind) {
  if (!decisionState.sound) return;
  try {
    if (!decisionState.audio) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      decisionState.audio = new Context();
    }
    const audio = decisionState.audio;
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    oscillator.frequency.value = kind === "result" ? 660 : 440;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.025, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + 0.14);
    window.dispatchEvent(new CustomEvent("my-jinni:sound", { detail: { kind } }));
  } catch { /* Optional audio must never interrupt a decision. */ }
}

function initDecisionUI() {
  $("decision-form").addEventListener("submit", evaluateDecision);
  $("decision-scenario").addEventListener("change", () => { playFeedback("select"); void loadDecisionScenario($("decision-scenario").value); });
  $("decision-retry").addEventListener("click", () => decisionState.scenarios.length ? loadDecisionScenario($("decision-scenario").value) : loadDecisionCatalog());
  $("custom-apply").addEventListener("click", applyCustomDefinition);
  $("custom-json").addEventListener("input", () => { decisionState.customDirty = true; invalidateDecision("Custom definition changed. Apply it before comparing."); });
  for (const name of ["library", "chat"]) {
    $(`${name}-open`).addEventListener("click", () => { $(`${name}-drawer`).showModal(); playFeedback("select"); });
    $(`${name}-close`).addEventListener("click", () => $(`${name}-drawer`).close());
  }
  $("sound-toggle").addEventListener("click", () => {
    decisionState.sound = !decisionState.sound;
    $("sound-toggle").setAttribute("aria-pressed", String(decisionState.sound));
    uiText($("sound-toggle"), decisionState.sound ? "Sound on" : "Sound off");
    playFeedback("select");
  });
  const applyTheme = (dark) => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("theme-toggle").setAttribute("aria-pressed", String(dark));
    uiText($("theme-toggle"), dark ? "Light theme" : "Dark theme");
  };
  try { applyTheme(localStorage.getItem("my-jinni-theme") === "dark"); } catch { applyTheme(false); }
  $("theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    applyTheme(dark);
    try { localStorage.setItem("my-jinni-theme", dark ? "dark" : "light"); } catch { /* Theme preference is optional. */ }
  });
}
