// LYMN Tools — web tools on the home page: Display resolution, Text and
// Device details are tabs of this page. Theme handling lives in theme.js.

const SITE_NAME = 'LYMN Tools';

// --- Tabs ---------------------------------------------------------------------

const tabButtons = document.querySelectorAll('.tab-button');
const toolPanels = document.querySelectorAll('.tool-panel');

const DEFAULT_TAB = 'display-tool';

// Word Counter, Case Converter and Clean Text are now one "Text" tool: old
// links keep working.
const TAB_ALIASES = {
    'counter-tool': 'text-tool',
    'case-tool': 'text-tool',
    'clean-text': 'text-tool'
};

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Links to other pages (compressors, Time Frame) navigate normally.
        if (!button.dataset.tab) return;
        selectTab(button.dataset.tab);
    });
});

// Switch to a tool and record it in the history, so Back returns to the
// previous tool. Re-selecting the open tool adds no entry: otherwise Back
// would appear to do nothing.
function selectTab(tabId) {
    const activeTab = Array.from(tabButtons).find(btn => btn.dataset.tab && btn.classList.contains('active'));
    if (activeTab && activeTab.dataset.tab === tabId) return;

    switchTab(tabId);
    // Update URL hash without scrolling
    history.pushState(null, null, `#${tabId}`);
}

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
    selectTab(nextTab.dataset.tab);
    if (typeof nextTab.focus === 'function') nextTab.focus();
}

tabButtons.forEach(button => {
    if (button.dataset.tab) {
        button.addEventListener('keydown', handleTabKeydown);
    }
});

function switchTab(tabId) {
    let activeName = '';
    tabButtons.forEach(btn => {
        // Links to standalone tools are not tabs: leave their state alone.
        if (!btn.dataset.tab) return;
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
        if (isActive) activeName = btn.textContent.replace(/\s+/g, ' ').trim();
    });

    toolPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId + '-panel');
    });

    // The tab title names the open tool, like the other pages do.
    if (activeName) document.title = `${activeName} · ${SITE_NAME}`;

    if (tabId === 'text-tool') refreshEditor();

    if (typeof window.revealActiveService === 'function') {
        window.revealActiveService();
    }
}

// Handle hash change for direct linking. An empty or unknown hash (e.g. after
// pressing Back to the initial URL) restores the default tool instead of
// leaving the previously selected one on screen.
function handleHashNavigation() {
    let hash = window.location.hash.slice(1);
    if (TAB_ALIASES[hash]) {
        hash = TAB_ALIASES[hash];
        if (typeof history.replaceState === 'function') history.replaceState(null, null, `#${hash}`);
    }
    if (hash && document.getElementById(hash + '-panel')) {
        switchTab(hash);
    } else {
        switchTab(DEFAULT_TAB);
    }
}

// --- Display resolution ---------------------------------------------------------

const windowWidthElement = document.getElementById('windowWidth');
const windowHeightElement = document.getElementById('windowHeight');
const screenResolutionElement = document.getElementById('screenResolution');
const realResolutionElement = document.getElementById('realResolution');
const availableSpaceElement = document.getElementById('availableSpace');
const displayScaleElement = document.getElementById('displayScale');
const pixelRatioNoteElement = document.getElementById('pixelRatioNote');

function getDisplayScale() {
    const devicePixelRatio = window.devicePixelRatio;
    return Math.round(devicePixelRatio * 100 / 25) * 25;
}

// Remember the initial scale so the first render does not flash the
// "scale changed" highlight.
displayScaleElement.dataset.lastScale = String(getDisplayScale());

// Briefly tint the card that holds a changed value.
function flashCard(element) {
    const card = (typeof element.closest === 'function' && element.closest('.metric-card')) || element.parentElement;
    if (!card) return;
    card.classList.add('highlight');
    setTimeout(() => card.classList.remove('highlight'), 300);
}

function updateWindowSize() {
    windowWidthElement.textContent = String(window.innerWidth);
    windowHeightElement.textContent = String(window.innerHeight);

    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    screenResolutionElement.textContent = `${screenWidth} × ${screenHeight}`;

    // Real display resolution, accounting for the device pixel ratio
    const realWidth = Math.round(screenWidth * window.devicePixelRatio);
    const realHeight = Math.round(screenHeight * window.devicePixelRatio);
    realResolutionElement.textContent = `${realWidth} × ${realHeight}`;

    availableSpaceElement.textContent = `${window.screen.availWidth} × ${window.screen.availHeight}`;

    const scale = getDisplayScale();
    displayScaleElement.textContent = `${scale}%`;
    if (pixelRatioNoteElement) {
        pixelRatioNoteElement.textContent = `Device pixel ratio ${(window.devicePixelRatio || 1).toFixed(2)}`;
    }
    if (displayScaleElement.dataset.lastScale !== scale.toString()) {
        flashCard(displayScaleElement);
        displayScaleElement.dataset.lastScale = scale.toString();
    }

    updateDeviceDetails();
}

let previousWidth = window.innerWidth;
let previousHeight = window.innerHeight;

