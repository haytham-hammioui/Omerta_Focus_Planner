# ⏱️ Omerta Focus Planner

A clean and distraction-free focus timer with a weekly planner for studying or working.

Omerta Focus Planner includes a real-time analog clock, customizable focus sessions, light/dark themes, and a dedicated fullscreen clock mode.

The Weekly Planner lets you organize tasks by local calendar date, schedule tasks on a daily timeline, track completion, and focus on a task without interrupting an active session.

## 🌐 Live Demo

Use Omerta Focus Planner directly in your browser:

**https://haytham-hammioui.github.io/Omerta_Focus_Timer/**

No installation is required.

## ✨ Features

- ⏱️ 25, 45, and 60 minute focus presets
- ⚙️ Custom focus sessions from 1 to 999 minutes
- ▶️ Start, pause, and reset controls
- 🔔 Focus session completion notification and optional manual task completion
- 🌙 Light and dark themes with saved preference
- 🕐 Real-time analog clock
- ⛶ Dedicated fullscreen clock mode
- 🗓️ Weekly Planner with date navigation, daily to-do lists, and an editable schedule
- 💾 Planner tasks saved in browser local storage, with JSON backup export and import
- ⌨️ Press `F` to enter or leave fullscreen mode
- 📱 Responsive design for different screen sizes
- 🌐 Runs entirely in the browser
- 🚫 No dependencies or frameworks

## 🚀 Usage

1. Open the [live website](https://haytham-hammioui.github.io/Omerta_Focus_Timer/).
2. Choose `25`, `45`, `60`, or enter a custom number of minutes.
3. Select **Start** to begin your focus session.
4. Use the **fullscreen button** or press `F` to focus on the analog clock.
5. Press `F` or `Esc` to leave fullscreen mode.
6. Open **Weekly Planner** to add tasks, schedule them from a task card or timeline slot, navigate weeks, and focus on tasks.

## 💻 Run Locally

No build process or dependencies are required.

Planner tasks are saved on this browser and device under the `omerta-planner-tasks` localStorage key. They are not synced between devices or browsers. Use **Export backup** to save a JSON copy, or **Import backup** to restore one. Invalid saved data is preserved until you explicitly recover it by importing a valid backup.

### Option 1 — Open directly

```bash
git clone https://github.com/haytham-hammioui/Omerta_Focus_Timer.git
cd Omerta_Focus_Timer
```

Then open `index.html` in a modern browser.

### Option 2 — Local server

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

Alternatively, with Node.js:

```bash
npx serve .
```

## 📁 Project Structure

```text
Omerta_Focus_Timer/
├── index.html
├── style.css
├── app.js
├── README.md
└── LICENSE
```

## 🛠️ Built With

- HTML5
- CSS3
- Vanilla JavaScript
- Fullscreen API

No frameworks or external dependencies are required.

## 🌍 Browser Support

Designed for modern versions of Chrome, Edge, Firefox, and Safari.

---
