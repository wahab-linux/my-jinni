/* global initDecisionUI, loadDecisionCatalog, currentDecisionRequest, renderDecisionBrief */
"use strict";

const state = {
  options: null,
  library: null,
  selectedSources: new Set(),
  backend: "starting",
  backendTimer: null,
  optionsToken: 0,
  libraryToken: 0,
  planToken: 0,
  chatToken: 0,
  viewerToken: 0,
  planBusy: false,
  chatBusy: false,
  libraryBusy: false,
  keyConfigured: false,
  provider: "openai",
  providers: [],
  models: new Map(),
  keySettingsToken: 0,
  planData: null,
  chatData: null,
};

const $ = (id) => document.getElementById(id);
const bridge = window.myJinni;

class ServiceError extends Error {
  constructor(message, status = 0, details = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined && text !== null) result.textContent = String(text);
  return result;
}

function clear(container) {
  container.replaceChildren();
}

function showFeedback(id, message = "", kind = "", retry = null) {
  const target = typeof id === "string" ? $(id) : id;
  target.className = `feedback${kind ? ` ${kind}` : ""}`;
  target.setAttribute("role", kind === "error" ? "alert" : "status");
  clear(target);
  if (message) target.append(element("span", "", message));
  if (retry) {
    const button = element("button", "text-button", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    target.append(button);
  }
}

function showError(id, error, retry = null) {
  const safe = error instanceof ServiceError
    ? error
    : new ServiceError("The desktop service could not complete this request. Please try again.");
  showFeedback(id, safe.message, "error", retry);
  if (safe.details.length) {
    const list = element("ul");
    for (const detail of safe.details) {
      list.append(element("li", "", `${detail.field || "Input"}: ${detail.message || "Check this value."}`));
    }
    $(id).append(list);
  }
}

async function call(name, ...args) {
  if (!bridge || typeof bridge[name] !== "function") {
    throw new ServiceError("The desktop connection is unavailable. Restart my-jinni and try again.");
  }
  try {
    return await bridge[name](...args);
  } catch {
    throw new ServiceError("The desktop service could not complete this request. Please try again.");
  }
}

function unwrap(response) {
  if (!response || response.status === 0) {
    throw new ServiceError(response?.connectionError || "Cannot reach the local service. Check the connection above, then retry.");
  }
  if (response.status < 200 || response.status >= 300 || response.body?.error) {
    const error = response.body?.error;
    throw new ServiceError(
      error?.message || `The request failed (HTTP ${response.status}). Please try again.`,
      response.status,
      Array.isArray(error?.details) ? error.details : [],
    );
  }
  if (!response.body || response.body.data === null || response.body.data === undefined) {
    throw new ServiceError("The local service returned an unexpected response.");
  }
  return response.body;
}

function currency(pence) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: state.options?.currency || "GBP" }).format(pence / 100);
}

