// Theme handling lives in theme.js (shared across all pages).

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-button');
const toolPanels = document.querySelectorAll('.tool-panel');

// Device details elements
const deviceInfoElements = {
    browserName: document.getElementById('browserName'),
    browserVersion: document.getElementById('browserVersion'),
    osName: document.getElementById('osName'),
    deviceType: document.getElementById('deviceType'),
    platformInfo: document.getElementById('platformInfo'),
    hardwareConcurrency: document.getElementById('hardwareConcurrency'),
    deviceMemory: document.getElementById('deviceMemory'),
    language: document.getElementById('language'),
    deviceScreenResolution: document.getElementById('deviceScreenResolution'),
    pixelRatio: document.getElementById('pixelRatio'),
    viewportSize: document.getElementById('viewportSize'),
    timeZone: document.getElementById('timeZone'),
    userAgent: document.getElementById('userAgent')
};
const copyDeviceDetailsButton = document.getElementById('copyDeviceDetails');

const DEFAULT_TAB = 'display-tool';

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // If it's a link (like Video Compressor), let the default navigation happen
        if (!button.dataset.tab) return;

        // Perform tab switch
        switchTab(button.dataset.tab);

        // Update URL hash without scrolling
        history.pushState(null, null, `#${button.dataset.tab}`);
    });
});

// WAI-ARIA tabs keyboard pattern: arrow keys / Home / End move between the
// in-page tool tabs (the inactive ones are removed from the Tab order).
function handleTabKeydown(event) {
    const tabs = Array.from(tabButtons).filter(btn => btn.dataset.tab);
    const index = tabs.indexOf(event.currentTarget);
    if (index === -1) return;

    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    switchTab(nextTab.dataset.tab);
    history.pushState(null, null, `#${nextTab.dataset.tab}`);
    if (typeof nextTab.focus === 'function') nextTab.focus();
}

tabButtons.forEach(button => {
    if (button.dataset.tab) {
        button.addEventListener('keydown', handleTabKeydown);
    }
});

const currentServiceElement = document.getElementById('currentService');

// Reflect the active tool's name in the header "you are here" marker.
function updateCurrentService(tabId) {
    if (!currentServiceElement) return;
    const activeButton = Array.from(tabButtons).find(btn => btn.dataset.tab === tabId);
    if (activeButton) {
        currentServiceElement.textContent = activeButton.textContent.trim();
    }
}

function switchTab(tabId) {
    // Remove active class from all buttons and panels
    tabButtons.forEach(btn => {
        // Links to standalone tools are not tabs: leave their state alone.
        if (!btn.dataset.tab) return;
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    toolPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId + '-panel');
    });

    updateCurrentService(tabId);

    if (typeof window.revealActiveService === 'function') {
        window.revealActiveService();
    }
}

// Handle hash change for direct linking. An empty or unknown hash (e.g. after
// pressing Back to the initial URL) restores the default tool instead of
// leaving the previously selected one on screen.
function handleHashNavigation() {
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(hash + '-panel')) {
        switchTab(hash); // switchTab will append -panel internally
    } else {
        switchTab(DEFAULT_TAB);
    }
}

// Initialize navigation. script.js runs at the end of <body>, so the panels
// already exist: select the tool right away instead of waiting for 'load'
// (fonts and other resources), which made the default tool flash first.
handleHashNavigation();
window.addEventListener('hashchange', handleHashNavigation);
window.addEventListener('popstate', handleHashNavigation);

// Display Resolution Tool
const windowWidthElement = document.getElementById('windowWidth');
const windowHeightElement = document.getElementById('windowHeight');
const screenResolutionElement = document.getElementById('screenResolution');
const realResolutionElement = document.getElementById('realResolution');
const availableSpaceElement = document.getElementById('availableSpace');
const displayScaleElement = document.getElementById('displayScale');

