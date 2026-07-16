const {
  addDays,
  addMonths,
  createExampleItems,
  durationLabel,
  endTime,
  escapeHtml,
  findAvailableSlot,
  findScheduleConflict,
  freeIntervals,
  formatDay,
  fromDateKey,
  initialState,
  minutesFromTime,
  monthCalendar,
  occurrenceForDate,
  planningSummary,
  scheduleConflictIds,
  timeFromMinutes,
  toDateKey,
  uid,
  weekdayLabel
} = window.YiriCore;

let state = window.YiriStore.read();
state.selectedDate = toDateKey(new Date());
let toastTimer;
let activeOccurrenceDate = null;
let calendarCursor = fromDateKey(state.selectedDate);
let layerReturnFocus = null;
let lastSaveSucceeded = true;

const STORAGE_ERROR_MESSAGE = "未能保存在此浏览器，请先不要关闭页面";

const app = document.querySelector("#app");
const scrim = document.querySelector("#scrim");
const itemSheet = document.querySelector("#itemSheet");
const actionSheet = document.querySelector("#actionSheet");
const itemForm = document.querySelector("#itemForm");
const scheduleFields = document.querySelector("#scheduleFields");
const dateField = document.querySelector("#dateField");
const conflictWarning = document.querySelector("#conflictWarning");
const welcome = document.querySelector("#welcome");
const dateSheet = document.querySelector("#dateSheet");
const calendarGrid = document.querySelector("#calendarGrid");

function saveState() {
  lastSaveSucceeded = window.YiriStore.write(state);
  updateBadge();
  if (!lastSaveSucceeded) showToast(STORAGE_ERROR_MESSAGE, true);
  return lastSaveSucceeded;
}