function zoneParts(instant, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function timeLabel(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: state.options?.timezone || "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(timestamp));
}

function dateLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function penceFromText(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new ServiceError("Enter a nonnegative budget in pounds with at most two decimal places.", 422);
  const pence = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  if (!Number.isSafeInteger(pence)) throw new ServiceError("The budget is too large.", 422);
  return pence;
}

function awareTimestamp(date, time, timezone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new ServiceError("Choose a valid day and both times.", 422);
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (hour > 23 || minute > 59) throw new ServiceError("Choose a valid time.", 422);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  for (const shift of [-36, -12, 0, 12, 36]) {
    const sample = wallTime + shift * 3600000;
    const part = zoneParts(sample, timezone);
    offsets.add(Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - sample);
  }
  const candidates = [];
  for (const offset of offsets) {
    const instant = wallTime - offset;
    const part = zoneParts(instant, timezone);
    if (part.year === year && part.month === month && part.day === day && part.hour === hour && part.minute === minute) {
      candidates.push({ instant, offset });
    }
  }
  if (candidates.length !== 1) {
    throw new ServiceError(candidates.length
      ? "This time occurs twice when the clocks change. Choose an unambiguous time."
      : "This local time does not exist when the clocks change. Choose another time.", 422);
  }
  const offsetMinutes = candidates[0].offset / 60000;
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const suffix = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${date}T${time}:00${suffix}`;
}

function currentPreferences() {
  if (!state.options) throw new ServiceError("Load the activity options before including a plan.", 422);
  const budget = penceFromText($("budget").value);
  if (budget > state.options.max_budget_pence) {
    throw new ServiceError(`The demo budget limit is ${currency(state.options.max_budget_pence)}.`, 422);
  }
  const interests = Array.from($("interests").querySelectorAll("input:checked")).map((input) => input.value);
  if (!interests.length) throw new ServiceError("Choose at least one interest.", 422);
  if (!state.options.origins.some((origin) => origin.id === $("origin").value)) {
    throw new ServiceError("Choose a supported starting point.", 422);
  }
  if (!state.options.supported_dates.includes($("date").value)) throw new ServiceError("Choose a supported demo day.", 422);
  const depart = awareTimestamp($("date").value, $("depart").value, state.options.timezone);
  const returnBy = awareTimestamp($("date").value, $("return").value, state.options.timezone);
  if (Date.parse(returnBy) <= Date.parse(depart)) throw new ServiceError("Your return deadline must be later than your departure time.", 422);
  return { origin_id: $("origin").value, budget_pence: budget, depart_at: depart, return_by: returnBy, interests };
}

function originLabel(id) {
  return state.options?.origins.find((origin) => origin.id === id)?.label || id;
}

function updatePlanButton() {
  $("plan-submit").disabled = !state.options || state.planBusy;
  $("plan-submit").replaceChildren(document.createTextNode(state.planBusy ? "Checking activities and journeys…" : "Find a feasible plan"), element("span", "", "↗"));
}

function invalidatePlan() {
  const hadResult = state.planData !== null || state.planBusy;
  state.planToken += 1;
  state.planBusy = false;
  state.planData = null;
  clear($("planner-result"));
  updatePlanButton();
  showFeedback("planner-feedback", hadResult ? "Preferences changed. Find a plan to see an updated result." : "");
  if ($("include-plan").checked) invalidateChat("Activity preferences changed. Ask again to use the updated plan.");
}

function renderWarnings(container, warnings = []) {
  if (!warnings.length) return;
  const list = element("ul", "warning-list");
  for (const warning of warnings) list.append(element("li", "", warning.message));
  container.append(list);
}

function activityCard(activity, originId) {
  const card = element("article", "recommendation");
  const top = element("div", "recommendation-top");
  top.append(element("span", "", "YOUR MATCH"), element("span", "", activity.category.toUpperCase()));
  const heading = element("div", "recommendation-title");
  const title = element("div");
  title.append(element("h3", "", activity.title), element("p", "venue-label", activity.venue_name));
  const price = element("div", "total-price", currency(activity.total_cost_pence));
  price.append(element("small", "", "Total, including travel"));
  heading.append(title, price);
  const cost = element("p", "cost-line", `${currency(activity.ticket_cost_pence)} ticket + ${currency(activity.travel_cost_pence)} return travel`);
  const journey = element("div", "journey-row");
  const arrival = element("div", "journey-step");
  arrival.append(element("span", "", `Arrive · ${activity.outbound_minutes} min journey`), element("b", "", timeLabel(activity.arrive_at)));
  const back = element("div", "journey-step");
  back.append(element("span", "", `Return · ${activity.return_minutes} min journey`), element("b", "", timeLabel(activity.return_at)));
  journey.append(arrival, element("span", "journey-arrow", "→"), back);
  const hours = element("p", "event-hours", `Activity ${timeLabel(activity.starts_at)}–${timeLabel(activity.ends_at)} · Back to ${originLabel(originId)}`);
  const reasons = element("ul", "reasons");
  for (const reason of activity.reasons) reasons.append(element("li", "", reason));
  card.append(top, heading, cost, journey, hours, reasons);
  return card;
}

function renderPlan(container, data, warnings, originId, compact = false) {
  clear(container);
  if (data.recommended) {
    container.append(activityCard(data.recommended, originId));
  } else {
    const noMatch = element("div", "no-match");
    noMatch.append(element("h3", "", "No activity fits this window yet."), element("p", "", data.message || "Try a different budget, time window or interest."));
    container.append(noMatch);
  }
  if (!compact && data.alternatives?.length) {
    container.append(element("p", "alternatives-heading", "A COUPLE OF ALTERNATIVES"));
    for (const activity of data.alternatives.slice(0, 2)) {
      const alternative = element("article", "alternative");
      const description = element("div");
      description.append(element("h4", "", activity.title), element("p", "", `${activity.venue_name} · ${timeLabel(activity.starts_at)}–${timeLabel(activity.ends_at)}`));
      const price = element("div", "alternative-price", currency(activity.total_cost_pence));
      price.append(element("small", "", `Back ${timeLabel(activity.return_at)}`));
      alternative.append(description, price);
      container.append(alternative);
    }
  }
  const provenance = element("details", "provenance");
  provenance.append(element("summary", "", "Source details · simulated activity and travel"));
  for (const source of data.sources || []) {
    const date = new Intl.DateTimeFormat("en-GB", {
      timeZone: state.options?.timezone || "Europe/London", dateStyle: "medium", timeStyle: "short",
    }).format(new Date(source.updated_at));
    provenance.append(element("p", "", `${source.label} · Updated ${date}${source.origin_id ? ` · From ${originLabel(source.origin_id)}` : ""}. Fictional data; not live freshness.`));
  }
  container.append(provenance);
  renderWarnings(container, warnings);
}

async function submitPlan(event) {
  event?.preventDefault();
  if (state.planBusy) return;
  let preferences;
  try {
    preferences = currentPreferences();
  } catch (error) {
    clear($("planner-result"));
    state.planData = null;
    showError("planner-feedback", error);
    return;
  }
  const token = ++state.planToken;
  state.planBusy = true;
  state.planData = null;
  clear($("planner-result"));
  updatePlanButton();
  showFeedback("planner-feedback", "Checking both activity and return-travel data…", "loading");
  try {
    const envelope = unwrap(await call("recommend", preferences));
    if (token !== state.planToken) return;
    state.planData = envelope.data;
    renderPlan($("planner-result"), envelope.data, envelope.warnings, preferences.origin_id);
    showFeedback("planner-feedback", envelope.data.recommended ? "A calculated plan that fits your preferences." : "Search complete. Try adjusting the constraints.", "success");
  } catch (error) {
    if (token !== state.planToken) return;
    clear($("planner-result"));
    showError("planner-feedback", error, submitPlan);
  } finally {
    if (token === state.planToken) {
      state.planBusy = false;
      updatePlanButton();
    }
  }
}

function populateOptions(options) {
  const previous = state.options ? {
    origin: $("origin").value, date: $("date").value, budget: $("budget").value,
    depart: $("depart").value, back: $("return").value,
    interests: Array.from($("interests").querySelectorAll("input:checked")).map((input) => input.value),
  } : null;
  state.options = options;
  clear($("origin"));
  for (const origin of options.origins) $("origin").append(new Option(origin.label, origin.id));
  clear($("date"));
  for (const date of options.supported_dates) $("date").append(new Option(dateLabel(date), date));
  const defaults = options.default_request;
  const departure = zoneParts(Date.parse(defaults.depart_at), options.timezone);
  const back = zoneParts(Date.parse(defaults.return_by), options.timezone);
  $("origin").value = previous && options.origins.some((origin) => origin.id === previous.origin) ? previous.origin : defaults.origin_id;
  $("date").value = previous && options.supported_dates.includes(previous.date) ? previous.date : `${departure.year}-${String(departure.month).padStart(2, "0")}-${String(departure.day).padStart(2, "0")}`;
  $("budget").value = previous?.budget ?? (defaults.budget_pence / 100).toFixed(2);
  $("depart").value = previous?.depart || `${String(departure.hour).padStart(2, "0")}:${String(departure.minute).padStart(2, "0")}`;
  $("return").value = previous?.back || `${String(back.hour).padStart(2, "0")}:${String(back.minute).padStart(2, "0")}`;
  clear($("interests"));
  for (const interest of options.interests) {
    const label = element("label", "interest-choice");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "interests";
    input.value = interest.id;
    input.checked = (previous?.interests || defaults.interests).includes(interest.id);
    input.dataset.testid = `interest-${interest.id}`;
    label.append(input, element("span", "", interest.label));
    $("interests").append(label);
  }
  $("timezone-label").textContent = `Times in ${options.timezone}`;
  $("budget-help").textContent = `Includes travel · Max ${currency(options.max_budget_pence)}`;
  $("planner-fields").disabled = false;
  updatePlanButton();
}

async function loadOptions() {
  const token = ++state.optionsToken;
  if (state.options) invalidatePlan();
  $("planner-fields").disabled = true;
  $("options-retry").hidden = true;
  showFeedback("options-state", "Loading your planning options…", "loading");
  try {
    const envelope = unwrap(await call("getOptions"));
    if (token !== state.optionsToken) return;
    if (!envelope.data.origins?.length || !envelope.data.supported_dates?.length || !envelope.data.default_request) {
      throw new ServiceError("The service did not provide usable planning options.");
    }
    populateOptions(envelope.data);
    showFeedback("options-state");
  } catch (error) {
    if (token !== state.optionsToken) return;
    state.options = null;
    $("planner-fields").disabled = true;
    showError("options-state", error);
    $("options-retry").hidden = false;
  }
}

function updateSelection() {
  const count = state.selectedSources.size;
  $("chat-selection").textContent = `${count} source${count === 1 ? "" : "s"} selected`;
}

function renderSources() {
  const container = $("source-list");
  clear(container);
  const sources = state.library?.sources || [];
  $("source-count").textContent = `YOUR SOURCES · ${sources.length}`;
  if (!sources.length) {
    const empty = element("div", "library-empty");
    empty.append(element("span", "empty-symbol", "≡"), element("h3", "", "Bring your own context."), element("p", "", "Add a guide, a useful note, or a few lines of text to get started."));
    container.append(empty);
  }
  for (const source of sources) {
    const item = element("article", `source-item${state.selectedSources.has(source.id) ? " selected" : ""}`);
    const label = element("label", "source-label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = source.id;
    checkbox.checked = state.selectedSources.has(source.id);
    checkbox.dataset.testid = "source-checkbox";
    checkbox.dataset.sourceId = source.id;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedSources.add(source.id);
      else state.selectedSources.delete(source.id);
      item.classList.toggle("selected", checkbox.checked);
      updateSelection();
      invalidateChat("Source selection changed. Ask again to use the selected context.");
    });
    const text = element("span", "source-text");
    text.append(element("span", "source-title", source.title), element("span", "source-meta", `${source.kind} · ${source.chunk_count} passage${source.chunk_count === 1 ? "" : "s"}`));
    if (source.is_simulated) text.append(element("span", "source-simulation", "Fictional / AI-generated"));
    label.append(checkbox, text);
    const actions = element("div", "source-actions");
    const view = element("button", "text-button", "View text ↗");
    view.type = "button";
    view.dataset.testid = "source-view";
    view.dataset.sourceId = source.id;
    view.setAttribute("aria-label", `View ${source.title}`);
    view.addEventListener("click", () => openSource(source.id));
    const remove = element("button", "text-button remove", "Remove");
    remove.type = "button";
    remove.dataset.testid = "source-delete";
    remove.dataset.sourceId = source.id;
    remove.setAttribute("aria-label", `Remove ${source.title}`);
    remove.addEventListener("click", () => deleteSource(source.id, remove));
    actions.append(view, remove);
    item.append(label, actions);
    container.append(item);
  }
  updateSelection();
}

async function refreshSources() {
  const token = ++state.libraryToken;
  showFeedback("library-status", "Opening your local library…", "loading");
  try {
    const envelope = unwrap(await call("listSources"));
    if (token !== state.libraryToken) return;
    const available = new Set(envelope.data.sources.map((source) => source.id));
    const previousCount = state.selectedSources.size;
    state.selectedSources = new Set([...state.selectedSources].filter((id) => available.has(id)));
    if (previousCount !== state.selectedSources.size) invalidateChat("A selected source was removed. Choose sources and ask again.");
    state.library = envelope.data;
    populateProviders(envelope.data);
    $("library-limits").textContent = `TXT, Markdown, text PDFs · ${Math.floor(envelope.data.max_upload_bytes / 1024 / 1024)} MiB · ${envelope.data.max_sources} sources max`;
    renderSources();
    showFeedback("library-status");
    return true;
  } catch (error) {
    if (token !== state.libraryToken) return;
    showError("library-status", error, refreshSources);
    return false;
  }
}

function rememberCreatedSource(source) {
  const previous = state.library?.sources || [];
  state.library = { ...state.library, sources: [source, ...previous.filter((item) => item.id !== source.id)] };
  state.selectedSources.add(source.id);
  renderSources();
}

function setLibraryBusy(busy) {
  state.libraryBusy = busy;
  $("import-source").disabled = busy;
  $("add-source-submit").disabled = busy;
}

async function importSource() {
  if (state.libraryBusy) return;
  setLibraryBusy(true);
  showFeedback("library-status", "Choose a document in the file picker…", "loading");
  try {
    const response = await call("importSource", { is_simulated: $("source-simulated").checked });
    if (response?.cancelled) {
      showFeedback("library-status", "Import cancelled. Your library is unchanged.");
      return;
    }
    const envelope = unwrap(response);
    rememberCreatedSource(envelope.data);
    invalidateChat("A new source was selected. Ask again to use it.");
    if (await refreshSources()) showFeedback("library-status", "Source imported and selected.", "success");
  } catch (error) {
    showError("library-status", error);
  } finally {
    setLibraryBusy(false);
  }
}

async function addTextSource(event) {
  event.preventDefault();
  if (state.libraryBusy) return;
  const title = $("source-title").value.trim();
  const text = $("source-text").value;
  if (!title || !text.trim()) {
    showError("library-status", new ServiceError("Add a title and some source text before saving.", 422));
    return;
  }
  setLibraryBusy(true);
  showFeedback("library-status", "Saving the source on this device…", "loading");
  try {
    const envelope = unwrap(await call("addTextSource", { title, text, is_simulated: $("text-source-simulated").checked }));
    rememberCreatedSource(envelope.data);
    $("text-source-form").reset();
    $("text-source-form").hidden = true;
    $("add-text-toggle").setAttribute("aria-expanded", "false");
    invalidateChat("A new source was selected. Ask again to use it.");
    if (await refreshSources()) showFeedback("library-status", "Source saved and selected.", "success");
  } catch (error) {
    showError("library-status", error);
  } finally {
    setLibraryBusy(false);
  }
}

async function deleteSource(id, button) {
  button.disabled = true;
  try {
    unwrap(await call("deleteSource", id));
    state.selectedSources.delete(id);
    if (state.library) state.library.sources = state.library.sources.filter((source) => source.id !== id);
    renderSources();
    invalidateChat("A source was removed. Ask again with the remaining context.");
    if (await refreshSources()) showFeedback("library-status", "Source removed from this device.", "success");
  } catch (error) {
    showError("library-status", error);
    button.disabled = false;
  }
}

function highlightedText(text, quote) {
  const paragraph = element("div");
  const index = quote ? text.indexOf(quote) : -1;
  if (index < 0) paragraph.textContent = text;
  else paragraph.append(document.createTextNode(text.slice(0, index)), element("mark", "", quote), document.createTextNode(text.slice(index + quote.length)));
  return paragraph;
}

async function openSource(id, citation = null, planner = null, originId = null, decision = null) {
  const token = ++state.viewerToken;
  $("source-dialog-content").className = "source-dialog-content";
  $("source-dialog-title").textContent = citation?.source_title || "Source text";
  $("citation-quote").hidden = !citation;
  $("citation-quote").textContent = citation ? `“${citation.quote}”${citation.page ? `\nPage ${citation.page}` : ""}${citation.is_simulated ? "\nFictional / simulated source" : ""}` : "";
  clear($("source-dialog-content"));
  if (!$("source-dialog").open) $("source-dialog").showModal();
  if (id === "planner-context") {
    $("source-dialog-content").append(element("p", "section-copy", "Calculated for this question from the activity form. This simulated context is temporary and is not saved in your library."));
    if (planner) {
      const plan = element("div");
      renderPlan(plan, planner, [], originId, true);
      $("source-dialog-content").append(plan);
    }
    return;
  }
  if (id === "decision-context") {
    $("source-dialog-content").append(element("p", "section-copy", "Calculated for this question from your current comparison settings. The returned decision is authoritative; this temporary context is not a saved library source."));
    if (decision) renderDecisionBrief($("source-dialog-content"), decision);
    return;
  }
  showFeedback($("source-dialog-content"), "Opening the extracted source text…", "loading");
  try {
    const envelope = unwrap(await call("getSource", id));
    if (token !== state.viewerToken || !$("source-dialog").open) return;
    const { source, chunks } = envelope.data;
    $("source-dialog-title").textContent = source.title;
    $("source-dialog-content").className = "source-dialog-content";
    clear($("source-dialog-content"));
    $("source-dialog-content").append(element("p", "micro-copy", `${source.kind.toUpperCase()} · Extracted text${source.is_simulated ? " · Fictional / AI-generated" : " · Source content is not independently verified"}`));
    for (const chunk of chunks) {
      const passage = element("section", "source-chunk");
      passage.append(element("p", "chunk-heading", chunk.page ? `Page ${chunk.page} · Passage ${chunk.index + 1}` : `Passage ${chunk.index + 1}`), highlightedText(chunk.text, citation?.quote));
      $("source-dialog-content").append(passage);
    }
    const highlight = $("source-dialog-content").querySelector("mark");
    if (highlight) highlight.scrollIntoView({ block: "center" });
  } catch (error) {
    if (token !== state.viewerToken) return;
    showError("source-dialog-content", error, () => openSource(id, citation, planner, originId, decision));
  }
}

function updateChatButton() {
  $("ask-submit").disabled = state.chatBusy;
  $("ask-submit").replaceChildren(document.createTextNode(state.chatBusy ? "Reading selected evidence…" : "Ask with selected context"), element("span", "", "↑"));
}

function resetChatResult() {
  state.chatData = null;
  $("chat-result").hidden = true;
  $("chat-empty").hidden = false;
  clear($("chat-answer"));
  clear($("citations"));
  clear($("chat-planner"));
  clear($("chat-decision"));
  clear($("chat-warnings"));
}

function invalidateChat(message = "") {
  const hadResult = state.chatData !== null || state.chatBusy;
  state.chatToken += 1;
  state.chatBusy = false;
  resetChatResult();
  updateChatButton();
  showFeedback("chat-feedback", hadResult ? message : "");
}

function renderChat(envelope, preferences) {
  const data = envelope.data;
  state.chatData = data;
  $("chat-empty").hidden = true;
  $("chat-result").hidden = false;
  $("answer-label").textContent = data.status === "insufficient_evidence" ? "INSUFFICIENT EVIDENCE" : "SOURCE-GROUNDED ANSWER";
  $("chat-answer").textContent = data.answer;
  clear($("citations"));
  for (const [index, citation] of (data.citations || []).entries()) {
    const button = element("button", "citation-reference");
    button.type = "button";
    button.dataset.testid = "citation-reference";
    button.dataset.sourceId = citation.source_id;
    const label = element("span", "", citation.source_title);
    label.append(element("small", "", `${citation.page ? `Page ${citation.page} · ` : ""}${citation.is_simulated ? "Simulated source · " : ""}Open exact quote ↗`));
    button.append(element("b", "", index + 1), label);
    button.addEventListener("click", () => openSource(citation.source_id, citation, data.planner, preferences?.origin_id, data.decision));
    $("citations").append(button);
  }
  clear($("chat-planner"));
  if (data.planner) {
    $("chat-planner").append(element("h4", "", "YOUR CALCULATED PLAN · AUTHORITATIVE COST AND TIMING"));
    const planner = element("div");
    renderPlan(planner, data.planner, [], preferences?.origin_id, true);
    $("chat-planner").append(planner);
  }
  clear($("chat-decision"));
  if (data.decision) {
    $("chat-decision").append(element("h4", "", "AUTHORITATIVE CALCULATED COMPARISON"));
    renderDecisionBrief($("chat-decision"), data.decision);
  }
  clear($("chat-warnings"));
  renderWarnings($("chat-warnings"), envelope.warnings);
  const recipient = providerLabel(data.provider || state.provider);
  $("chat-model-label").textContent = data.model ? `${recipient} · ${data.model} · This question has no chat history.` : `${recipient} selected · No AI call was needed for this response.`;
}

async function submitChat(event) {
  event?.preventDefault();
  if (state.chatBusy) return;
  let request;
  try {
    const question = $("question").value.trim();
    if (!question || question.length > 2000) throw new ServiceError("Enter a question of up to 2,000 characters.", 422);
    if (!state.selectedSources.size && !$("include-plan").checked && !$("include-decision").checked) throw new ServiceError("Select a source or include comparison/activity preferences first.", 422);
    const model = $("model").value.trim();
    if (!state.providers.some((provider) => provider.id === state.provider)) throw new ServiceError("Load the available AI providers before asking a question.", 422);
    if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(model)) throw new ServiceError("Choose a valid provider model in Model settings. Refresh the library to load its default.", 422);
    request = { question, source_ids: [...state.selectedSources], provider: state.provider, model };
    if ($("include-plan").checked) request.preferences = currentPreferences();
    if ($("include-decision").checked) request.decision_request = currentDecisionRequest();
  } catch (error) {
    resetChatResult();
    showError("chat-feedback", error);
    return;
  }
  const token = ++state.chatToken;
  state.chatBusy = true;
  resetChatResult();
  $("chat-empty").hidden = true;
  updateChatButton();
  showFeedback("chat-feedback", "Retrieving selected evidence and preparing an answer…", "loading");
  try {
    const envelope = unwrap(await call("askQuestion", request));
    if (token !== state.chatToken) return;
    if (envelope.data.provider && envelope.data.provider !== request.provider) throw new ServiceError("The answer did not match the selected provider. Please try again.", 502);
    renderChat(envelope, request.preferences);
    showFeedback("chat-feedback", envelope.data.status === "answered" ? "Answer ready. Open a citation to check its context." : "No supported answer was found in the selected evidence.", envelope.data.status === "answered" ? "success" : "");
  } catch (error) {
    if (token !== state.chatToken) return;
    resetChatResult();
    showError("chat-feedback", error, submitChat);
    if (error instanceof ServiceError && error.status === 401) {
      const settings = element("button", "text-button", "Open AI session settings");
      settings.type = "button";
      settings.addEventListener("click", openSettings);
      $("chat-feedback").append(settings);
    }
  } finally {
    if (token === state.chatToken) {
      state.chatBusy = false;
      updateChatButton();
    }
  }
}

function setKeyIndicator(configured) {
  state.keyConfigured = Boolean(configured);
  $("key-indicator").textContent = configured ? "Session key saved" : "Key not set";
  $("key-indicator").classList.toggle("configured", Boolean(configured));
}

function providerLabel(providerId = state.provider) {
  return state.providers.find((provider) => provider.id === providerId)?.label || (providerId === "openai" ? "OpenAI" : providerId);
}

function populateProviders(capabilities) {
  const catalog = capabilities.providers === undefined
    ? [{ id: capabilities.provider, label: "OpenAI", default_model: capabilities.default_model }]
    : capabilities.providers;
  const allowed = ["openai", "deepseek", "gemini", "anthropic"];
  if (!Array.isArray(catalog) || !catalog.length
      || catalog.some((provider) => !allowed.includes(provider.id) || typeof provider.label !== "string" || typeof provider.default_model !== "string")
      || new Set(catalog.map((provider) => provider.id)).size !== catalog.length
      || !catalog.some((provider) => provider.id === state.provider)) {
    throw new ServiceError("The local service returned an unsupported provider catalog. Refresh the library to retry.");
  }
  state.providers = catalog;
  for (const provider of catalog) {
    if (!state.models.has(provider.id)) state.models.set(provider.id, provider.default_model);
  }
  for (const id of ["provider", "settings-provider"]) {
    clear($(id));
    for (const provider of catalog) $(id).append(new Option(provider.label, provider.id));
    $(id).value = state.provider;
    $(id).disabled = false;
  }
  renderProviderChoice();
  void refreshKeySettings();
}

function renderProviderChoice() {
  $("provider").value = state.provider;
  $("settings-provider").value = state.provider;
  $("model").value = state.models.get(state.provider) || "";
  $("settings-model").value = state.models.get(state.provider) || "";
  $("cloud-recipient").textContent = providerLabel();
  $("api-key-label").textContent = `${providerLabel()} API key`;
}

function chooseProvider(providerId) {
  if (providerId === state.provider) return;
  if (!state.providers.some((provider) => provider.id === providerId)) return;
  state.models.set(state.provider, $("model").value);
  state.provider = providerId;
  $("api-key").value = "";
  $("save-key").disabled = false;
  $("clear-key").disabled = false;
  renderProviderChoice();
  invalidateChat("AI provider changed. Ask again to use the selected provider.");
  void refreshKeySettings();
}

function updateModel(input) {
  state.models.set(state.provider, input.value);
  $("model").value = input.value;
  $("settings-model").value = input.value;
  invalidateChat("Model changed. Ask again for an updated answer.");
}

function sessionSettings(result) {
  if (result?.body?.error || result?.status === 0) unwrap(result);
  if (typeof result?.configured !== "boolean") throw new ServiceError("The desktop service returned an unexpected session-setting response.");
  return result;
}

async function openSettings() {
  $("api-key").value = "";
  if (!$("settings-dialog").open) $("settings-dialog").showModal();
  await refreshKeySettings();
}

async function refreshKeySettings() {
  const token = ++state.keySettingsToken;
  const provider = state.provider;
  $("save-key").disabled = false;
  $("clear-key").disabled = false;
  state.keyConfigured = false;
  $("key-indicator").textContent = "Checking session key…";
  $("key-indicator").classList.remove("configured");
  showFeedback("key-status", `Checking the ${providerLabel(provider)} session key…`, "loading");
  try {
    const settings = sessionSettings(await call("getSessionSettings", provider));
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    setKeyIndicator(settings.configured);
    showFeedback("key-status", settings.configured ? `${providerLabel(provider)} key saved for this session. Account access has not been checked.` : `No ${providerLabel(provider)} key is saved. Planning and your library are still available.`);
  } catch (error) {
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    setKeyIndicator(false);
    showError("key-status", error);
  }
}

async function saveKey(event) {
  event.preventDefault();
  const key = $("api-key").value.trim();
  $("api-key").value = "";
  if (!key) {
    showError("key-status", new ServiceError("Enter an API key, or use Clear session key."));
    return;
  }
  const provider = state.provider;
  const token = ++state.keySettingsToken;
  $("save-key").disabled = true;
  try {
    const settings = sessionSettings(await call("setSessionApiKey", { provider, key }));
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    setKeyIndicator(settings.configured);
    showFeedback("key-status", `${providerLabel(provider)} key saved for this session. Access is checked when you ask an AI question.`, "success");
  } catch (error) {
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    showError("key-status", error);
  } finally {
    if (token === state.keySettingsToken && provider === state.provider) $("save-key").disabled = false;
  }
}

async function clearKey() {
  $("api-key").value = "";
  const provider = state.provider;
  const token = ++state.keySettingsToken;
  $("clear-key").disabled = true;
  try {
    const settings = sessionSettings(await call("clearSessionApiKey", provider));
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    setKeyIndicator(settings.configured);
    showFeedback("key-status", `${providerLabel(provider)} session key cleared. Other providers, the planner and library are unchanged.`, "success");
  } catch (error) {
    if (token !== state.keySettingsToken || provider !== state.provider) return;
    showError("key-status", error);
  } finally {
    if (token === state.keySettingsToken && provider === state.provider) $("clear-key").disabled = false;
  }
}

function renderBackendStatus(status) {
  state.backend = status.state;
  $("backend-status").className = `connection-badge ${status.state}`;
  $("backend-status").textContent = status.state === "ready" ? "Local service ready" : status.message || "Starting local service…";
  $("backend-status").title = status.message || "";
  $("backend-retry").hidden = status.state !== "error";
}

async function pollBackend() {
  clearTimeout(state.backendTimer);
  try {
    const previous = state.backend;
    const status = await call("getBackendStatus");
    renderBackendStatus(status);
    if (status.state === "starting") state.backendTimer = setTimeout(pollBackend, 1000);
    if (status.state === "ready" && previous !== "ready") await Promise.allSettled([loadOptions(), refreshSources(), loadDecisionCatalog()]);
  } catch {
    renderBackendStatus({ state: "error", message: "The desktop service is unavailable. Retry the connection." });
    showFeedback("options-state", "Waiting for the local service. Use Retry connection above.", "error");
    $("options-retry").hidden = false;
  }
}

async function retryBackend() {
  $("backend-retry").disabled = true;
  renderBackendStatus({ state: "starting", message: "Reconnecting to the local service…" });
  state.optionsToken += 1;
  state.libraryToken += 1;
  invalidatePlan();
  invalidateChat("The service connection changed. Ask again after reconnecting.");
  try {
    const status = await call("retryBackend");
    renderBackendStatus(status);
    if (status.state === "ready") await Promise.allSettled([loadOptions(), refreshSources(), loadDecisionCatalog()]);
    else if (status.state === "starting") state.backendTimer = setTimeout(pollBackend, 500);
  } catch {
    renderBackendStatus({ state: "error", message: "Could not start the local service. Check setup and retry." });
  } finally {
    $("backend-retry").disabled = false;
  }
}

$("planner-form").addEventListener("submit", submitPlan);
$("planner-form").addEventListener("input", invalidatePlan);
$("planner-form").addEventListener("change", invalidatePlan);
$("options-retry").addEventListener("click", loadOptions);
$("backend-retry").addEventListener("click", retryBackend);
$("library-refresh").addEventListener("click", refreshSources);
$("import-source").addEventListener("click", importSource);
$("text-source-form").addEventListener("submit", addTextSource);
$("add-text-toggle").addEventListener("click", () => {
  const form = $("text-source-form");
  form.hidden = !form.hidden;
  $("add-text-toggle").setAttribute("aria-expanded", String(!form.hidden));
  if (!form.hidden) $("source-title").focus();
});
$("chat-form").addEventListener("submit", submitChat);
for (const id of ["question", "include-plan", "include-decision"]) {
  $(id).addEventListener("input", () => invalidateChat("Question context changed. Ask again for an updated answer."));
  $(id).addEventListener("change", () => invalidateChat("Question context changed. Ask again for an updated answer."));
}
for (const id of ["provider", "settings-provider"]) $(id).addEventListener("change", () => chooseProvider($(id).value));
for (const id of ["model", "settings-model"]) {
  $(id).addEventListener("input", () => updateModel($(id)));
  $(id).addEventListener("change", () => updateModel($(id)));
}
$("settings-button").addEventListener("click", openSettings);
$("chat-settings-button").addEventListener("click", openSettings);
$("settings-form").addEventListener("submit", saveKey);
$("clear-key").addEventListener("click", clearKey);
$("settings-close").addEventListener("click", () => $("settings-dialog").close());
$("settings-dialog").addEventListener("close", () => { $("api-key").value = ""; });
$("source-close").addEventListener("click", () => $("source-dialog").close());
$("source-dialog").addEventListener("close", () => { state.viewerToken += 1; });
updateSelection();
renderSources();
updateChatButton();
initDecisionUI();
pollBackend();
void refreshKeySettings();
