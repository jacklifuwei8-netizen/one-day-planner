(function exposeYiriCore(globalScope) {
  "use strict";

  const pad = (value) => String(value).padStart(2, "0");

  function isDateKey(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const [, year, month, day] = match.map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function isTimeValue(value, allow24 = false) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (allow24 && hour === 24 && minute === 0) return true;
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }

  const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  const fromDateKey = (key) => {
    const [year, month, day] = String(key).split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const addDays = (date, amount) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  };

  const addMonths = (date, amount) => {
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return target;
  };

  const minutesFromTime = (time) => {
    const [hour, minute] = String(time).split(":").map(Number);
    return hour * 60 + minute;
  };

  const timeFromMinutes = (minutes) => {
    const safeMinutes = Math.max(0, Math.min(Number(minutes), 24 * 60));
    if (safeMinutes === 24 * 60) return "24:00";
    return `${pad(Math.floor(safeMinutes / 60))}:${pad(safeMinutes % 60)}`;
  };

  const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function monthCalendar(year, monthIndex) {
    const firstDay = new Date(year, monthIndex, 1);
    const dayCount = new Date(year, monthIndex + 1, 0).getDate();
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    const cells = Array(mondayOffset).fill(null);
    for (let day = 1; day <= dayCount; day += 1) cells.push(toDateKey(new Date(year, monthIndex, day)));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  function createExampleItems(now = new Date()) {
    const todayKey = toDateKey(now);
    const tomorrowKey = toDateKey(addDays(now, 1));
    return [
      { id: uid(), title: "晨间拉伸", date: todayKey, time: "07:30", duration: 20, completed: false, completedDates: [todayKey], locked: false, repeat: "daily", notes: "" },
      { id: uid(), title: "整理今天的重点", date: todayKey, time: "09:00", duration: 30, completed: false, completedDates: [], locked: false, repeat: "none", notes: "只选三件真正重要的事" },
      { id: uid(), title: "午饭和散步", date: todayKey, time: "12:00", duration: 60, completed: false, completedDates: [], locked: true, repeat: "weekdays", notes: "" },
      { id: uid(), title: "阅读 30 分钟", date: todayKey, time: "20:30", duration: 30, completed: false, completedDates: [], locked: false, repeat: "none", notes: "" },
      { id: uid(), title: "购买洗衣液", date: null, time: null, duration: 15, completed: false, completedDates: [], locked: false, repeat: "none", notes: "" },
      { id: uid(), title: "给家里打电话", date: null, time: null, duration: 30, completed: false, completedDates: [], locked: false, repeat: "none", notes: "" },
      { id: uid(), title: "准备明天要带的东西", date: tomorrowKey, time: "21:30", duration: 15, completed: false, completedDates: [], locked: false, repeat: "none", notes: "" }
    ];
  }

  function initialState(now = new Date()) {
    const todayKey = toDateKey(now);
    return {
      schemaVersion: 3,
      onboardingComplete: false,
      selectedDate: todayKey,
      page: "today",
      activeItemId: null,
      settings: { dayStart: "06:00", dayEnd: "24:00" },
      items: []
    };
  }

  function normalizeState(candidate, now = new Date()) {
    const fallback = initialState(now);
    if (!candidate || !Array.isArray(candidate.items)) return fallback;
    const rawSettings = candidate.settings && typeof candidate.settings === "object" ? candidate.settings : {};
    let dayStart = isTimeValue(rawSettings.dayStart) ? rawSettings.dayStart : fallback.settings.dayStart;
    let dayEnd = isTimeValue(rawSettings.dayEnd, true) ? rawSettings.dayEnd : fallback.settings.dayEnd;
    if (minutesFromTime(dayStart) >= minutesFromTime(dayEnd)) {
      dayStart = fallback.settings.dayStart;
      dayEnd = fallback.settings.dayEnd;
    }
    const usedIds = new Set();
    return {
      schemaVersion: 3,
      onboardingComplete: typeof candidate.onboardingComplete === "boolean"
        ? candidate.onboardingComplete
        : candidate.items.length > 0,
      selectedDate: isDateKey(candidate.selectedDate) ? candidate.selectedDate : fallback.selectedDate,
      page: ["today", "inbox", "profile"].includes(candidate.page) ? candidate.page : "today",
      activeItemId: null,
      settings: { dayStart, dayEnd },
      items: candidate.items.map((rawItem) => {
        const item = rawItem && typeof rawItem === "object" ? rawItem : {};
        const repeat = ["none", "daily", "weekdays", "weekly"].includes(item.repeat) ? item.repeat : "none";
        const validDate = isDateKey(item.date) ? item.date : null;
        const validTime = isTimeValue(item.time) ? item.time : null;
        const isScheduled = Boolean(validDate && validTime);
        const date = isScheduled ? validDate : null;
        const time = isScheduled ? validTime : null;
        const numericDuration = Number(item.duration);
        const duration = Number.isFinite(numericDuration) && numericDuration > 0 && numericDuration <= 24 * 60
          ? numericDuration
          : 30;
        const completedDates = Array.isArray(item.completedDates)
          ? [...new Set(item.completedDates.filter(isDateKey))]
          : repeat !== "none" && item.completed && date ? [date] : [];
        const repeatUntil = repeat !== "none" && isDateKey(item.repeatUntil) && (!date || item.repeatUntil >= date)
          ? item.repeatUntil
          : null;
        const excludedDates = repeat !== "none" && Array.isArray(item.excludedDates)
          ? [...new Set(item.excludedDates.filter(isDateKey))]
          : [];
        let id = typeof item.id === "string" && item.id.trim() ? item.id : uid();
        if (usedIds.has(id)) id = uid();
        usedIds.add(id);
        return {
          id,
          title: String(item.title || "").trim() || "未命名事项",
          date,
          time,
          duration,
          completed: repeat === "none" ? Boolean(item.completed) : false,
          completedDates,
          locked: isScheduled ? Boolean(item.locked) : false,
          repeat,
          repeatUntil,
          excludedDates,
          notes: String(item.notes || "")
        };
      })
    };
  }

  function formatDay(dateKey, now = new Date()) {
    const date = fromDateKey(dateKey);
    const label = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
    if (dateKey === toDateKey(now)) return `今天 · ${label}`;
    if (dateKey === toDateKey(addDays(now, 1))) return `明天 · ${label}`;
    if (dateKey === toDateKey(addDays(now, -1))) return `昨天 · ${label}`;
    return label;
  }

  const weekdayLabel = (dateKey) => new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(fromDateKey(dateKey));

  function durationLabel(minutes) {
    const value = Number(minutes || 0);
    if (value < 60) return `${value} 分钟`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  const endTime = (item) => timeFromMinutes(minutesFromTime(item.time) + Number(item.duration || 0));

  function planningSummary(settings, items) {
    const rangeStart = minutesFromTime(settings.dayStart);
    const rangeEnd = minutesFromTime(settings.dayEnd);
    const available = Math.max(0, rangeEnd - rangeStart);
    const merged = occupiedIntervals(settings, items);
    const planned = merged.reduce((sum, [start, end]) => sum + end - start, 0);
    const completed = items.filter((item) => item.completed).length;
    return {
      available,
      planned,
      remaining: Math.max(0, available - planned),
      completed,
      progress: items.length ? Math.round((completed / items.length) * 100) : 0
    };
  }

  function occupiedIntervals(settings, items) {
    const rangeStart = minutesFromTime(settings.dayStart);
    const rangeEnd = minutesFromTime(settings.dayEnd);
    const intervals = items
      .filter((item) => item.time)
      .map((item) => {
        const start = Math.max(rangeStart, minutesFromTime(item.time));
        const end = Math.min(rangeEnd, minutesFromTime(item.time) + Number(item.duration || 0));
        return [start, end];
      })
      .filter(([start, end]) => end > start)
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    intervals.forEach(([start, end]) => {
      const last = merged[merged.length - 1];
      if (!last || start > last[1]) merged.push([start, end]);
      else last[1] = Math.max(last[1], end);
    });
    return merged;
  }

  function freeIntervals(settings, items) {
    const rangeStart = minutesFromTime(settings.dayStart);
    const rangeEnd = minutesFromTime(settings.dayEnd);
    const result = [];
    let cursor = rangeStart;
    occupiedIntervals(settings, items).forEach(([start, end]) => {
      if (start > cursor) result.push([cursor, start]);
      cursor = Math.max(cursor, end);
    });
    if (cursor < rangeEnd) result.push([cursor, rangeEnd]);
    return result;
  }

  function findAvailableSlot(items, dateKey, duration, options = {}) {
    const now = options.now || new Date();
    const dayStart = options.dayStart || "06:00";
    const dayEnd = options.dayEnd || "24:00";
    const excludeId = options.excludeId || null;
    const step = Number(options.step || 30);
    const required = Math.max(1, Number(duration || 30));
    const rangeEnd = minutesFromTime(dayEnd);
    let cursor = dateKey === toDateKey(now)
      ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / step) * step
      : Math.max(minutesFromTime(dayStart), 9 * 60);
    cursor = Math.max(cursor, minutesFromTime(dayStart));
    const intervals = items
      .filter((item) => item.id !== excludeId && item.time)
      .map((item) => [minutesFromTime(item.time), minutesFromTime(item.time) + Number(item.duration || 0)])
      .sort((a, b) => a[0] - b[0]);

    while (cursor + required <= rangeEnd) {
      const conflict = intervals.find(([start, end]) => cursor < end && cursor + required > start);
      if (!conflict) return timeFromMinutes(cursor);
      cursor = Math.ceil(conflict[1] / step) * step;
    }
    return null;
  }

  function findNextAvailableTime(items, dateKey, options = {}) {
    return findAvailableSlot(items, dateKey, 30, options);
  }

  function occursOnDate(item, dateKey) {
    if (!item.date || !item.time || dateKey < item.date) return false;
    if (item.repeat === "none") return item.date === dateKey;
    if (item.repeatUntil && dateKey > item.repeatUntil) return false;
    if ((item.excludedDates || []).includes(dateKey)) return false;
    const target = fromDateKey(dateKey);
    if (item.repeat === "daily") return true;
    if (item.repeat === "weekdays") return target.getDay() >= 1 && target.getDay() <= 5;
    if (item.repeat === "weekly") return target.getDay() === fromDateKey(item.date).getDay();
    return false;
  }

  function occurrenceForDate(item, dateKey) {
    if (!occursOnDate(item, dateKey)) return null;
    return {
      ...item,
      date: dateKey,
      sourceDate: item.date,
      completed: item.repeat === "none"
        ? Boolean(item.completed)
        : (item.completedDates || []).includes(dateKey),
      occurrenceDate: dateKey
    };
  }

  function findScheduleConflict(items, draft) {
    if (!draft || !draft.date || !draft.time || !draft.duration) return null;
    const start = minutesFromTime(draft.time);
    const end = start + Number(draft.duration);
    return items.find((item) => {
      if (item.id === draft.editingId || item.date !== draft.date || !item.time) return false;
      const itemStart = minutesFromTime(item.time);
      const itemEnd = itemStart + Number(item.duration || 0);
      return start < itemEnd && end > itemStart;
    }) || null;
  }

  function scheduleConflictIds(items) {
    const scheduled = items
      .filter((item) => item.id && item.time)
      .map((item) => ({
        item,
        start: minutesFromTime(item.time),
        end: minutesFromTime(item.time) + Number(item.duration || 0)
      }))
      .sort((a, b) => a.start - b.start);
    const ids = new Set();
    for (let index = 0; index < scheduled.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < scheduled.length; otherIndex += 1) {
        const current = scheduled[index];
        const other = scheduled[otherIndex];
        if (other.start >= current.end) break;
        if (current.item.date && other.item.date && current.item.date !== other.item.date) continue;
        if (current.start < other.end && current.end > other.start) {
          ids.add(current.item.id);
          ids.add(other.item.id);
        }
      }
    }
    return [...ids];
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[char]);
  }

  const api = {
    addDays,
    addMonths,
    createExampleItems,
    durationLabel,
    endTime,
    escapeHtml,
    findAvailableSlot,
    findNextAvailableTime,
    findScheduleConflict,
    freeIntervals,
    formatDay,
    fromDateKey,
    initialState,
    isDateKey,
    isTimeValue,
    minutesFromTime,
    monthCalendar,
    normalizeState,
    occurrenceForDate,
    occursOnDate,
    scheduleConflictIds,
    planningSummary,
    timeFromMinutes,
    toDateKey,
    uid,
    weekdayLabel
  };

  globalScope.YiriCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