function itemsForDate(dateKey) {
  return state.items
    .map((item) => occurrenceForDate(item, dateKey))
    .filter(Boolean)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function inboxItems() {
  return state.items
    .filter((item) => (!item.date || !item.time) && !item.completed)
    .sort((a, b) => b.id.localeCompare(a.id));
}

function completedInboxItems() {
  return state.items
    .filter((item) => (!item.date || !item.time) && item.repeat === "none" && item.completed)
    .sort((a, b) => b.id.localeCompare(a.id));
}

function nextAvailableTime(dateKey, duration = 30, excludeId = null) {
  return findAvailableSlot(itemsForDate(dateKey), dateKey, duration, {
    dayStart: state.settings.dayStart,
    dayEnd: state.settings.dayEnd,
    excludeId
  });
}

function currentAndNext(items) {
  const todayKey = toDateKey(new Date());
  if (state.selectedDate !== todayKey) return { current: null, next: items.find((item) => !item.completed) || null, missed: [] };
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const current = items.find((item) => {
    const start = minutesFromTime(item.time);
    return start <= nowMinutes && start + Number(item.duration) > nowMinutes && !item.completed;
  });
  const next = items.find((item) => minutesFromTime(item.time) > nowMinutes && !item.completed);
  const missed = items.filter((item) => {
    const end = minutesFromTime(item.time) + Number(item.duration);
    return end <= nowMinutes && !item.completed;
  });
  return { current, next, missed };
}

function renderToday() {
  const isToday = state.selectedDate === toDateKey(new Date());
  const items = itemsForDate(state.selectedDate);
  const conflictIds = new Set(scheduleConflictIds(items));
  const summary = planningSummary(state.settings, items);
  const done = summary.completed;
  const totalMinutes = summary.planned;
  const remaining = summary.remaining;
  const progress = summary.progress;
  const { current, next, missed } = currentAndNext(items);
  const focus = current || missed[0] || next;
  const focusMode = current ? "current" : missed.length ? "missed" : next ? "next" : "empty";

  app.innerHTML = `
    <header class="page-header">
      <div>
        <p class="eyebrow">${isToday ? "把今天放进时间里" : "查看这一天的安排"}</p>
        <button class="date-title-button" type="button" data-open-date-picker aria-label="选择日期，当前为${escapeHtml(formatDay(state.selectedDate))}">
          <h1>${escapeHtml(formatDay(state.selectedDate))}</h1><span aria-hidden="true">▼</span>
        </button>
        <p class="subtle">${weekdayLabel(state.selectedDate)}，${isToday ? "先安排最重要的，再给生活留一点空白。" : "查看和调整这一天的计划。"}</p>
      </div>
      <div class="date-controls">
        <button class="round-button" type="button" data-shift-day="-1" aria-label="前一天">‹</button>
        <button class="round-button" type="button" data-shift-day="1" aria-label="后一天">›</button>
      </div>
    </header>
    ${!isToday ? `<button class="today-button" type="button" data-go-today>返回今天</button>` : ""}
    <section class="summary-card" aria-label="${isToday ? "今日概览" : "当日概览"}">
      <div class="summary-top">
        <div><p class="summary-label">${isToday ? "今日计划" : "当日计划"}</p><p class="summary-main">${items.length ? `${items.length} 件事，慢慢来` : "这一天还没有安排"}</p></div>
        <div class="summary-ring" style="--progress: ${progress * 3.6}deg" aria-label="完成进度 ${progress}%"><span>${progress}%</span></div>
      </div>
      <div class="summary-metrics">
        ${items.length ? `
          <div><span>已安排</span><b>${durationLabel(totalMinutes)}</b></div>
          <div><span>未安排时间</span><b>${durationLabel(remaining)}</b></div>
          <div><span>已完成</span><b>${done}/${items.length}</b></div>` : `
          <div><span>规划时段</span><b>${state.settings.dayStart}—${state.settings.dayEnd}</b></div>
          <div><span>开始方式</span><b>添加第一件事</b></div>`}
      </div>
    </section>
    ${!items.length ? `
      <section class="empty-state main-empty">
        <span class="empty-icon">＋</span>
        <h3>从第一件事开始</h3>
        <p>安排一两件真正重要的事，剩下的时间也可以留给自己。</p>
        <button class="primary-inline" type="button" data-quick-add-today>安排第一件事</button>
      </section>` : `
      <div class="section-heading"><h2>${focusMode === "current" ? "正在进行" : focusMode === "missed" ? "尚未处理" : "接下来"}</h2><button class="text-button" type="button" data-page-link="inbox">待安排 ${inboxItems().length ? `· ${inboxItems().length}` : ""}</button></div>
      ${focus ? `
      <button class="now-card ${focusMode === "missed" ? "is-missed" : ""} ${conflictIds.has(focus.id) ? "has-conflict" : ""}" type="button" data-open-actions="${focus.id}" data-open-date="${focus.date}">
        <span class="now-bar"></span>
        <span><span class="label">${focusMode === "current" ? "现在" : focusMode === "missed" ? "计划时间已过" : "下一项"}</span><h3>${escapeHtml(focus.title)}</h3><p>${conflictIds.has(focus.id) ? "时间重叠 · " : ""}${focusMode === "missed" ? `还有 ${missed.length} 件需要完成或重新安排` : `${focus.locked ? "固定安排 · " : ""}${durationLabel(focus.duration)}`}</p></span>
        <span class="now-time">${focus.time}<br>— ${endTime(focus)}</span>
      </button>` : ""}
      <div class="section-heading"><h2>时间线</h2><button class="text-button" type="button" data-quick-add-today>＋ 安排一件事</button></div>
      ${renderTimeline(items, conflictIds, isToday)}`}
  `;
}

function renderTimeline(items, conflictIds = new Set(), isToday = false) {
  if (!items.length) return `<div class="empty-state"><span class="empty-icon">＋</span><h3>从第一件事开始</h3><p>添加开始时间后，事项会出现在这里。</p></div>`;
  let nowMinutes = null;
  if (isToday) {
    const now = new Date();
    const candidate = now.getHours() * 60 + now.getMinutes();
    if (candidate >= minutesFromTime(state.settings.dayStart) && candidate <= minutesFromTime(state.settings.dayEnd)) nowMinutes = candidate;
  }
  const gapEntries = [];
  freeIntervals(state.settings, items).forEach(([start, end]) => {
    if (nowMinutes !== null && nowMinutes > start && nowMinutes < end) {
      gapEntries.push({ type: "gap", start, end: nowMinutes }, { type: "gap", start: nowMinutes, end });
    } else {
      gapEntries.push({ type: "gap", start, end });
    }
  });
  const entries = [
    ...gapEntries.filter((entry) => entry.end > entry.start),
    ...items.map((item) => ({ type: "item", start: minutesFromTime(item.time), item }))
  ];
  if (nowMinutes !== null) entries.push({ type: "now", start: nowMinutes });
  entries.sort((a, b) => a.start - b.start || ({ now: 0, item: 1, gap: 2 }[a.type] - { now: 0, item: 1, gap: 2 }[b.type]));
  return `<div class="timeline">${entries.map((entry) => {
    if (entry.type === "gap") return `<div class="timeline-gap">
      <time class="timeline-time">${timeFromMinutes(entry.start)}</time>
      <div class="timeline-content"><span class="gap-label">可安排 ${durationLabel(entry.end - entry.start)} · ${timeFromMinutes(entry.start)}—${timeFromMinutes(entry.end)}</span></div>
    </div>`;
    if (entry.type === "now") return `<div class="timeline-now" aria-label="当前时间 ${timeFromMinutes(entry.start)}">
      <time class="timeline-time">${timeFromMinutes(entry.start)}</time><div class="timeline-content"><span>现在</span></div>
    </div>`;
    const item = entry.item;
    const hasConflict = conflictIds.has(item.id);
    return `<div class="timeline-item">
      <time class="timeline-time">${item.time}</time>
      <div class="timeline-content">
        <article class="task-card ${item.completed ? "is-complete" : ""} ${item.locked ? "is-fixed" : ""} ${hasConflict ? "has-conflict" : ""}">
          <button class="task-main unstyled" type="button" data-open-actions="${item.id}" data-open-date="${item.date}">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="task-meta"><span>${item.time}—${endTime(item)}</span><span>${durationLabel(item.duration)}</span>${item.locked ? "<span>固定</span>" : ""}${item.repeat !== "none" ? "<span>重复</span>" : ""}${hasConflict ? "<span class=\"conflict-tag\">时间重叠</span>" : ""}</div>
          </button>
          <button class="quick-complete" type="button" data-quick-complete="${item.id}" data-complete-date="${item.date}" aria-label="${item.completed ? "恢复" : "完成"}${escapeHtml(item.title)}">✓</button>
        </article>
      </div>
    </div>`;
  }).join("")}</div>`;
}

function renderInbox() {
  const items = inboxItems();
  const completedItems = completedInboxItems();
  app.innerHTML = `
    <header class="page-header">
      <div><p class="eyebrow">先记下来，稍后再决定</p><h1>待安排</h1><p class="subtle">这里的事项不会制造逾期提醒。</p></div>
    </header>
    <div class="section-heading"><h2>${items.length ? `${items.length} 件等待安排` : "收件箱已清空"}</h2></div>
    ${items.length ? `<div class="inbox-list">${items.map((item) => `
      <article class="inbox-card">
        <button class="unstyled" type="button" data-open-actions="${item.id}">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${item.duration ? `预计 ${durationLabel(item.duration)}` : "尚未设置时长"}${item.repeat !== "none" ? " · 重复事项" : ""}</p>
        </button>
        <button class="quick-plan" type="button" data-plan-today="${item.id}">安排到今天</button>
      </article>`).join("")}</div>` : `
      <div class="empty-state"><span class="empty-icon">✓</span><h3>没有等待安排的事</h3><p>想到新事情时，点击右下角快速记下来。</p></div>`}
    ${completedItems.length ? `
      <div class="section-heading completed-inbox-heading"><h2>已完成</h2><span class="subtle">${completedItems.length} 件</span></div>
      <div class="inbox-list completed-inbox-list">${completedItems.map((item) => `
        <article class="inbox-card is-complete">
          <button class="unstyled" type="button" data-open-actions="${item.id}">
            <h3>${escapeHtml(item.title)}</h3>
            <p>已完成 · 点击可以恢复</p>
          </button>
          <span class="completed-mark">已完成</span>
        </article>`).join("")}
      </div>` : ""}
  `;
}

function renderProfile() {
  app.innerHTML = `
    <header class="page-header"><div><p class="eyebrow">保持简单，按自己的节奏</p><h1>我的</h1><p class="subtle">第一版无需注册，数据只保存在当前设备。</p></div></header>
    <section class="profile-card"><div class="avatar">一日</div><div><h3>本地使用中</h3><p>无账号 · 无会员限制 · 无云同步</p></div></section>
    <div class="section-heading"><h2>规划偏好</h2></div>
    <section class="setting-group">
      <label class="setting-row"><span>一天开始<small>时间线最早显示时间</small></span><select id="dayStart">${["05:00", "06:00", "07:00", "08:00"].map((value) => `<option ${state.settings.dayStart === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label class="setting-row"><span>一天结束<small>不会限制你添加更晚事项</small></span><select id="dayEnd">${["22:00", "23:00", "24:00"].map((value) => `<option ${state.settings.dayEnd === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <div class="setting-row"><span>外观<small>自动跟随手机系统</small></span><b>跟随系统</b></div>
    </section>
    <div class="section-heading"><h2>数据</h2></div>
    <section class="setting-group">
      <div class="setting-row"><span>保存位置<small>当前浏览器本地存储</small></span><b>此设备</b></div>
      <button class="setting-row unstyled full-row" type="button" id="exportData"><span>导出本地数据<small>下载一份可恢复的 JSON 备份</small></span><b>›</b></button>
      <button class="setting-row unstyled full-row" type="button" id="importData"><span>导入本地数据<small>从“一日”备份文件恢复</small></span><b>›</b></button>
      <input id="importDataInput" type="file" accept="application/json,.json" hidden />
      <button class="setting-row unstyled full-row" type="button" id="resetDemo"><span>载入演示数据<small>会替换当前本地事项</small></span><b>›</b></button>
    </section>
    <p class="data-note">数据提示：清理浏览器数据会删除本地计划。建议定期导出备份；导入操作会先要求你确认，再替换当前本地事项。</p>
  `;
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.page === state.page));
  if (state.page === "today") renderToday();
  if (state.page === "inbox") renderInbox();
  if (state.page === "profile") renderProfile();
  const addButton = document.querySelector("#addButton");
  addButton.hidden = state.page === "profile";
  addButton.setAttribute("aria-label", state.page === "inbox" ? "添加待安排事项" : "添加事项");
  updateBadge();
  welcome.hidden = Boolean(state.onboardingComplete);
  if (!state.onboardingComplete) document.body.style.overflow = "hidden";
}

function updateBadge() {
  const badge = document.querySelector("#inboxBadge");
  const count = inboxItems().length;
  badge.hidden = !count;
  badge.textContent = count > 9 ? "9+" : count;
}

function showToast(message, force = false) {
  if (!force && !lastSaveSucceeded) return;
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function openLayer(layer) {
  layerReturnFocus = document.activeElement;
  scrim.hidden = false;
  layer.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLayers() {
  scrim.hidden = true;
  itemSheet.hidden = true;
  actionSheet.hidden = true;
  dateSheet.hidden = true;
  document.body.style.overflow = "";
  state.activeItemId = null;
  activeOccurrenceDate = null;
  if (layerReturnFocus instanceof HTMLElement && document.contains(layerReturnFocus)) layerReturnFocus.focus();
  layerReturnFocus = null;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  document.querySelector("#calendarMonth").textContent = `${year}年${month + 1}月`;
  const todayKey = toDateKey(new Date());
  calendarGrid.innerHTML = monthCalendar(year, month).map((dateKey) => {
    if (!dateKey) return `<span class="calendar-blank"></span>`;
    const day = Number(dateKey.slice(-2));
    return `<button class="calendar-day ${dateKey === todayKey ? "is-today" : ""} ${dateKey === state.selectedDate ? "is-selected" : ""}" type="button" data-calendar-date="${dateKey}" aria-label="${dateKey}">${day}</button>`;
  }).join("");
}

function openDatePicker() {
  calendarCursor = fromDateKey(state.selectedDate);
  renderCalendar();
  openLayer(dateSheet);
}

function selectDate(date) {
  state.selectedDate = toDateKey(date);
  saveState();
  closeLayers();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scheduleDate() {
  const value = itemForm.elements.schedule.value;
  if (value === "today") return toDateKey(new Date());
  if (value === "tomorrow") return toDateKey(addDays(new Date(), 1));
  if (value === "custom") return document.querySelector("#itemDate").value;
  return null;
}

function updateScheduleFields(refreshTime = false) {
  const value = itemForm.elements.schedule.value;
  scheduleFields.hidden = value === "inbox";
  dateField.hidden = value !== "custom";
  if (refreshTime && value !== "inbox") {
    const date = scheduleDate();
    const duration = Number(document.querySelector("#itemDuration").value || 30);
    if (date) document.querySelector("#itemTime").value = nextAvailableTime(date, duration, document.querySelector("#editingId").value || null) || fallbackManualTime(date, duration);
  }
  updateConflictWarning();
}

function draftSchedule() {
  const schedule = itemForm.elements.schedule.value;
  if (schedule === "inbox") return null;
  const date = schedule === "today"
    ? toDateKey(new Date())
    : schedule === "tomorrow"
      ? toDateKey(addDays(new Date(), 1))
      : document.querySelector("#itemDate").value;
  const time = document.querySelector("#itemTime").value;
  const duration = Number(document.querySelector("#itemDuration").value || 0);
  if (!date || !time || !duration) return null;
  return { date, time, duration, editingId: document.querySelector("#editingId").value };
}

function findConflict(draft) {
  return findScheduleConflict(draft?.date ? itemsForDate(draft.date) : state.items, draft);
}

function updateConflictWarning() {
  const draft = draftSchedule();
  const conflict = findConflict(draft);
  const outsideRange = draft && (
    minutesFromTime(draft.time) < minutesFromTime(state.settings.dayStart) ||
    minutesFromTime(draft.time) + draft.duration > minutesFromTime(state.settings.dayEnd)
  );
  conflictWarning.hidden = !conflict && !outsideRange;
  conflictWarning.textContent = conflict
    ? `这个时间与“${conflict.title}”重叠。你仍然可以保存，或先调整开始时间。`
    : outsideRange
      ? `这个安排超出了你的规划时段 ${state.settings.dayStart}—${state.settings.dayEnd}。你仍然可以保存。`
      : "";
}

function resetForm(defaultSchedule = "inbox") {
  itemForm.reset();
  document.querySelector("#editingId").value = "";
  document.querySelector("#editingOccurrenceDate").value = "";
  document.querySelector("#sheetTitle").textContent = "添加事项";
  document.querySelector("#deleteItem").hidden = true;
  document.querySelector("#advancedFields").hidden = true;
  document.querySelector("#seriesNotice").hidden = true;
  document.querySelector("#seriesScopeField").hidden = true;
  document.querySelector('#seriesScopeOptions input[value="occurrence"]').checked = true;
  document.querySelector("#itemRepeat").disabled = false;
  document.querySelector("#advancedToggle").…133 tokens truncated…30) {
  const start = minutesFromTime(state.settings.dayStart);
  const end = minutesFromTime(state.settings.dayEnd);
  const now = new Date();
  const roundedNow = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30;
  const preferred = dateKey === toDateKey(now) ? Math.max(start, roundedNow) : Math.max(start, 9 * 60);
  return timeFromMinutes(Math.max(start, Math.min(preferred, end - Number(duration || 30))));
}

function openNewItem(defaultSchedule = "inbox") {
  resetForm(defaultSchedule);
  openLayer(itemSheet);
  setTimeout(() => document.querySelector("#itemTitle").focus(), 80);
}

function openNewItemForSelectedDate() {
  if (state.selectedDate === toDateKey(new Date())) return openNewItem("today");
  if (state.selectedDate === toDateKey(addDays(new Date(), 1))) return openNewItem("tomorrow");
  resetForm("custom");
  document.querySelector("#itemDate").value = state.selectedDate;
  document.querySelector("#itemTime").value = nextAvailableTime(state.selectedDate, 30) || fallbackManualTime(state.selectedDate, 30);
  updateConflictWarning();
  openLayer(itemSheet);
  setTimeout(() => document.querySelector("#itemTitle").focus(), 80);
}

function fillEditForm(item, occurrenceDate = null) {
  resetForm(item.date ? "custom" : "inbox");
  const editDate = item.repeat !== "none" ? (occurrenceDate || item.date) : item.date;
  document.querySelector("#editingId").value = item.id;
  document.querySelector("#editingOccurrenceDate").value = item.repeat !== "none" ? (occurrenceDate || "") : "";
  document.querySelector("#sheetTitle").textContent = "编辑事项";
  document.querySelector("#itemTitle").value = item.title;
  document.querySelector("#itemDate").value = editDate || "";
  document.querySelector("#itemTime").value = item.time || "09:00";
  document.querySelector("#itemDuration").value = String(item.duration || 30);
  document.querySelector("#itemLocked").checked = Boolean(item.locked);
  document.querySelector("#itemRepeat").value = item.repeat || "none";
  document.querySelector("#itemNotes").value = item.notes || "";
  document.querySelector("#deleteItem").hidden = false;
  const isSeries = item.repeat !== "none";
  document.querySelector("#seriesNotice").hidden = !isSeries;
  document.querySelector("#seriesScopeField").hidden = !isSeries || !editDate;
  if (isSeries) {
    document.querySelector("#advancedFields").hidden = false;
    document.querySelector("#advancedToggle").setAttribute("aria-expanded", "true");
    if (editDate) updateSeriesScopeForm(false);
    else document.querySelector("#seriesNotice").textContent = "这个重复事项尚未安排日期，修改会应用到整个系列。";
  }
  updateScheduleFields();
  updateConflictWarning();
}

function updateSeriesScopeForm(updateDate = true) {
  const id = document.querySelector("#editingId").value;
  const item = state.items.find((entry) => entry.id === id);
  const occurrenceDate = document.querySelector("#editingOccurrenceDate").value;
  if (!item || item.repeat === "none" || !occurrenceDate) return;
  const scope = itemForm.elements.seriesScope.value;
  const descriptions = {
    occurrence: "只修改这一天，过去和之后的重复安排保持不变。",
    future: "从这一天开始使用新安排，过去记录保持不变。",
    all: "修改整个系列，包括已经出现过的日期。"
  };
  document.querySelector("#seriesNotice").textContent = descriptions[scope];
  document.querySelector("#itemRepeat").disabled = scope === "occurrence";
  if (updateDate && itemForm.elements.schedule.value === "custom") {
    document.querySelector("#itemDate").value = scope === "all" ? item.date : occurrenceDate;
  }
}

function openActions(id, occurrenceDate = null) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  state.activeItemId = id;
  activeOccurrenceDate = occurrenceDate || item.date;
  const occurrence = item.repeat !== "none" && activeOccurrenceDate
    ? occurrenceForDate(item, activeOccurrenceDate)
    : item;
  const isSeries = item.repeat !== "none";
  const canToggleComplete = !isSeries || Boolean(activeOccurrenceDate);
  document.querySelector("#actionTitle").textContent = item.title;
  document.querySelector("#toggleComplete").hidden = !canToggleComplete;
  document.querySelector("#toggleComplete b").textContent = occurrence?.completed ? "恢复为未完成" : "标记完成";
  document.querySelector("#editItem small").textContent = isSeries ? "可选择仅本次、本次及以后或整个系列" : "修改时间、时长或重复";
  document.querySelector("#moveLater b").textContent = "寻找其他空闲时间";
  document.querySelector("#moveLater small").textContent = "在这一天寻找下一段完整空闲时间";
  document.querySelector("#moveLater").hidden = isSeries || !item.date || !item.time || item.locked;
  document.querySelector("#moveTomorrow").hidden = isSeries || !item.date;
  document.querySelector("#moveInbox").hidden = isSeries || (!item.date && !item.time);
  document.querySelector("#seriesActionNote").hidden = !isSeries;
  document.querySelector("#seriesActionNote").textContent = activeOccurrenceDate
    ? "重复事项可以单独完成；编辑或删除时可以选择影响范围。"
    : "请先为重复事项安排日期和时间，之后可以按每个日期分别完成。";
  openLayer(actionSheet);
}

function mutateActive(callback, message) {
  const item = state.items.find((entry) => entry.id === state.activeItemId);
  if (!item) return;
  callback(item);
  saveState();
  closeLayers();
  render();
  showToast(message);
}

document.querySelector("#startClean").addEventListener("click", () => {
  state.onboardingComplete = true;
  saveState();
  render();
  document.body.style.overflow = "";
  openNewItemForSelectedDate();
});

document.querySelector("#loadExample").addEventListener("click", () => {
  state.items = createExampleItems();
  state.onboardingComplete = true;
  state.page = "today";
  state.selectedDate = toDateKey(new Date());
  saveState();
  document.body.style.overflow = "";
  render();
  showToast("已载入示例，可以自由修改");
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    state.page = button.dataset.page;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelector("#addButton").addEventListener("click", () => state.page === "today" ? openNewItemForSelectedDate() : openNewItem("inbox"));
document.querySelector("#closeSheet").addEventListener("click", closeLayers);
document.querySelector("#closeActions").addEventListener("click", closeLayers);
document.querySelector("#closeDateSheet").addEventListener("click", closeLayers);
scrim.addEventListener("click", closeLayers);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !scrim.hidden) closeLayers();
});
document.querySelector("#previousMonth").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector("#nextMonth").addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});
dateSheet.addEventListener("click", (event) => {
  const day = event.target.closest("[data-calendar-date]");
  if (day) { selectDate(fromDateKey(day.dataset.calendarDate)); return; }
  const shortcut = event.target.closest("[data-calendar-shortcut]")?.dataset.calendarShortcut;
  if (!shortcut) return;
  const now = new Date();
  if (shortcut === "today") selectDate(now);
  if (shortcut === "tomorrow") selectDate(addDays(now, 1));
  if (shortcut === "week") selectDate(addDays(now, 7));
  if (shortcut === "month") selectDate(addMonths(now, 1));
});
scrim.addEventListener("click", closeLayers);

itemForm.addEventListener("change", (event) => {
  if (event.target.name === "schedule") updateScheduleFields(true);
  else if (event.target.name === "seriesScope") updateSeriesScopeForm(true);
  else updateConflictWarning();
});

itemForm.addEventListener("input", (event) => {
  if (event.target.id === "itemTitle" && event.target.value.trim()) {
    event.target.setCustomValidity("");
  }
  updateConflictWarning();
});

document.querySelector("#advancedToggle").addEventListener("click", (event) => {
  const fields = document.querySelector("#advancedFields");
  fields.hidden = !fields.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!fields.hidden));
});