// Function to calculate display scale
function getDisplayScale() {
    const devicePixelRatio = window.devicePixelRatio;
    const scalePercentage = Math.round(devicePixelRatio * 100 / 25) * 25;
    return scalePercentage;
}

function detectBrowser(userAgent = navigator.userAgent) {
    let name = 'Unknown';
    let version = 'Unknown';

    // Chromium-based browsers also include "Chrome/" (and iOS ones
    // "Safari/"), so their own tokens must be checked first.
    if (/Edg(?:e|A|iOS)?\//.test(userAgent)) {
        name = 'Microsoft Edge';
        version = userAgent.match(/Edg(?:e|A|iOS)?\/([\d.]+)/)[1];
    } else if (/YaBrowser\//.test(userAgent)) {
        name = 'Yandex Browser';
        version = userAgent.match(/YaBrowser\/([\d.]+)/)[1];
    } else if (/SamsungBrowser\//.test(userAgent)) {
        name = 'Samsung Internet';
        version = userAgent.match(/SamsungBrowser\/([\d.]+)/)[1];
    } else if (/OPR\//.test(userAgent)) {
        name = 'Opera';
        version = userAgent.match(/OPR\/([\d.]+)/)[1];
    } else if (/Brave\//.test(userAgent)) {
        name = 'Brave';
        version = userAgent.match(/Brave\/([\d.]+)/)[1];
    } else if (/CriOS\//.test(userAgent)) {
        name = 'Chrome (iOS)';
        version = userAgent.match(/CriOS\/([\d.]+)/)[1];
    } else if (/FxiOS\//.test(userAgent)) {
        name = 'Firefox (iOS)';
        version = userAgent.match(/FxiOS\/([\d.]+)/)[1];
    } else if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) {
        name = 'Chrome';
        version = userAgent.match(/Chrome\/([\d.]+)/)[1];
    } else if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) {
        name = 'Safari';
        version = userAgent.match(/Version\/([\d.]+)/)[1];
    } else if (/Firefox\//.test(userAgent)) {
        name = 'Firefox';
        version = userAgent.match(/Firefox\/([\d.]+)/)[1];
    } else if (/MSIE\s([\d.]+)/.test(userAgent)) {
        name = 'Internet Explorer';
        version = userAgent.match(/MSIE\s([\d.]+)/)[1];
    } else if (/Trident\/.*rv:([\d.]+)/.test(userAgent)) {
        name = 'Internet Explorer';
        version = userAgent.match(/Trident\/.*rv:([\d.]+)/)[1];
    }

    return { name, version };
}

function detectOS(userAgent = navigator.userAgent) {
    if (/Windows NT 10\.0/.test(userAgent)) return 'Windows 10/11';
    if (/Windows NT 6\.3/.test(userAgent)) return 'Windows 8.1';
    if (/Windows NT 6\.2/.test(userAgent)) return 'Windows 8';
    if (/Windows NT 6\.1/.test(userAgent)) return 'Windows 7';
    // iOS user agents contain "like Mac OS X", so this check must run
    // before the macOS checks below.
    if (/iPhone|iPad|iPod/.test(userAgent)
        || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)) {
        return 'iOS';
    }
    const macVersionMatch = userAgent.match(/Mac OS X (10[._]\d+(?:[._]\d+)?)/);
    if (macVersionMatch) {
        const macVersion = macVersionMatch[1].replace(/_/g, '.');
        // Browsers freeze the reported version at 10.15(.7) on macOS 11 and
        // later, so that value only means "10.15 or newer".
        if (/^10\.15(?:\.\d+)?$/.test(macVersion)) {
            return 'macOS 10.15 or later';
        }
        return `macOS ${macVersion}`;
    }
    if (/Mac OS X/.test(userAgent)) return 'macOS';
    if (/Android/.test(userAgent)) return 'Android';
    if (/CrOS/.test(userAgent)) return 'Chrome OS';
    if (/Linux/.test(userAgent)) return 'Linux';
    return 'Unknown';
}

