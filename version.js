// Single source of truth for the app version shown in page footers.
// Elements opt in with the data-app-version attribute; an optional
// data-version-suffix is appended (e.g. the bundled ffmpeg version).
(function () {
    const APP_VERSION = '0.0.15D';
    const APP_VERSION_DATE = 'July 2026';
    const label = 'Version ' + APP_VERSION_DATE + ' ' + APP_VERSION;

    function applyVersion() {
        document.querySelectorAll('[data-app-version]').forEach(function (element) {
            const suffix = element.getAttribute('data-version-suffix');
            element.textContent = suffix ? label + ' ' + suffix : label;
        });
        document.querySelectorAll('[data-app-version-value]').forEach(function (element) {
            element.textContent = APP_VERSION;
        });
        document.querySelectorAll('[data-app-version-date]').forEach(function (element) {
            element.textContent = APP_VERSION_DATE;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyVersion);
    } else {
        applyVersion();
    }
})();