function applyWholeItemEdit(target, values) {
  const previousRepeat = target.repeat;
  Object.assign(target, values);
  if (values.repeat !== "none") {
    target.completedDates = Array.isArray(target.completedDates) ? target.completedDates : [];
    target.excludedDates = Array.isArray(target.excludedDates) ? target.excludedDates : [];
    target.repeatUntil = target.repeatUntil || null;
    if (previousRepeat === "none" && target.completed && target.date && !target.completedDates.includes(target.date)) target.completedDates.push(target.date);
    target.completed = false;
  } else if (previousRepeat !== "none") {
    target.completed = Boolean(target.date && target.completedDates?.includes(target.date));
    target.completedDates = [];
    target.excludedDates = [];
    target.repeatUntil = null;
  }
}

function finishSeriesBefore(item, occurrenceDate) {
  if (occurrenceDate <= item.date) {
    state.items = state.items.filter((entry) => entry.id !== item.id);
    return;
  }
  item.repeatUntil = toDateKey(addDays(fromDateKey(occurrenceDate), -1));
  item.completedDates = (item.completedDates || []).filter((date) => date < occurrenceDate);
  item.excludedDates = (item.excludedDates || []).filter((date) => date < occurrenceDate);
}

itemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const titleInput = document.querySelector("#itemTitle");
  const title = titleInput.value.trim();
  titleInput.setCustomValidity("");
  if (!title) {
    titleInput.setCustomValidity("请输入事项名称");
    titleInput.reportValidity();
    titleInput.focus();
    showToast("请输入事项名称");
    return;
  }
  const schedule = itemForm.elements.schedule.value;
  const editingId = document.querySelector("#editingId").value;
  let date = null;
  let time = null;
  if (schedule !== "inbox") {
    date = schedule === "today" ? toDateKey(new Date()) : schedule === "tomorrow" ? toDateKey(addDays(new Date(), 1)) : document.querySelector("#itemDate").value;
    time = document.querySelector("#itemTime").value;
  }
  if (schedule === "custom" && !date) {
    showToast("请选择日期");
    return;
  }
  const values = {
    title, date, time,
    duration: Number(document.querySelector("#itemDuration").value),
    locked: document.querySelector("#itemLocked").checked,
    repeat: document.querySelector("#itemRepeat").value,
    notes: document.querySelector("#itemNotes").value.trim()
  };
  const conflict = findConflict({ date, time, duration: values.duration, editingId });
  if (editingId) {
    const target = state.items.find((item) => item.id === editingId);
    const occurrenceDate = document.querySelector("#editingOccurrenceDate").value;
    const scope = itemForm.elements.seriesScope?.value || "all";
    if (target.repeat !== "none" && occurrenceDate && scope === "occurrence") {
      const wasCompleted = (target.completedDates || []).includes(occurrenceDate);
      target.excludedDates = [...new Set([...(target.excludedDates || []), occurrenceDate])];
      target.completedDates = (target.completedDates || []).filter((entry) => entry !== occurrenceDate);
      state.items.push({
        id: uid(), completed: wasCompleted, completedDates: [], excludedDates: [], repeatUntil: null,
        ...values, repeat: "none"
      });
    } else if (target.repeat !== "none" && occurrenceDate && scope === "future") {
      const futureCompletedDates = (target.completedDates || []).filter((entry) => entry >= occurrenceDate);
      const occurrenceCompleted = futureCompletedDates.includes(occurrenceDate);
      finishSeriesBefore(target, occurrenceDate);
      state.items.push({
        id: uid(), completed: values.repeat === "none" ? occurrenceCompleted : false,
        completedDates: values.repeat === "none" ? [] : futureCompletedDates,
        excludedDates: [], repeatUntil: null, ...values
      });
    } else {
      applyWholeItemEdit(target, values);
    }
  } else {
    state.items.push({ id: uid(), completed: false, completedDates: [], excludedDates: [], repeatUntil: null, ...values });
  }
  saveState();
  closeLayers();
  render();
  showToast(conflict ? `已保存，与“${conflict.title}”时间重叠` : editingId ? "事项已更新" : schedule === "inbox" ? "已放入待安排" : "已经安排好了");
});

