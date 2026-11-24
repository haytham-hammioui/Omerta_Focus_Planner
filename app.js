const $ = (selector) => document.querySelector(selector);
const display = $("#timerDisplay");
const startBtn = $("#startBtn");
const resetBtn = $("#resetBtn");
const customMinutes = $("#customMinutes");
const timerMessage = $("#timerMessage");
const themeToggle = $("#themeToggle");
const fullscreenToggle = $("#fullscreenToggle");
const focusTaskLabel = $("#focusTaskLabel");
const completeFocusTask = $("#completeFocusTask");

let selectedSeconds = 25 * 60;
let remaining = selectedSeconds;
let running = false;
let interval = null;
let focusTaskId = null;
let tasks = [];
let selectedDate = new Date();
selectedDate.setHours(0, 0, 0, 0);
let displayedWeek = startOfWeek(selectedDate);
let editingTaskId = null;
let scheduleTaskId = null;
let savedPayload = null;
let originalPayload = null;
let storageBlocked = false;
let pendingImportTasks = null;
let taskDialogReturnFocus = null;
let scheduleDialogReturnFocus = null;
let importDialogReturnFocus = null;

const plannerStorageKey = "omerta-planner-tasks";
const minuteHeight = 48;

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  document.body.classList.toggle("dark", !isLight);
  themeToggle.textContent = isLight ? "☾" : "☀";
  const label = isLight ? "Switch to dark mode" : "Switch to light mode";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", isLight ? "#f4f1eb" : "#111315");
}

function updateFullscreenState() {
  const isFullscreen = Boolean(document.fullscreenElement);
  document.body.classList.toggle("fullscreen", isFullscreen);
  fullscreenToggle.textContent = isFullscreen ? "×" : "⛶";
  const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenToggle.setAttribute("aria-label", label);
  fullscreenToggle.title = label;
}

fullscreenToggle.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
});
document.addEventListener("fullscreenchange", updateFullscreenState);

try {
  applyTheme(localStorage.getItem("omerta-theme") === "light" ? "light" : "dark");
} catch (error) {
  applyTheme("dark");
  console.error("Could not read the saved theme:", error);
}
themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("light") ? "dark" : "light";
  try {
    localStorage.setItem("omerta-theme", nextTheme);
  } catch (error) {
    timerMessage.textContent = "Could not save your theme preference.";
    console.error("Could not save the selected theme:", error);
  }
  applyTheme(nextTheme);
});

function updateClock() {
  const date = new Date();
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;
  $("#secondHand").style.transform = `rotate(${seconds * 6}deg)`;
  $("#minuteHand").style.transform = `rotate(${minutes * 6}deg)`;
  $("#hourHand").style.transform = `rotate(${hours * 30}deg)`;
}
updateClock();
setInterval(updateClock, 1000);

function renderTimer() {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  display.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  document.title = running ? `${display.textContent} · Omerta Focus Planner` : "Omerta Focus Planner";
  document.body.classList.toggle("timer-running", running);
  const focusTask = tasks.find(task => task.id === focusTaskId);
  focusTaskLabel.textContent = focusTask ? `Focus task: ${focusTask.title}` : "";
  completeFocusTask.hidden = !(focusTask && !focusTask.completed && remaining === 0);
  completeFocusTask.textContent = focusTask ? `Mark “${focusTask.title}” complete` : "";
}

function stopTimer() {
  running = false;
  clearInterval(interval);
  interval = null;
  startBtn.textContent = remaining === 0 ? "Start again" : "Start";
  document.body.classList.remove("timer-running");
  renderTimer();
}

function startTimer() {
  if (remaining <= 0) remaining = selectedSeconds;
  running = true;
  startBtn.textContent = "Pause";
  timerMessage.textContent = "";
  renderTimer();
  const endTime = Date.now() + remaining * 1000;
  interval = setInterval(() => {
    remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    renderTimer();
    if (remaining === 0) {
      stopTimer();
      timerMessage.textContent = "Focus session complete. Task completion is still manual.";
      try {
        new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play();
      } catch (error) {
        console.error("Could not play the focus completion sound:", error);
      }
    }
  }, 250);
}