window.addEventListener('resize', () => {
    if (window.innerWidth !== previousWidth || window.innerHeight !== previousHeight) {
        flashCard(windowWidthElement);
        previousWidth = window.innerWidth;
        previousHeight = window.innerHeight;
    }
    updateWindowSize();
});

// --- Device details ---------------------------------------------------------------

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
    const platform = navigator.userAgentData?.platform || navigator.platform || 'Unavailable';
    const pixelRatio = window.devicePixelRatio ? window.devicePixelRatio.toFixed(2) : '1';
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable';

    deviceInfoElements.browserName.textContent = name;
    deviceInfoElements.browserVersion.textContent = version !== 'Unknown'
        ? `Version: ${version}`
        : 'Version: unavailable';
    deviceInfoElements.osName.textContent = detectOS();
    deviceInfoElements.deviceType.textContent = `Device: ${getDeviceType()}`;
    deviceInfoElements.platformInfo.textContent = platform;
    deviceInfoElements.hardwareConcurrency.textContent = typeof navigator.hardwareConcurrency === 'number'
        ? `CPU: ${navigator.hardwareConcurrency} logical cores`
        : 'CPU: unavailable';
    deviceInfoElements.deviceMemory.textContent = formatMemory(navigator.deviceMemory);
    deviceInfoElements.language.textContent = `Language: ${getPreferredLanguages()}`;
    deviceInfoElements.deviceScreenResolution.textContent = `${window.screen.width} × ${window.screen.height}`;
    deviceInfoElements.pixelRatio.textContent = `Pixel ratio: ${pixelRatio} · CSS pixels`;
    deviceInfoElements.viewportSize.textContent = `${window.innerWidth} × ${window.innerHeight}`;
    deviceInfoElements.timeZone.textContent = `Time zone: ${timeZone}`;
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


// --- Text: counter, case and clean up in one editor ---------------------------------

const textInput = document.getElementById('textInput');
const editorElement = document.getElementById('editor');
const lineNumbers = document.getElementById('lineNumbers');
const wrapToggle = document.getElementById('wrapToggle');
const lineNumbersToggle = document.getElementById('lineNumbersToggle');
const copyTextButton = document.getElementById('copyText');
const clearTextButton = document.getElementById('clearText');
const charCount = document.getElementById('charCount');
const charNoSpaceCount = document.getElementById('charNoSpaceCount');
const wordCount = document.getElementById('wordCount');
const lineCount = document.getElementById('lineCount');
const visualLineCount = document.getElementById('visualLineCount');
const paragraphCount = document.getElementById('paragraphCount');
const readingTime = document.getElementById('readingTime');
const convertButtons = document.querySelectorAll('.convert-btn');
const cleanButtons = document.querySelectorAll('.clean-btn');

let isWrapped = true;
let showLineNumbers = false;

const WORDS_PER_MINUTE = 230;

function formatReadingTime(words) {
    if (words === 0) return 'Reading time: —';
    const minutes = words / WORDS_PER_MINUTE;
    if (minutes < 1) return 'Reading time: under a minute';
    return `Reading time: about ${Math.round(minutes)} min`;
}

function updateCharacterCount() {
    const text = textInput.value;
    const isEmpty = text.trim() === '';
    const words = countWords(text);

    charCount.textContent = countCharacters(text);
    charNoSpaceCount.textContent = countCharacters(text.replace(/\s/g, ''));
    wordCount.textContent = words;
    lineCount.textContent = isEmpty ? 0 : text.split(/\r\n|\r|\n/).length;
    visualLineCount.textContent = isEmpty ? 0 : countLinesByChars(textInput);
    paragraphCount.textContent = isEmpty ? 0 : text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
    if (readingTime) readingTime.textContent = formatReadingTime(words);
}

// Line numbers next to the text. With wrapping on, a long line takes
// several rows: its number is shown on the first one only.
function updateLineNumbers() {
    if (!showLineNumbers) return;
    const lines = textInput.value.split('\n');

    if (!isWrapped) {
        lineNumbers.textContent = lines.map((_, index) => index + 1).join('\n');
        return;
    }

    const styles = getComputedStyle(textInput);
    const lineHeight = parseFloat(styles.lineHeight) || 24;
    const padding = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    // clientWidth excludes the vertical scrollbar, like the text box itself.
    const contentWidth = Math.max(1, textInput.clientWidth - padding);

    const measureDiv = document.createElement('div');
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.position = 'absolute';
    measureDiv.style.left = '-9999px';
    measureDiv.style.top = '0';
    measureDiv.style.width = contentWidth + 'px';
    measureDiv.style.whiteSpace = 'pre-wrap';
    measureDiv.style.overflowWrap = 'break-word';
    measureDiv.style.font = styles.font;
    measureDiv.style.letterSpacing = styles.letterSpacing || 'normal';
    measureDiv.style.tabSize = styles.tabSize || '4';
    measureDiv.style.lineHeight = lineHeight + 'px';
    document.body.appendChild(measureDiv);

    const rows = [];
    lines.forEach((line, index) => {
        measureDiv.textContent = line || ' ';
        const wrappedLines = Math.max(1, Math.round((measureDiv.offsetHeight || lineHeight) / lineHeight));
        rows.push(String(index + 1));
        for (let i = 1; i < wrappedLines; i++) rows.push('');
    });

    document.body.removeChild(measureDiv);
    lineNumbers.textContent = rows.join('\n');
}

