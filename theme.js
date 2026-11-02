// Shared theme logic for all pages. Applies the saved theme (or the OS
// preference) to <html> before first paint and wires up #theme-switcher.
// Until the user picks a theme explicitly, the page keeps following
// OS-level light/dark changes live.
(function () {
    const STORAGE_KEY = 'theme';
    const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function getSavedTheme() {
        let saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to read the saved theme.', error);
        }
        return saved === 'light' || saved === 'dark' ? saved : null;
    }

    // Set once the user toggles the theme, even if storage is unavailable,
    // so OS changes stop overriding an explicit choice for this page view.
    let hasExplicitChoice = getSavedTheme() !== null;

    function getPreferredTheme() {
        const saved = getSavedTheme();
        if (saved) {
            return saved;
        }
        return darkQuery && darkQuery.matches ? 'dark' : 'light';
    }

    function updateSwitcherState(theme) {
        const switcher = document.getElementById('theme-switcher');
        if (switcher) {
            switcher.setAttribute('title',theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        updateSwitcherState(theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        hasExplicitChoice = true;
        applyTheme(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (error) {
            console.warn('Unable to save the selected theme.', error);
        }
    }

    function handleSystemThemeChange(event) {
        if (hasExplicitChoice || getSavedTheme()) return;
        applyTheme(event.matches ? 'dark' : 'light');
    }

    applyTheme(getPreferredTheme());

    if (darkQuery) {
        if (typeof darkQuery.addEventListener === 'function') {
            darkQuery.addEventListener('change', handleSystemThemeChange);
        } else if (typeof darkQuery.addListener === 'function') {
            // Safari < 14
            darkQuery.addListener(handleSystemThemeChange);
        }
    }

    function bindSwitcher() {
        const switcher = document.getElementById('theme-switcher');
        if (switcher) {
            switcher.addEventListener('click', toggleTheme);
            updateSwitcherState(document.documentElement.getAttribute('data-theme'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSwitcher);
    } else {
        bindSwitcher();
    }
})();