function getDeviceType(userAgent = navigator.userAgent) {
    const isTablet = /iPad|Tablet/i.test(userAgent)
        || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))
        || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
    if (isTablet) return 'Tablet';

    const isMobile = navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(userAgent);
    if (isMobile) return 'Mobile';
    return 'Desktop';
}

function formatMemory(memory) {
    if (typeof memory !== 'number' || Number.isNaN(memory)) {
        return 'Unavailable';
    }
    if (memory < 1) {
        return `${Math.round(memory * 1024)} MB`;
    }
    return `${memory} GB`;
}

function getPreferredLanguages() {
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        const [primary, ...rest] = navigator.languages;
        return rest.length > 0 ? `${primary} (Preferred: ${navigator.languages.join(', ')})` : primary;
    }
    return navigator.language || 'Unavailable';
}

function updateDeviceDetails() {
    if (!deviceInfoElements.browserName) {
        return;
    }

    const { name, version } = detectBrowser();
    const operatingSystem = detectOS();
    const deviceType = getDeviceType();
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Unavailable';
    const hardware = typeof navigator.hardwareConcurrency === 'number'
        ? `${navigator.hardwareConcurrency} logical cores`
        : 'Unavailable';
    const memory = formatMemory(navigator.deviceMemory);
    const languages = getPreferredLanguages();
    const pixelRatio = window.devicePixelRatio ? window.devicePixelRatio.toFixed(2) : '1';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable';
    const viewport = `${window.innerWidth} x ${window.innerHeight}`;
    const screenResolution = `${window.screen.width} x ${window.screen.height}`;

    deviceInfoElements.browserName.textContent = name;
    deviceInfoElements.browserVersion.textContent = version !== 'Unknown'
        ? `Version: ${version}`
        : 'Version: Unavailable';
    deviceInfoElements.osName.textContent = operatingSystem;
    deviceInfoElements.deviceType.textContent = `Device: ${deviceType}`;
    deviceInfoElements.platformInfo.textContent = platform;
    deviceInfoElements.hardwareConcurrency.textContent = hardware !== 'Unavailable'
        ? `CPU: ${hardware}`
        : 'CPU: Unavailable';
    deviceInfoElements.deviceMemory.textContent = memory;
    deviceInfoElements.language.textContent = `Language: ${languages}`;
    deviceInfoElements.deviceScreenResolution.textContent = `${screenResolution} (CSS pixels)`;
    deviceInfoElements.pixelRatio.textContent = `Pixel Ratio: ${pixelRatio}`;
    deviceInfoElements.viewportSize.textContent = viewport;
    deviceInfoElements.timeZone.textContent = `Time Zone: ${timeZone}`;
    deviceInfoElements.userAgent.textContent = navigator.userAgent;
}

function buildDeviceSummary() {
    const { name, version } = detectBrowser();
    const operatingSystem = detectOS();
    const deviceType = getDeviceType();
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Unavailable';
    const hardware = typeof navigator.hardwareConcurrency === 'number'
        ? `${navigator.hardwareConcurrency} logical cores`
        : 'Unavailable';
    const memory = formatMemory(navigator.deviceMemory);
    const languages = getPreferredLanguages();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable';
    const screenResolution = `${window.screen.width} x ${window.screen.height}`;
    const viewport = `${window.innerWidth} x ${window.innerHeight}`;
    const pixelRatio = window.devicePixelRatio ? window.devicePixelRatio.toFixed(2) : '1';
    const vendor = navigator.vendor || 'Unavailable';
    const cookieStatus = typeof navigator.cookieEnabled === 'boolean'
        ? (navigator.cookieEnabled ? 'Yes' : 'No')
        : 'Unavailable';
    const brandVersions = navigator.userAgentData?.brands
        ?.map(brand => `${brand.brand} ${brand.version}`)
        .join(', ');

    const summaryLines = [
        `Browser: ${name}`,
        `Browser Version: ${version}`,
        `Vendor: ${vendor}`,
        `Operating System: ${operatingSystem}`,
        `Device Type: ${deviceType}`,
        `Platform: ${platform}`,
        `Hardware Concurrency: ${hardware}`,
        `Memory: ${memory}`,
        `Languages: ${languages}`,
        `Time Zone: ${timeZone}`,
        `Screen Resolution: ${screenResolution}`,
        `Viewport Size: ${viewport}`,
        `Device Pixel Ratio: ${pixelRatio}`,
        `Cookies Enabled: ${cookieStatus}`,
        `User Agent: ${navigator.userAgent}`
    ];

    if (brandVersions) {
        summaryLines.splice(3, 0, `Brand Versions: ${brandVersions}`);
    }

    return summaryLines.join('\n');
}

