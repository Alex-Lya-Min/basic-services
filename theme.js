// Shared theme logic for all pages. Applies the saved theme (or the OS
// preference) to <html> before first paint and wires up #theme-switcher.
(function () {
    const STORAGE_KEY = 'theme';

    function getPreferredTheme() {
        let saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            console.warn('Unable to read the saved theme.', error);
        }
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (error) {
            console.warn('Unable to save the selected theme.', error);
        }
    }

    applyTheme(getPreferredTheme());

    function bindSwitcher() {
        const switcher = document.getElementById('theme-switcher');
        if (switcher) {
            switcher.addEventListener('click', toggleTheme);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindSwitcher);
    } else {
        bindSwitcher();
    }
})();