document.querySelector("#deleteItem").addEventListener("click", () => {
  const id = document.querySelector("#editingId").value;
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const occurrenceDate = document.querySelector("#editingOccurrenceDate").value;
  const scope = item.repeat !== "none" && occurrenceDate ? itemForm.elements.seriesScope.value : "all";
  const scopeLabel = scope === "occurrence" ? "这一次安排" : scope === "future" ? "这次及以后的安排" : item.repeat !== "none" ? "整个重复事项" : "事项";
  if (!window.confirm(`确定删除${scopeLabel}“${item.title}”吗？删除后无法恢复。`)) return;
  if (item.repeat !== "none" && occurrenceDate && scope === "occurrence") {
    item.excludedDates = [...new Set([...(item.excludedDates || []), occurrenceDate])];
    item.completedDates = (item.completedDates || []).filter((entry) => entry !== occurrenceDate);
  } else if (item.repeat !== "none" && occurrenceDate && scope === "future") {
    finishSeriesBefore(item, occurrenceDate);
  } else {
    state.items = state.items.filter((entry) => entry.id !== id);
  }
  saveState(); closeLayers(); render(); showToast(`${scopeLabel}已删除`);
});

function toggleItemCompletion(item, date = null) {
  if (item.repeat !== "none") {
    if (!date) return false;
    item.completedDates = Array.isArray(item.completedDates) ? item.completedDates : [];
    item.completedDates = item.completedDates.includes(date)
      ? item.completedDates.filter((entry) => entry !== date)
      : [...item.completedDates, date];
  } else {
    item.completed = !item.completed;
  }
  return true;
}