startBtn.addEventListener("click", () => running ? stopTimer() : startTimer());
resetBtn.addEventListener("click", () => {
  stopTimer();
  remaining = selectedSeconds;
  focusTaskId = null;
  timerMessage.textContent = "";
  renderTimer();
});
document.querySelectorAll(".preset").forEach(button => {
  button.addEventListener("click", () => {
    if (running) stopTimer();
    document.querySelectorAll(".preset").forEach(preset => preset.classList.remove("active"));
    button.classList.add("active");
    selectedSeconds = Number(button.dataset.minutes) * 60;
    remaining = selectedSeconds;
    focusTaskId = null;
    timerMessage.textContent = "";
    renderTimer();
  });
});
$("#setCustom").addEventListener("click", () => {
  const minutes = Math.floor(Number(customMinutes.value));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 999) {
    timerMessage.textContent = "Choose between 1 and 999 minutes.";
    return;
  }
  if (running) stopTimer();
  document.querySelectorAll(".preset").forEach(preset => preset.classList.remove("active"));
  selectedSeconds = minutes * 60;
  remaining = selectedSeconds;
  focusTaskId = null;
  timerMessage.textContent = "";
  renderTimer();
});

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function validDateKey(key) {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parsed = dateFromKey(key);
  return Number.isFinite(parsed.getTime()) && localDateKey(parsed) === key;
}

function startOfWeek(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function validTime(time) {
  return typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function formatTime(time) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
}

function formatDate(dateKey, options = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, options).format(dateFromKey(dateKey));
}

function validateTasks(value) {
  if (!Array.isArray(value)) return "The backup must contain a task list.";
  const ids = new Set();
  for (const [index, task] of value.entries()) {
    if (!task || typeof task !== "object" || Array.isArray(task))
      return `Task ${index + 1} is not a valid task record.`;
    if (typeof task.id !== "string" || !task.id.trim() || ids.has(task.id))
      return `Task ${index + 1} has a missing or duplicate ID.`;
    if (typeof task.title !== "string" || !task.title.trim() || task.title.length > 120)
      return `Task ${index + 1} needs a title of 1–120 characters.`;
    if (!validDateKey(task.date))
      return `Task “${task.title}” has an invalid calendar date.`;
    if (typeof task.completed !== "boolean")
      return `Task “${task.title}” has an invalid completion status.`;
    const unscheduled = task.start === null && task.end === null;
    const scheduled = validTime(task.start) && validTime(task.end) && timeToMinutes(task.end) > timeToMinutes(task.start);
    if (!unscheduled && !scheduled)
      return `Task “${task.title}” has an invalid start/end time pair.`;
    ids.add(task.id);
  }
  return "";
}

function parseBackup(payload) {
  const parsed = JSON.parse(payload);
  const importedTasks = Array.isArray(parsed) ? parsed : parsed && parsed.version === 1 ? parsed.tasks : null;
  const validationError = validateTasks(importedTasks);
  if (validationError) throw new Error(validationError);
  return importedTasks;
}

const plannerToggle = $("#plannerToggle");
const planner = $("#weeklyPlanner");
const weekDays = $("#weekDays");
const weekLabel = $("#weekLabel");
const selectedDateHeading = $("#selectedDateHeading");
const plannerLocation = $("#plannerLocation");
const plannerStatus = $("#plannerStatus");
const taskList = $("#taskList");
const timeline = $("#timeline");
const taskDialog = $("#taskDialog");
const taskForm = $("#taskForm");
const scheduleDialog = $("#scheduleDialog");
const scheduleForm = $("#scheduleForm");
const scheduleTask = $("#scheduleTask");
const scheduleConflict = $("#scheduleConflict");
const overlapConfirm = $("#overlapConfirm");
const overlapConfirmLabel = $("#overlapConfirmLabel");
const newTaskFields = $("#newTaskFields");
const taskConflict = $("#taskConflict");
const taskOverlapConfirm = $("#taskOverlapConfirm");
const taskOverlapLabel = $("#taskOverlapLabel");
const importDialog = $("#importDialog");

function showStatus(message, destinationDate = null) {
  plannerStatus.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  plannerStatus.append(text);
  if (destinationDate) {
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "text-btn";
    openButton.textContent = `Open ${formatDate(destinationDate, { weekday: "long", month: "long", day: "numeric" })}`;
    openButton.addEventListener("click", () => selectDate(destinationDate, true));
    plannerStatus.append(" ", openButton);
  }
}

function showRecovery(message) {
  storageBlocked = true;
  $("#recoveryMessage").textContent = message;
  $("#recoveryPanel").hidden = false;
}