// Function to update window size
function updateWindowSize() {
    // Get window dimensions
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Update window size display
    windowWidthElement.textContent = `${width}px`;
    windowHeightElement.textContent = `${height}px`;

    // Get screen resolution
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    screenResolutionElement.textContent = `${screenWidth} x ${screenHeight}`;

    // Get real display resolution (accounting for device pixel ratio)
    const realWidth = Math.round(screenWidth * window.devicePixelRatio);
    const realHeight = Math.round(screenHeight * window.devicePixelRatio);
    realResolutionElement.textContent = `${realWidth} x ${realHeight}`;

    // Get available screen space
    const availWidth = window.screen.availWidth;
    const availHeight = window.screen.availHeight;
    availableSpaceElement.textContent = `${availWidth} x ${availHeight}`;

    // Update display scale
    const scale = getDisplayScale();
    displayScaleElement.textContent = `${scale}%`;

    // Add highlight effect to display scale when it changes
    if (displayScaleElement.dataset.lastScale !== scale.toString()) {
        displayScaleElement.parentElement.classList.add('highlight');
        setTimeout(() => {
            displayScaleElement.parentElement.classList.remove('highlight');
        }, 300);
        displayScaleElement.dataset.lastScale = scale.toString();
    }

    updateDeviceDetails();
}

// Character Counter Tool
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const charNoSpaceCount = document.getElementById('charNoSpaceCount');
const wordCount = document.getElementById('wordCount');
const lineCount = document.getElementById('lineCount');
const visualLineCount = document.getElementById('visualLineCount');
const paragraphCount = document.getElementById('paragraphCount');

/**
 * Counts the total number of lines in a textarea based on character width
 * @param {HTMLTextAreaElement} textarea - The textarea element to count lines for
 * @returns {number} The total number of lines
 */
function countLinesByChars(textarea) {
    const value = textarea.value;
    if (!value) return 0;

    // 1. Получаем стили и размеры
    const styles = window.getComputedStyle(textarea);
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    // clientWidth already excludes the borders and the vertical scrollbar,
    // so only the padding has to be subtracted.
    const availableWidth = textarea.clientWidth - padding;

    // 2. Создаём временный элемент для измерения средней ширины символа
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.fontFamily = styles.fontFamily;
    tempSpan.style.fontSize = styles.fontSize;
    tempSpan.style.whiteSpace = 'pre';
    const sample = 'abcdefghijklmnopqrstuvwxyz 0123456789';
    tempSpan.textContent = sample;
    document.body.appendChild(tempSpan);
    const charWidth = tempSpan.getBoundingClientRect().width / sample.length;
    document.body.removeChild(tempSpan);

    if (charWidth === 0) return 1; // Защита от деления на 0

    // 3. Рассчитываем символы в строке
    const charsPerLine = Math.floor(availableWidth / charWidth);
    if (charsPerLine <= 0) return 1;

    // 4. Считаем строки: каждая логическая строка занимает минимум одну
    // визуальную, длинные строки переносятся независимо друг от друга
    return value.split('\n').reduce((total, line) => {
        return total + Math.max(1, Math.ceil(line.length / charsPerLine));
    }, 0);
}