document.querySelector("#toggleComplete").addEventListener("click", () => {
  const item = state.items.find((entry) => entry.id === state.activeItemId);
  if (!item) return;
  if (!toggleItemCompletion(item, activeOccurrenceDate || item.date)) {
    showToast("请先安排日期和时间，再标记这次完成");
    return;
  }
  saveState(); closeLayers(); render(); showToast("完成状态已更新");
});
document.querySelector("#moveLater").addEventListener("click", () => {
  const item = state.items.find((entry) => entry.id === state.activeItemId);
  if (!item) return;
  const today = toDateKey(new Date());
  const date = item.date < today ? today : item.date;
  const slot = nextAvailableTime(date, item.duration, item.id);
  if (!slot) {
    showToast("这一天没有足够的连续时间，可以手动调整或移到明天");
    return;
  }
  item.date = date;
  item.time = slot;
  saveState(); closeLayers(); render(); showToast(`已安排到 ${date} ${slot}`);
});
document.querySelector("#moveTomorrow").addEventListener("click", () => mutateActive((item) => { item.date = toDateKey(addDays(new Date(), 1)); }, "已移到明天"));
document.querySelector("#moveInbox").addEventListener("click", () => mutateActive((item) => { item.date = null; item.time = null; item.locked = false; }, "已放回待安排"));
document.querySelector("#editItem").addEventListener("click", () => {
  const item = state.items.find((entry) => entry.id === state.activeItemId);
  actionSheet.hidden = true;
  fillEditForm(item, activeOccurrenceDate);
  itemSheet.hidden = false;
});

