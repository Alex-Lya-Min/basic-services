// Single source of truth for the app version shown in page footers.
// Full labels use data-app-version; compact cards use the value/date
// attributes. An optional data-version-suffix extends a full label.
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
