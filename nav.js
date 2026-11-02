// Shared services-row behaviour for all pages. On narrow screens the
// services row is a horizontal scroller; keep the active service visible
// instead of leaving it off-screen to the right.
(function () {
    function revealActiveService() {
        const nav = document.querySelector('.tab-navigation');
        if (!nav) return;
        const active = nav.querySelector('.tab-button.active');
        if (!active || nav.scrollWidth <= nav.clientWidth) return;

        const navRect = nav.getBoundingClientRect();
        const activeRect = active.getBoundingClientRect();
        const offset = activeRect.left - navRect.left + nav.scrollLeft;
        const target = offset - (nav.clientWidth - activeRect.width) / 2;
        const maxScroll = nav.scrollWidth - nav.clientWidth;
        // Scroll only the row itself: scrollIntoView() could also move the page.
        nav.scrollLeft = Math.max(0, Math.min(maxScroll, target));
    }

    window.revealActiveService = revealActiveService;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', revealActiveService);
    } else {
        revealActiveService();
    }
})();