// A word is a run of letters/digits (combining marks included, so accented
// and Devanagari text is not split). Apostrophes and hyphens that join two
// such runs ("don't", "it’s", "well-known") keep the word whole — the same
// rule Word and Google Docs use. Spaced dashes, other punctuation and all
// Unicode spaces are separators.
const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:['’‐‑-][\p{L}\p{N}\p{M}]+)*/gu;

function countWords(text) {
    const matches = text.match(WORD_PATTERN);
    return matches ? matches.length : 0;
}

// Count user-perceived characters: an emoji such as 👍🏽 or 👨‍👩‍👧 is one
// character, not 2–8 UTF-16 code units as String#length reports.
const graphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function countCharacters(text) {
    if (graphemeSegmenter) {
        let count = 0;
        for (const _ of graphemeSegmenter.segment(text)) count += 1;
        return count;
    }
    return Array.from(text).length;
}

function updateCharacterCount() {
    const text = textInput.value;

    // Update character count (with spaces)
    charCount.textContent = countCharacters(text);

    // Update character count (without spaces)
    charNoSpaceCount.textContent = countCharacters(text.replace(/\s/g, ''));

    wordCount.textContent = countWords(text);

    // Update line breaks count
    const lines = text.split(/\r\n|\r|\n/);
    lineCount.textContent = text.trim() === '' ? 0 : lines.length;

    // Update visual lines count
    visualLineCount.textContent = text.trim() === '' ? 0 : countLinesByChars(textInput);

    // Update paragraph count
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    paragraphCount.textContent = text.trim() === '' ? 0 : paragraphs.length;
}

// Case Converter Tool
const caseInput = document.getElementById('caseInput');
const convertButtons = document.querySelectorAll('.convert-btn');
const copyButton = document.getElementById('copyButton');
const clearButton = document.getElementById('clearButton');

// Case conversion functions
const caseConverters = {
    upper: (text) => text.toLocaleUpperCase(),
    lower: (text) => text.toLocaleLowerCase(),
    title: (text) => {
        // Apostrophes do not start a new word: "don't" -> "Don't", not "Don'T".
        return text.toLocaleLowerCase().replace(
            /(^|[^\p{L}\p{N}\p{M}'’])(\p{L})/gu,
            (_, prefix, letter) => prefix + letter.toLocaleUpperCase()
        );
    },
    sentence: (text) => {
        // A sentence starts at the beginning of the text or after . ! ? …
        // (optionally followed by closing quotes/brackets) plus whitespace;
        // leading whitespace and opening quotes/brackets are skipped.
        return text.toLocaleLowerCase().replace(
            /(^[\s"'“‘«(\[]*|[.!?…]["'”’»)\]]*\s+["'“‘«(\[]*)(\p{L})/gu,
            (_, prefix, letter) => prefix + letter.toLocaleUpperCase()
        );
    },
    // Words are split on anything that is not a letter, digit or combining
    // mark, then joined without separators. Words that start with a digit
    // ("2nd") are kept as-is but still joined, so no spaces are left behind.
    camel: (text) => {
        return splitIntoWords(text)
            .map((word, index) => (index === 0 ? word : capitalizeFirst(word)))
            .join('');
    },
    pascal: (text) => {
        return splitIntoWords(text).map(capitalizeFirst).join('');
    }
};

function splitIntoWords(text) {
    return text.toLocaleLowerCase()
        .split(/[^\p{L}\p{N}\p{M}]+/u)
        .filter(word => word.length > 0);
}

function capitalizeFirst(word) {
    const [first = '', ...rest] = Array.from(word);
    return first.toLocaleUpperCase() + rest.join('');
}

// Handle case conversion
convertButtons.forEach(button => {
    button.addEventListener('click', () => {
        const caseType = button.dataset.case;
        const text = caseInput.value;

        if (text.trim() !== '') {
            caseInput.value = caseConverters[caseType](text);

            // Update active state
            convertButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show success feedback
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = '';
            }, 100);
        }
    });
});

// Copy to clipboard functionality
copyButton.addEventListener('click', async () => {
    await copyToClipboard(caseInput.value, copyButton);
});

// Clear text functionality
clearButton.addEventListener('click', () => {
    caseInput.value = '';
    convertButtons.forEach(btn => btn.classList.remove('active'));
});

// Event Listeners
textInput.addEventListener('input', updateCharacterCount);

// Initialize
updateWindowSize();
updateCharacterCount();

// Add animation class to size boxes when values change
let previousWidth = window.innerWidth;
let previousHeight = window.innerHeight;

// Single resize event listener for all size-related updates
window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    const currentHeight = window.innerHeight;

    if (currentWidth !== previousWidth) {
        windowWidthElement.parentElement.classList.add('highlight');
        setTimeout(() => {
            windowWidthElement.parentElement.classList.remove('highlight');
        }, 300);
        previousWidth = currentWidth;
    }

    if (currentHeight !== previousHeight) {
        windowHeightElement.parentElement.classList.add('highlight');
        setTimeout(() => {
            windowHeightElement.parentElement.classList.remove('highlight');
        }, 300);
        previousHeight = currentHeight;
    }

    updateWindowSize();
});

// Clean Text Tool
const cleanTextArea = document.getElementById('cleanTextArea');
const lineNumbers = document.getElementById('lineNumbers');
const copyCleanText = document.getElementById('copyCleanText');
const clearCleanText = document.getElementById('clearCleanText');
const wrapTextButton = document.getElementById('wrapText');

// Initialize text wrapping state
let isWrapped = false;

function updateEditorSize() {
    // Reset height to auto to get the correct scrollHeight
    cleanTextArea.style.height = 'auto';

    // Set the height to match the content. In no-wrap mode long lines get a
    // horizontal scrollbar; add its height so it never covers the last line.
    const scrollbarHeight = Math.max(0, (cleanTextArea.offsetHeight || 0) - (cleanTextArea.clientHeight || 0));
    const newHeight = Math.max(cleanTextArea.scrollHeight + scrollbarHeight, 300); // Minimum height of 300px
    cleanTextArea.style.height = newHeight + 'px';

    // Update line numbers container height
    lineNumbers.style.height = newHeight + 'px';

    // Update line numbers
    updateLineNumbers();
}

function updateLineNumbers() {
    const text = cleanTextArea.value;
    const lines = text.split('\n');

    if (isWrapped) {
        // Mirror the textarea's content box and wrapping rules, then measure
        // how many visual rows each logical line takes.
        const styles = getComputedStyle(cleanTextArea);
        const lineHeight = parseFloat(styles.lineHeight) || 24;
        const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
        const contentWidth = Math.max(1, cleanTextArea.clientWidth - padding);

        const measureDiv = document.createElement('div');
        measureDiv.style.visibility = 'hidden';
        measureDiv.style.position = 'absolute';
        measureDiv.style.left = '-9999px';
        measureDiv.style.top = '0';
        measureDiv.style.width = contentWidth + 'px';
        measureDiv.style.whiteSpace = 'pre-wrap';
        measureDiv.style.overflowWrap = 'break-word';
        measureDiv.style.wordBreak = styles.wordBreak || 'normal';
        measureDiv.style.font = styles.font;
        measureDiv.style.letterSpacing = styles.letterSpacing || 'normal';
        measureDiv.style.tabSize = styles.tabSize || '4';
        measureDiv.style.lineHeight = lineHeight + 'px';
        document.body.appendChild(measureDiv);

        const rows = [];
        lines.forEach((line, index) => {
            measureDiv.textContent = line || ' ';
            const wrappedLines = Math.max(1, Math.round((measureDiv.offsetHeight || lineHeight) / lineHeight));

            // Number the first visual row, leave the wrapped continuation rows blank
            rows.push(String(index + 1));
            for (let i = 1; i < wrappedLines; i++) {
                rows.push('');
            }
        });

        document.body.removeChild(measureDiv);
        lineNumbers.textContent = rows.join('\n');
    } else {
        // For non-wrapped text, number all lines including empty ones
        const numberedLines = lines.map((_, index) => (index + 1)).join('\n');
        lineNumbers.textContent = numberedLines;
    }
}

// Insert text at the caret through the browser's editing pipeline so the
// change lands in the undo history (Ctrl/Cmd+Z) and fires 'input'.
function insertTextAtCursor(textarea, text) {
    textarea.focus();
    let inserted = false;
    try {
        inserted = typeof document.execCommand === 'function'
            && document.execCommand('insertText', false, text);
    } catch (_) {
        inserted = false;
    }
    if (!inserted) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        handleInput();
    }
}