function syncScroll() {
    lineNumbers.scrollTop = textInput.scrollTop;
}

function refreshEditor() {
    updateCharacterCount();
    updateLineNumbers();
    syncScroll();
}

// Replace (part of) the text through the browser's editing pipeline, so
// the change can be undone with Ctrl/Cmd+Z, and fire 'input'.
function replaceText(start, end, text) {
    textInput.focus();
    let replaced = false;
    try {
        textInput.selectionStart = start;
        textInput.selectionEnd = end;
        replaced = typeof document.execCommand === 'function'
            && document.execCommand('insertText', false, text);
    } catch (_) {
        replaced = false;
    }
    if (!replaced) {
        textInput.value = textInput.value.slice(0, start) + text + textInput.value.slice(end);
        textInput.selectionStart = textInput.selectionEnd = start + text.length;
        refreshEditor();
    }
}

// Plain Tab inserts four spaces. Shift+Tab and modified Tab keep their
// default behaviour, so keyboard users can always move focus out of the
// editor (no keyboard trap).
function handleTab(e) {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    replaceText(textInput.selectionStart, textInput.selectionEnd, '    ');
}

// Clean-up actions.
const textCleaners = {
    // Runs of spaces and tabs become one space; line ends are trimmed.
    spaces: (text) => text
        .split('\n')
        .map(line => line.replace(/[ \t ]+/g, ' ').trim())
        .join('\n'),
    // Lines that are empty or hold only whitespace are removed.
    'empty-lines': (text) => text
        .split('\n')
        .filter(line => line.trim() !== '')
        .join('\n'),
    // Lines inside a paragraph are joined with a space; paragraphs stay.
    join: (text) => text
        .split(/\n\s*\n/)
        .map(paragraph => paragraph.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
        .filter(Boolean)
        .join('\n\n')
};

// Applies to the selection, or to the whole text when nothing is selected.
function transformText(transform) {
    const value = textInput.value;
    if (value.trim() === '') return false;
    const hasSelection = textInput.selectionEnd > textInput.selectionStart;
    const start = hasSelection ? textInput.selectionStart : 0;
    const end = hasSelection ? textInput.selectionEnd : value.length;
    const result = transform(value.slice(start, end));
    if (result === value.slice(start, end)) return false;
    replaceText(start, end, result);
    if (hasSelection) {
        textInput.selectionStart = start;
        textInput.selectionEnd = start + result.length;
    }
    return true;
}

function setWrap(on) {
    isWrapped = on;
    editorElement.classList.toggle('no-wrap', !on);
    wrapToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    refreshEditor();
}

function setLineNumbers(on) {
    showLineNumbers = on;
    lineNumbers.hidden = !on;
    lineNumbersToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    refreshEditor();
}

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


// --- Copy feedback --------------------------------------------------------------------

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

async function copyToClipboard(text, button) {
    if (text.trim() === '') {
        flashButtonLabel(button, 'Nothing to copy');
        return;
    }

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

// --- Wire up ---------------------------------------------------------------------------

textInput.addEventListener('input', refreshEditor);
textInput.addEventListener('scroll', syncScroll);
textInput.addEventListener('keydown', handleTab);

wrapToggle.addEventListener('click', () => setWrap(!isWrapped));
lineNumbersToggle.addEventListener('click', () => setLineNumbers(!showLineNumbers));

convertButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (!transformText(caseConverters[button.dataset.case])) {
            flashButtonLabel(button, textInput.value.trim() ? 'No change' : 'Add text first', 1200);
        }
    });
});

cleanButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (!transformText(textCleaners[button.dataset.clean])) {
            flashButtonLabel(button, textInput.value.trim() ? 'Nothing to clean' : 'Add text first', 1200);
        }
    });
});

copyTextButton.addEventListener('click', async () => {
    await copyToClipboard(textInput.value, copyTextButton);
});

clearTextButton.addEventListener('click', () => {
    if (textInput.value === '') return;
    replaceText(0, textInput.value.length, '');
});

if (copyDeviceDetailsButton) {
    copyDeviceDetailsButton.addEventListener('click', async () => {
        await copyToClipboard(buildDeviceSummary(), copyDeviceDetailsButton);
    });
}

function handleResize() {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        // The text box width changed, so wrapped lines changed too.
        refreshEditor();
    }, 100);
}

window.addEventListener('resize', handleResize);

// --- Initialize -------------------------------------------------------------------

updateWindowSize();
updateCharacterCount();

// script.js runs at the end of <body>, so the panels already exist: select
// the tool right away instead of waiting for 'load' (fonts and other
// resources), which made the default tool flash first.
handleHashNavigation();
window.addEventListener('hashchange', handleHashNavigation);
window.addEventListener('popstate', handleHashNavigation);