function persistTasks(nextTasks, errorElement, options = {}) {
  const validationError = validateTasks(nextTasks);
  if (validationError) {
    errorElement.textContent = validationError;
    return false;
  }
  if (storageBlocked && !options.allowReplace) {
    errorElement.textContent = "Saving is paused to protect the existing saved data. Import a valid backup to recover.";
    return false;
  }
  let currentPayload;
  try {
    currentPayload = localStorage.getItem(plannerStorageKey);
  } catch (error) {
    errorElement.textContent = "Storage could not be read. Your changes were not applied; keep this form open and retry.";
    showStatus(errorElement.textContent);
    console.error("Could not inspect planner storage before saving:", error);
    return false;
  }
  if (!options.allowReplace && currentPayload !== savedPayload) {
    if (currentPayload !== null) {
      try {
        parseBackup(currentPayload);
      } catch (error) {
        originalPayload = currentPayload;
        showRecovery(`Saved tasks changed and are now unreadable: ${error.message}. The original value is preserved; export it or import a valid backup.`);
      }
    }
    errorElement.textContent = "Saved tasks changed in another tab or could not be read. Your changes were not applied.";
    return false;
  }

  const nextPayload = JSON.stringify(nextTasks);
  try {
    localStorage.setItem(plannerStorageKey, nextPayload);
  } catch (error) {
    errorElement.textContent = "Could not save to browser storage. Your changes were not applied; keep this form open and retry.";
    console.error("Could not save planner tasks:", error);
    return false;
  }
  savedPayload = nextPayload;
  originalPayload = nextPayload;
  storageBlocked = false;
  $("#recoveryPanel").hidden = true;
  errorElement.textContent = "";
  tasks = nextTasks;
  return true;
}

function tasksForDate(dateKey) {
  return tasks.filter(task => task.date === dateKey);
}

function setFocusKey(element, key) {
  element.dataset.focusKey = key;
  return element;
}

function focusByKey(key) {
  if (!key) return;
  const target = [...planner.querySelectorAll("[data-focus-key]")].find(element => element.dataset.focusKey === key);
  if (target) target.focus({ preventScroll: true });
}

function renderWeek() {
  const weekStart = new Date(displayedWeek);
  const weekEnd = new Date(displayedWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekLabel.textContent = `${formatDate(localDateKey(weekStart), { month: "long", day: "numeric", year: "numeric" })} – ${formatDate(localDateKey(weekEnd), { month: "long", day: "numeric", year: "numeric" })}`;
  const todayKey = localDateKey(new Date());
  weekDays.replaceChildren();
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(displayedWeek);
    date.setDate(date.getDate() + index);
    const dateKey = localDateKey(date);
    const count = tasksForDate(dateKey).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.setAttribute("aria-pressed", String(dateKey === localDateKey(selectedDate)));
    button.setAttribute("aria-label", `${formatDate(dateKey)}${dateKey === todayKey ? ", today" : ""}${dateKey === localDateKey(selectedDate) ? ", selected" : ""}, ${count} tasks`);
    button.dataset.date = dateKey;
    setFocusKey(button, `day:${dateKey}`);
    if (dateKey === todayKey) button.classList.add("is-today");
    if (dateKey === localDateKey(selectedDate)) button.classList.add("is-selected");
    button.innerHTML = `<span class="day-name">${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</span><span class="day-number">${date.getDate()}</span><span class="day-count">${count} ${count === 1 ? "task" : "tasks"}</span>`;
    button.addEventListener("click", () => selectDate(dateKey, true));
    weekDays.append(button);
  }
}

function findConflicts(candidate, excludeId = null) {
  if (!candidate.start || !candidate.end || !validTime(candidate.start) || !validTime(candidate.end) ||
      timeToMinutes(candidate.end) <= timeToMinutes(candidate.start)) return [];
  return tasks.filter(task => task.id !== excludeId && task.date === candidate.date && task.start && task.end &&
    timeToMinutes(candidate.start) < timeToMinutes(task.end) &&
    timeToMinutes(candidate.end) > timeToMinutes(task.start));
}

function showConflicts(container, label, confirmation, candidate, excludeId, resetConfirmation) {
  if (resetConfirmation) confirmation.checked = false;
  const conflicts = findConflicts(candidate, excludeId);
  container.replaceChildren();
  label.hidden = conflicts.length === 0;
  if (conflicts.length) {
    const message = document.createElement("p");
    message.textContent = `Overlaps ${conflicts.map(task => `“${task.title}” (${formatTime(task.start)}–${formatTime(task.end)})`).join(", ")}. Adjust the time or explicitly allow the overlap.`;
    container.append(message);
  } else if (candidate.start && candidate.end && timeToMinutes(candidate.end) <= timeToMinutes(candidate.start)) {
    container.textContent = "End time must be later than start time.";
  }
  return conflicts;
}

function renderTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card${task.completed ? " is-complete" : ""}`;
  card.dataset.taskId = task.id;

  const label = document.createElement("label");
  label.className = "task-check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", `Mark ${task.title} ${task.completed ? "incomplete" : "complete"}`);
  setFocusKey(checkbox, `task:${task.id}:complete`);
  checkbox.addEventListener("change", () => {
    const nextTasks = tasks.map(item => item.id === task.id ? { ...item, completed: checkbox.checked } : item);
    const error = card.querySelector(".task-feedback");
    if (persistTasks(nextTasks, error)) renderPlanner(`task:${task.id}:complete`);
    else checkbox.checked = task.completed;
  });
  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;
  label.append(checkbox, title);
  card.append(label);
  if (task.start) {
    const timeLabel = document.createElement("span");
    timeLabel.className = "task-time";
    timeLabel.textContent = `${formatTime(task.start)}–${formatTime(task.end)}`;
    card.append(timeLabel);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";
  const addAction = (text, accessibleName, key, callback, className = "") => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `text-btn ${className}`.trim();
    button.textContent = text;
    button.setAttribute("aria-label", accessibleName);
    setFocusKey(button, `task:${task.id}:${key}`);
    button.addEventListener("click", callback);
    actions.append(button);
    return button;
  };
  addAction("Edit / move", `Edit or move ${task.title}`, "edit", () => openTaskDialog(task));
  if (task.start) {
    addAction("Reschedule", `Reschedule ${task.title}`, "schedule", () => openScheduleDialog(task));
    addAction("Unschedule", `Remove schedule for ${task.title}`, "unschedule", () => {
      const nextTasks = tasks.map(item => item.id === task.id ? { ...item, start: null, end: null } : item);
      if (persistTasks(nextTasks, card.querySelector(".task-feedback"))) renderPlanner(`task:${task.id}:unschedule`);
    });
  } else {
    addAction("Schedule", `Schedule ${task.title}`, "schedule", () => openScheduleDialog(task));
  }
  if (!task.completed) {
    addAction("Focus", `Focus on ${task.title}`, "focus", () => {
      focusTaskId = task.id;
      if (running) renderTimer();
      else {
        remaining = selectedSeconds;
        startTimer();
      }
    });
  }
  addAction("Delete", `Delete ${task.title}`, "delete", () => {
    if (!window.confirm(`Delete “${task.title}”?`)) return;
    const nextTasks = tasks.filter(item => item.id !== task.id);
    if (persistTasks(nextTasks, card.querySelector(".task-feedback"))) renderPlanner("add-task");
  }, "delete-task");
  card.append(actions);
  const feedback = document.createElement("p");
  feedback.className = "task-feedback";
  feedback.setAttribute("aria-live", "polite");
  card.append(feedback);
  return card;
}

function renderTasks(dateKey) {
  taskList.replaceChildren();
  const dayTasks = tasksForDate(dateKey);
  for (const [heading, subset] of [
    ["Unscheduled", dayTasks.filter(task => !task.start)],
    ["Scheduled", dayTasks.filter(task => task.start).sort((a, b) => a.start.localeCompare(b.start))]
  ]) {
    const group = document.createElement("section");
    group.className = "task-group";
    const groupHeading = document.createElement("h4");
    groupHeading.textContent = `${heading} · ${subset.length}`;
    group.append(groupHeading);
    if (!subset.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = heading === "Unscheduled" ? "No unscheduled tasks." : "Nothing planned yet.";
      group.append(empty);
    } else subset.forEach(task => group.append(renderTaskCard(task)));
    taskList.append(group);
  }
}

function renderTimeline(dateKey) {
  timeline.replaceChildren();
  const scheduled = tasksForDate(dateKey).filter(task => task.start && task.end).sort((a, b) =>
    a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const laneEnds = [];
  const placed = scheduled.map(task => {
    const startMinutes = timeToMinutes(task.start);
    const endMinutes = timeToMinutes(task.end);
    const visualEnd = startMinutes + Math.max(endMinutes - startMinutes, 54);
    let lane = laneEnds.findIndex(end => end <= startMinutes);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = visualEnd;
    return { task, startMinutes, endMinutes, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  const canvas = document.createElement("div");
  canvas.className = "timeline-canvas";
  canvas.style.width = `${Math.max(260, 54 + laneCount * 176)}px`;
  canvas.style.height = `${24 * minuteHeight}px`;
  const hours = document.createElement("div");
  hours.className = "timeline-hours";
  for (let hour = 0; hour < 24; hour += 1) {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "hour-slot";
    slot.setAttribute("aria-label", `Create or schedule a task at ${String(hour).padStart(2, "0")}:00`);
    const label = document.createElement("span");
    label.textContent = `${String(hour).padStart(2, "0")}:00`;
    slot.append(label);
    slot.addEventListener("click", () => openScheduleDialog(null,
      `${String(hour).padStart(2, "0")}:00`,
      hour === 23 ? "23:59" : `${String(hour + 1).padStart(2, "0")}:00`));
    hours.append(slot);
  }
  const events = document.createElement("div");
  events.className = "timeline-events";
  events.style.left = "54px";
  events.style.width = `${laneCount * 176}px`;
  placed.forEach(({ task, startMinutes, endMinutes, lane }) => {
    const block = document.createElement("button");
    block.type = "button";
    block.className = `timeline-task${task.completed ? " is-complete" : ""}`;
    block.style.top = `${startMinutes / 60 * minuteHeight}px`;
    block.style.height = `${Math.max((endMinutes - startMinutes) / 60 * minuteHeight, 44)}px`;
    block.style.left = `${lane * 176 + 4}px`;
    block.style.width = "168px";
    block.textContent = `${task.title} · ${formatTime(task.start)}–${formatTime(task.end)}`;
    block.setAttribute("aria-label", `${task.title}, ${formatTime(task.start)} to ${formatTime(task.end)}${task.completed ? ", completed" : ""}. Edit schedule.`);
    setFocusKey(block, `timeline:${task.id}`);
    block.addEventListener("click", () => openScheduleDialog(task));
    events.append(block);
  });
  canvas.append(hours, events);
  timeline.append(canvas);
}

function renderPlanner(focusKey = null) {
  const dateKey = localDateKey(selectedDate);
  selectedDateHeading.textContent = formatDate(dateKey);
  plannerLocation.textContent = formatDate(dateKey);
  renderWeek();
  renderTasks(dateKey);
  renderTimeline(dateKey);
  renderTimer();
  if (focusKey) requestAnimationFrame(() => focusByKey(focusKey));
}

function selectDate(dateKey, retainFocus = false) {
  selectedDate = dateFromKey(dateKey);
  const weekStart = new Date(displayedWeek);
  const weekEnd = new Date(displayedWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  if (selectedDate < weekStart || selectedDate > weekEnd) displayedWeek = startOfWeek(selectedDate);
  renderPlanner(retainFocus ? `day:${dateKey}` : null);
}

function openTaskDialog(task = null) {
  editingTaskId = task ? task.id : null;
  taskDialogReturnFocus = document.activeElement;
  $("#taskDialogHeading").textContent = task ? "Edit or move task" : "Add a task";
  $("#taskTitle").value = task ? task.title : "";
  $("#taskDate").value = task ? task.date : localDateKey(selectedDate);
  $("#taskStart").value = task && task.start ? task.start : "";
  $("#taskEnd").value = task && task.end ? task.end : "";
  $("#taskFormError").textContent = "";
  showConflicts(taskConflict, taskOverlapLabel, taskOverlapConfirm, {
    date: $("#taskDate").value, start: $("#taskStart").value, end: $("#taskEnd").value
  }, editingTaskId, true);
  taskDialog.showModal();
  $("#taskTitle").focus();
}

function openScheduleDialog(task = null, start = "", end = "") {
  scheduleDialogReturnFocus = document.activeElement;
  scheduleTaskId = task ? task.id : null;
  const dateKey = localDateKey(selectedDate);
  scheduleTask.replaceChildren();
  const dayTasks = tasksForDate(dateKey);
  const unscheduledGroup = document.createElement("optgroup");
  unscheduledGroup.label = "Unscheduled tasks for this day";
  dayTasks.filter(item => !item.start).forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title;
    unscheduledGroup.append(option);
  });
  if (unscheduledGroup.children.length) scheduleTask.append(unscheduledGroup);

  const scheduledGroup = document.createElement("optgroup");
  scheduledGroup.label = "Already scheduled this day";
  dayTasks.filter(item => item.start).forEach(item => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title;
    scheduledGroup.append(option);
  });
  if (scheduledGroup.children.length) scheduleTask.append(scheduledGroup);

  const createOption = document.createElement("option");
  createOption.value = "__new__";
  createOption.textContent = "Create a new task";
  scheduleTask.append(createOption);

  const otherDayTasks = tasks.filter(item => item.date !== dateKey);
  if (otherDayTasks.length) {
    const moveGroup = document.createElement("optgroup");
    moveGroup.label = "Move a task from another day (explicit)";
    otherDayTasks.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `Move “${item.title}” from ${formatDate(item.date, { weekday: "short", month: "short", day: "numeric" })}`;
      moveGroup.append(option);
    });
    scheduleTask.append(moveGroup);
  }

  if (task) scheduleTask.value = task.id;
  else {
    const firstUnscheduled = dayTasks.find(item => !item.start);
    scheduleTask.value = firstUnscheduled ? firstUnscheduled.id : "__new__";
  }
  scheduleTaskId = scheduleTask.value === "__new__" ? null : scheduleTask.value;
  newTaskFields.hidden = scheduleTask.value !== "__new__";
  $("#newScheduledTitle").value = "";
  $("#scheduleDate").value = dateKey;
  $("#scheduleStart").value = start || (task && task.start) || "09:00";
  $("#scheduleEnd").value = end || (task && task.end) || "10:00";
  $("#scheduleFormError").textContent = "";
  showConflicts(scheduleConflict, overlapConfirmLabel, overlapConfirm, {
    date: $("#scheduleDate").value, start: $("#scheduleStart").value, end: $("#scheduleEnd").value
  }, scheduleTaskId, true);
  scheduleDialog.showModal();
  if (scheduleTask.value === "__new__") $("#newScheduledTitle").focus();
  else scheduleTask.focus();
}

function closeDialogAndRestore(dialog, trigger) {
  dialog.close();
  requestAnimationFrame(() => {
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    else $("#addTaskButton").focus({ preventScroll: true });
  });
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setPlannerView(view, focus = false) {
  const content = $(".planner-content");
  const tasksTab = $("#tasksTab");
  const scheduleTab = $("#scheduleTab");
  content.dataset.view = view;
  tasksTab.classList.toggle("active", view === "tasks");
  scheduleTab.classList.toggle("active", view === "schedule");
  tasksTab.setAttribute("aria-selected", String(view === "tasks"));
  scheduleTab.setAttribute("aria-selected", String(view === "schedule"));
  if (focus) (view === "tasks" ? tasksTab : scheduleTab).focus();
}

function initializePlanner() {
  try {
    originalPayload = localStorage.getItem(plannerStorageKey);
    savedPayload = originalPayload;
    if (originalPayload !== null) tasks = parseBackup(originalPayload);
  } catch (error) {
    tasks = [];
    showRecovery(`Saved tasks could not be read: ${error.message}. The original saved value is preserved. Export it or import a valid backup to recover.`);
    console.error("Could not load planner tasks:", error);
  }
  $("#storageLocation").textContent = `Saved in this browser on this device · localStorage key: ${plannerStorageKey}`;
  renderPlanner();

  plannerToggle.addEventListener("click", () => {
    const opening = planner.hidden;
    planner.hidden = !opening;
    planner.classList.toggle("hidden", !opening);
    document.body.classList.toggle("planner-open", opening);
    plannerToggle.setAttribute("aria-expanded", String(opening));
    if (opening) {
      selectedDate = new Date();
      selectedDate.setHours(0, 0, 0, 0);
      displayedWeek = startOfWeek(selectedDate);
      renderPlanner(`day:${localDateKey(selectedDate)}`);
      planner.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#plannerHeading").focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  $("#previousWeek").addEventListener("click", () => {
    displayedWeek.setDate(displayedWeek.getDate() - 7);
    selectedDate.setDate(selectedDate.getDate() - 7);
    renderPlanner(`day:${localDateKey(selectedDate)}`);
  });
  $("#nextWeek").addEventListener("click", () => {
    displayedWeek.setDate(displayedWeek.getDate() + 7);
    selectedDate.setDate(selectedDate.getDate() + 7);
    renderPlanner(`day:${localDateKey(selectedDate)}`);
  });
  $("#todayButton").addEventListener("click", () => {
    selectedDate = new Date();
    selectedDate.setHours(0, 0, 0, 0);
    displayedWeek = startOfWeek(selectedDate);
    renderPlanner(`day:${localDateKey(selectedDate)}`);
  });
  $("#addTaskButton").addEventListener("click", () => openTaskDialog());
  $("#tasksTab").addEventListener("click", () => setPlannerView("tasks"));
  $("#scheduleTab").addEventListener("click", () => setPlannerView("schedule"));
  [$("#tasksTab"), $("#scheduleTab")].forEach((tab, index, tabs) => {
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index + tabs.length - 1) % tabs.length;
      setPlannerView(next === 0 ? "tasks" : "schedule", true);
    });
  });

  $("#cancelTask").addEventListener("click", () => closeDialogAndRestore(taskDialog, taskDialogReturnFocus));
  taskDialog.addEventListener("close", () => {
    if (taskDialogReturnFocus && taskDialogReturnFocus.isConnected)
      taskDialogReturnFocus.focus({ preventScroll: true });
  });
  ["taskDate", "taskStart", "taskEnd"].forEach(id => $(`#${id}`).addEventListener("input", () => {
    showConflicts(taskConflict, taskOverlapLabel, taskOverlapConfirm, {
      date: $("#taskDate").value, start: $("#taskStart").value, end: $("#taskEnd").value
    }, editingTaskId, true);
  }));
  taskForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = $("#taskTitle").value.trim();
    const date = $("#taskDate").value;
    const start = $("#taskStart").value || null;
    const end = $("#taskEnd").value || null;
    const error = $("#taskFormError");
    error.textContent = "";
    if (!title || !validDateKey(date)) {
      error.textContent = "Enter a task name and a valid day.";
      return;
    }
    if ((start === null) !== (end === null) || (start && (!validTime(start) || !validTime(end) || timeToMinutes(end) <= timeToMinutes(start)))) {
      error.textContent = "Enter both times, with the end later than the start, or leave both blank.";
      return;
    }
    const conflicts = findConflicts({ date, start, end }, editingTaskId);
    if (conflicts.length && !taskOverlapConfirm.checked) {
      showConflicts(taskConflict, taskOverlapLabel, taskOverlapConfirm, { date, start, end }, editingTaskId, false);
      error.textContent = "Review the conflicts and explicitly confirm the overlap, or adjust the schedule.";
      return;
    }
    const existing = tasks.find(task => task.id === editingTaskId);
    const task = existing
      ? { ...existing, title, date, start, end }
      : { id: crypto.randomUUID(), title, date, completed: false, start, end };
    const nextTasks = existing
      ? tasks.map(item => item.id === task.id ? task : item)
      : [...tasks, task];
    if (!persistTasks(nextTasks, error)) return;
    const moved = existing && existing.date !== date;
    taskDialog.close();
    if (moved) showStatus(`“${title}” moved to ${formatDate(date)}.`, date);
    else showStatus("");
    renderPlanner(moved ? "add-task" : `task:${task.id}:edit`);
  });

  $("#cancelSchedule").addEventListener("click", () => closeDialogAndRestore(scheduleDialog, scheduleDialogReturnFocus));
  scheduleDialog.addEventListener("close", () => {
    if (scheduleDialogReturnFocus && scheduleDialogReturnFocus.isConnected)
      scheduleDialogReturnFocus.focus({ preventScroll: true });
  });
  scheduleTask.addEventListener("change", () => {
    scheduleTaskId = scheduleTask.value === "__new__" ? null : scheduleTask.value;
    newTaskFields.hidden = scheduleTask.value !== "__new__";
    if (scheduleTask.value === "__new__") $("#newScheduledTitle").focus();
    showConflicts(scheduleConflict, overlapConfirmLabel, overlapConfirm, {
      date: $("#scheduleDate").value, start: $("#scheduleStart").value, end: $("#scheduleEnd").value
    }, scheduleTaskId, true);
  });
  ["scheduleDate", "scheduleStart", "scheduleEnd"].forEach(id => $(`#${id}`).addEventListener("input", () => {
    showConflicts(scheduleConflict, overlapConfirmLabel, overlapConfirm, {
      date: $("#scheduleDate").value, start: $("#scheduleStart").value, end: $("#scheduleEnd").value
    }, scheduleTaskId, true);
  }));
  scheduleForm.addEventListener("submit", event => {
    event.preventDefault();
    const error = $("#scheduleFormError");
    error.textContent = "";
    const date = $("#scheduleDate").value;
    const start = $("#scheduleStart").value;
    const end = $("#scheduleEnd").value;
    if (!validDateKey(date) || !validTime(start) || !validTime(end) || timeToMinutes(end) <= timeToMinutes(start)) {
      error.textContent = "Choose a valid day and an end time later than the start time.";
      return;
    }
    const conflicts = findConflicts({ date, start, end }, scheduleTaskId);
    if (conflicts.length && !overlapConfirm.checked) {
      showConflicts(scheduleConflict, overlapConfirmLabel, overlapConfirm, { date, start, end }, scheduleTaskId, false);
      error.textContent = "Review the conflicts and explicitly confirm the overlap, or adjust the schedule.";
      return;
    }
    let task;
    if (scheduleTask.value === "__new__") {
      const title = $("#newScheduledTitle").value.trim();
      if (!title) {
        error.textContent = "Enter a name for the new task.";
        $("#newScheduledTitle").focus();
        return;
      }
      task = { id: crypto.randomUUID(), title, date, completed: false, start, end };
    } else {
      const existing = tasks.find(item => item.id === scheduleTask.value);
      if (!existing) {
        error.textContent = "That task is no longer available. Close this dialog and try again.";
        return;
      }
      task = { ...existing, date, start, end };
    }
    const nextTasks = tasks.some(item => item.id === task.id)
      ? tasks.map(item => item.id === task.id ? task : item)
      : [...tasks, task];
    const previousDate = tasks.find(item => item.id === task.id)?.date;
    if (!persistTasks(nextTasks, error)) return;
    const moved = previousDate !== undefined && previousDate !== date;
    scheduleDialog.close();
    if (moved) showStatus(`“${task.title}” moved to ${formatDate(date)}.`, date);
    else showStatus("");
    renderPlanner(moved ? "add-task" : `task:${task.id}:schedule`);
  });

  $("#exportTasks").addEventListener("click", () => {
    downloadFile("omerta-planner-backup.json", JSON.stringify({ version: 1, tasks }, null, 2), "application/json");
    showStatus(`Exported ${tasks.length} planner ${tasks.length === 1 ? "task" : "tasks"} to a JSON backup.`);
  });
  $("#exportRawData").addEventListener("click", () => {
    if (originalPayload === null) {
      showStatus("There is no original saved payload available to export.");
      return;
    }
    downloadFile("omerta-planner-original-data.txt", originalPayload, "text/plain");
    showStatus("Downloaded the original stored value without changing it.");
  });
  $("#importTasks").addEventListener("click", () => {
    importDialogReturnFocus = $("#importTasks");
    $("#importFile").click();
  });
  $("#importFile").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = parseBackup(await file.text());
      pendingImportTasks = imported;
      $("#importPreview").textContent = storageBlocked
        ? `This backup contains ${imported.length} valid tasks. Your existing saved payload is unreadable. Confirming replaces that original payload with these ${imported.length} tasks. Your theme and timer settings stay unchanged.`
        : `This backup contains ${imported.length} valid tasks. Confirming replaces the current list of ${tasks.length} tasks. Your theme and timer settings stay unchanged.`;
      importDialog.showModal();
    } catch (error) {
      showStatus(`Import rejected: ${error.message}. Existing tasks were not changed.`);
      console.error("Could not import planner backup:", error);
    } finally {
      event.target.value = "";
    }
  });
  $("#cancelImport").addEventListener("click", () => importDialog.close());
  importDialog.addEventListener("close", () => {
    pendingImportTasks = null;
    if (importDialogReturnFocus && importDialogReturnFocus.isConnected)
      importDialogReturnFocus.focus({ preventScroll: true });
  });
  $("#confirmImport").addEventListener("click", () => {
    if (!pendingImportTasks) return;
    const error = plannerStatus;
    if (!persistTasks(pendingImportTasks, error, { allowReplace: true })) return;
    pendingImportTasks = null;
    importDialog.close();
    showStatus("Planner backup imported successfully.");
    renderPlanner("add-task");
  });
}

initializePlanner();

startBtn.textContent = "Start";
renderTimer();
completeFocusTask.addEventListener("click", () => {
  const task = tasks.find(item => item.id === focusTaskId);
  if (!task || task.completed) return;
  const feedback = timerMessage;
  const nextTasks = tasks.map(item => item.id === task.id ? { ...item, completed: true } : item);
  if (!persistTasks(nextTasks, feedback)) return;
  timerMessage.textContent = `“${task.title}” marked complete.`;
  renderTimer();
  renderPlanner();
});

document.addEventListener("keydown", event => {
  if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey && !event.altKey &&
      event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA" && event.target.tagName !== "SELECT") {
    event.preventDefault();
    fullscreenToggle.click();
  }
});