// Plain Tab inserts four spaces. Shift+Tab and modified Tab keep their
// default behaviour, so keyboard users can always move focus out of the
// editor (no keyboard trap).
function handleTab(e) {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    insertTextAtCursor(cleanTextArea, '    ');
}

// Sync scroll between textarea and line numbers
function syncScroll() {
    lineNumbers.scrollTop = cleanTextArea.scrollTop;
}

cleanTextArea.addEventListener('scroll', syncScroll);

function handleInput() {
    updateEditorSize();
    syncScroll();
}

function handleResize() {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        handleInput();
    }, 100);
}

// A textarea already pastes plain text, so no custom paste handling is
// needed: intercepting it only broke undo. 'input' covers typing, pasting,
// cutting, dropping and undo/redo.
cleanTextArea.addEventListener('input', handleInput);
cleanTextArea.addEventListener('keydown', handleTab);
window.addEventListener('resize', handleResize);

// Temporarily replace a button label with feedback. The original label is
// remembered once, so a second click during the feedback period cannot make
// "Copied!" the permanent label.
function flashButtonLabel(button, message, duration = 1500) {
    if (button.dataset.originalLabel === undefined) {
        button.dataset.originalLabel = button.textContent.trim();
    }
    clearTimeout(button._labelTimer);
    button.textContent = message;
    button._labelTimer = setTimeout(() => {
        button.textContent = button.dataset.originalLabel;
    }, duration);
}