function exportLocalData() {
  const content = window.YiriStore.createBackup(state);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `一日-本地数据-${toDateKey(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("本地数据已导出");
}

app.addEventListener("click", (event) => {
  const completeTarget = event.target.closest("[data-quick-complete]");
  if (completeTarget) {
    const item = state.items.find((entry) => entry.id === completeTarget.dataset.quickComplete);
    if (!item || !toggleItemCompletion(item, completeTarget.dataset.completeDate || item.date)) return;
    saveState(); render(); showToast(item.repeat !== "none" ? "这次完成状态已更新" : item.completed ? "事项已完成" : "事项已恢复");
    return;
  }
  const actionTarget = event.target.closest("[data-open-actions]");
  if (actionTarget) return openActions(actionTarget.dataset.openActions, actionTarget.dataset.openDate || null);
  if (event.target.closest("[data-open-date-picker]")) return openDatePicker();
  const pageTarget = event.target.closest("[data-page-link]");
  if (pageTarget) { state.page = pageTarget.dataset.pageLink; saveState(); render(); return; }
  const shiftTarget = event.target.closest("[data-shift-day]");
  if (shiftTarget) { state.selectedDate = toDateKey(addDays(fromDateKey(state.selectedDate), Number(shiftTarget.dataset.shiftDay))); saveState(); render(); return; }
  if (event.target.closest("[data-go-today]")) { state.selectedDate = toDateKey(new Date()); saveState(); render(); return; }
  if (event.target.closest("[data-quick-add-today]")) return openNewItemForSelectedDate();
  const planTarget = event.target.closest("[data-plan-today]");
  if (planTarget) {
    const item = state.items.find((entry) => entry.id === planTarget.dataset.planToday);
    const date = toDateKey(new Date());
    const slot = nextAvailableTime(date, item.duration, item.id);
    if (!slot) { showToast("今天没有足够的连续时间，请手动安排或移到明天"); return; }
    item.date = date; item.time = slot;
    saveState(); render(); showToast(`已安排到今天 ${slot}`); return;
  }
  if (event.target.closest("#exportData")) { exportLocalData(); return; }
  if (event.target.closest("#importData")) { document.querySelector("#importDataInput").click(); return; }
  if (event.target.closest("#resetDemo") && window.confirm("确定载入演示数据吗？当前本地事项将被替换。")) {
    state.items = createExampleItems();
    state.onboardingComplete = true;
    state.page = "today";
    state.selectedDate = toDateKey(new Date());
    saveState(); render(); showToast("演示数据已载入");
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.id === "dayStart") { state.settings.dayStart = event.target.value; saveState(); }
  if (event.target.id === "dayEnd") { state.settings.dayEnd = event.target.value; saveState(); }
  if (event.target.id === "importDataInput") {
    const [file] = event.target.files;
    if (!file) return;
    try {
      const imported = window.YiriStore.parseBackup(await file.text());
      if (!window.confirm(`确定导入“${file.name}”吗？当前本地事项将被替换。`)) return;
      state = imported;
      state.onboardingComplete = true;
      state.page = "today";
      state.selectedDate = toDateKey(new Date());
      saveState();
      render();
      showToast(`已导入 ${state.items.length} 件事项`);
    } catch {
      showToast("无法导入：这不是有效的“一日”备份文件", true);
    } finally {
      event.target.value = "";
    }
  }
});

render();

