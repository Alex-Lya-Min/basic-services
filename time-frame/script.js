const TIMER_STORAGE_KEY = 'timeFrameTimerState';

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

initializeTheme();

const themeSwitcher = document.getElementById('theme-switcher');
if (themeSwitcher) {
    themeSwitcher.addEventListener('click', toggleTheme);
}

const weekNumberElement = document.getElementById('weekNumber');
const yearProgressTextElement = document.getElementById('yearProgressText');
const yearProgressPercentElement = document.getElementById('yearProgressPercent');
const yearProgressBarElement = document.getElementById('yearProgressBar');

const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');
const startButton = document.getElementById('startTimer');
const pauseResumeButton = document.getElementById('pauseResumeTimer');
const resetButton = document.getElementById('resetTimer');
const presetButtons = document.querySelectorAll('[data-duration]');
const customMinutesInput = document.getElementById('customMinutes');
const applyCustomButton = document.getElementById('applyCustom');
const timerContainer = document.querySelector('.time-frame-timer');

const defaultTimerState = {
    durationMs: 1800000,
    startedAt: null,
    pausedAt: null,
    accumulatedPausedMs: 0,
    isRunning: false
};

let timerState = { ...defaultTimerState };

function padNumber(value) {
    return String(value).padStart(2, '0');
}

function formatTime(ms) {
    const isNegative = ms < 0;
    const absoluteMs = Math.abs(ms);
    const totalSeconds = Math.floor(absoluteMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${padNumber(hours)}:${padNumber(minutes)}:${padNumber(seconds)}`;
    return isNegative ? `-${formatted}` : formatted;
}

function getISOWeekNumber(date) {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNumber = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
    return weekNumber;
}

function updateWeekNumber() {
    if (!weekNumberElement) return;
    const weekNumber = getISOWeekNumber(new Date());
    weekNumberElement.textContent = `Week ${padNumber(weekNumber)}`;
}

function updateYearProgress() {
    if (!yearProgressTextElement || !yearProgressPercentElement || !yearProgressBarElement) return;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);
    const elapsedMs = now - startOfYear;
    const totalMs = startOfNextYear - startOfYear;
    const percent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

    const totalMinutes = Math.floor(elapsedMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    yearProgressTextElement.textContent = `${days} days ${hours} hours ${minutes} min elapsed`;
    yearProgressPercentElement.textContent = `${percent.toFixed(2)}% of the year`;
    yearProgressBarElement.style.width = `${percent.toFixed(2)}%`;
}

function loadTimerState() {
    try {
        const stored = localStorage.getItem(TIMER_STORAGE_KEY);
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (typeof parsed.durationMs === 'number') {
            timerState = {
                ...defaultTimerState,
                ...parsed
            };
        }
    } catch (error) {
        console.error('Failed to load timer state', error);
    }
}

function saveTimerState() {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
}

function setDuration(durationMs) {
    timerState.durationMs = durationMs;
    timerState.startedAt = null;
    timerState.pausedAt = null;
    timerState.accumulatedPausedMs = 0;
    timerState.isRunning = false;
    saveTimerState();
    updateTimerDisplay();
    updateTimerControls();
}

function getElapsedMs() {
    if (!timerState.startedAt) return 0;
    const now = Date.now();
    const effectiveNow = timerState.isRunning
        ? now
        : (timerState.pausedAt || now);
    return effectiveNow - timerState.startedAt - timerState.accumulatedPausedMs;
}

function getRemainingMs() {
    if (!timerState.startedAt) return timerState.durationMs;
    return timerState.durationMs - getElapsedMs();
}

function updateTimerDisplay() {
    if (!timerDisplay || !timerStatus || !timerContainer) return;
    const remainingMs = getRemainingMs();
    timerDisplay.textContent = formatTime(remainingMs);

    const isOverdue = remainingMs < 0;
    timerContainer.classList.toggle('is-overdue', isOverdue);
    timerStatus.classList.toggle('overdue', isOverdue);

    if (!timerState.startedAt) {
        timerStatus.textContent = 'Ready';
    } else if (!timerState.isRunning && timerState.pausedAt) {
        timerStatus.textContent = 'Paused';
    } else if (isOverdue) {
        timerStatus.textContent = `Overdue by ${formatTime(Math.abs(remainingMs))}`;
    } else {
        timerStatus.textContent = 'Running';
    }
}

function updateTimerControls() {
    if (!startButton || !pauseResumeButton || !resetButton) return;
    const hasStarted = Boolean(timerState.startedAt);
    startButton.disabled = hasStarted;
    pauseResumeButton.disabled = !hasStarted;
    resetButton.disabled = !hasStarted && timerState.durationMs === defaultTimerState.durationMs;

    if (timerState.isRunning) {
        pauseResumeButton.textContent = 'Pause';
    } else {
        pauseResumeButton.textContent = hasStarted ? 'Resume' : 'Pause';
    }
}

function startTimer() {
    if (timerState.startedAt) return;
    timerState.startedAt = Date.now();
    timerState.isRunning = true;
    timerState.pausedAt = null;
    timerState.accumulatedPausedMs = 0;
    saveTimerState();
    updateTimerControls();
}

function togglePauseResume() {
    if (!timerState.startedAt) return;

    if (timerState.isRunning) {
        timerState.isRunning = false;
        timerState.pausedAt = Date.now();
    } else {
        const pauseDuration = timerState.pausedAt ? Date.now() - timerState.pausedAt : 0;
        timerState.accumulatedPausedMs += pauseDuration;
        timerState.pausedAt = null;
        timerState.isRunning = true;
    }

    saveTimerState();
    updateTimerControls();
    updateTimerDisplay();
}

function resetTimer() {
    timerState.startedAt = null;
    timerState.pausedAt = null;
    timerState.accumulatedPausedMs = 0;
    timerState.isRunning = false;
    saveTimerState();
    updateTimerControls();
    updateTimerDisplay();
}

presetButtons.forEach(button => {
    button.addEventListener('click', () => {
        const duration = Number(button.dataset.duration);
        if (!Number.isNaN(duration)) {
            setDuration(duration);
        }
    });
});

if (applyCustomButton && customMinutesInput) {
    applyCustomButton.addEventListener('click', () => {
        const minutes = Number(customMinutesInput.value);
        if (!Number.isNaN(minutes) && minutes > 0) {
            setDuration(minutes * 60000);
            customMinutesInput.value = '';
        }
    });
}

if (startButton) {
    startButton.addEventListener('click', () => {
        startTimer();
        updateTimerDisplay();
    });
}

if (pauseResumeButton) {
    pauseResumeButton.addEventListener('click', togglePauseResume);
}

if (resetButton) {
    resetButton.addEventListener('click', resetTimer);
}

function updateTimer() {
    updateTimerDisplay();
}

loadTimerState();
updateWeekNumber();
updateYearProgress();
updateTimerControls();
updateTimerDisplay();

setInterval(() => {
    updateWeekNumber();
    updateYearProgress();
    updateTimer();
}, 1000);