// Copy to clipboard functionality with error handling
async function copyToClipboard(text, button) {
    if (text.trim() === '') return;

    try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            throw new Error('Clipboard API is unavailable');
        }
        await navigator.clipboard.writeText(text);
        flashButtonLabel(button, 'Copied!');
    } catch (err) {
        console.error('Failed to copy text:', err);
        flashButtonLabel(button, 'Failed to copy');
    }
}

// Copy clean text
copyCleanText.addEventListener('click', async () => {
    const text = cleanTextArea.value;
    await copyToClipboard(text, copyCleanText);
});

if (copyDeviceDetailsButton) {
    copyDeviceDetailsButton.addEventListener('click', async () => {
        const summary = buildDeviceSummary();
        await copyToClipboard(summary, copyDeviceDetailsButton);
    });
}

// Toggle text wrapping
wrapTextButton.addEventListener('click', () => {
    isWrapped = !isWrapped;
    cleanTextArea.classList.toggle('wrapped', isWrapped);
    wrapTextButton.textContent = isWrapped ? 'Disable Word Wrap' : 'Toggle Word Wrap';
    handleInput();
});

// Initialize editor
function initializeEditor() {
    // Add initial empty line number
    lineNumbers.textContent = '1\n';
    updateEditorSize();
}

// Initialize editor
initializeEditor();

// Clear text
clearCleanText.addEventListener('click', () => {
    cleanTextArea.value = '';
    initializeEditor();
});
