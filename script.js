// Theme Switcher
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

// Initialize theme
initializeTheme();

// Add theme switcher event listener
document.getElementById('theme-switcher').addEventListener('click', toggleTheme);

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

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and panels
        tabButtons.forEach(btn => btn.classList.remove('active'));
        toolPanels.forEach(panel => panel.classList.remove('active'));
        
        // Add active class to clicked button and corresponding panel
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
    });
});

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

    if (/Edg\//.test(userAgent)) {
        name = 'Microsoft Edge';
        version = userAgent.match(/Edg\/([\d.]+)/)[1];
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
    if (/Mac OS X (10[._]\d+[._]?\d*)/.test(userAgent)) {
        return `macOS ${userAgent.match(/Mac OS X (10[._]\d+[._]?\d*)/)[1].replace(/_/g, '.')}`;
    }
    if (/Mac OS X/.test(userAgent)) return 'macOS';
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
    if (/Android/.test(userAgent)) return 'Android';
    if (/CrOS/.test(userAgent)) return 'Chrome OS';
    if (/Linux/.test(userAgent)) return 'Linux';
    return 'Unknown';
}

function getDeviceType(userAgent = navigator.userAgent) {
    const isMobile = navigator.userAgentData?.mobile ?? /Mobi|Android/i.test(userAgent);
    if (isMobile) return 'Mobile';
    if (/Tablet|iPad/i.test(userAgent)) return 'Tablet';
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
    const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const scrollbarWidth = textarea.offsetWidth - textarea.clientWidth;
    const availableWidth = textarea.clientWidth - padding - scrollbarWidth;

    // 2. Создаём временный элемент для измерения ширины символа
    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.fontFamily = styles.fontFamily;
    tempSpan.style.fontSize = styles.fontSize;
    tempSpan.style.whiteSpace = 'pre';
    tempSpan.textContent = 'a'; // Измеряем по строчной букве
    document.body.appendChild(tempSpan);
    const charWidth = tempSpan.getBoundingClientRect().width;
    document.body.removeChild(tempSpan);

    if (charWidth === 0) return 1; // Защита от деления на 0

    // 3. Рассчитываем символы в строке
    const charsPerLine = Math.floor(availableWidth / charWidth);
    if (charsPerLine <= 0) return 1;

    // 4. Считаем строки
    const explicitBreaks = (value.match(/\n/g) || []).length; // Явные переносы
    const implicitBreaks = Math.floor(value.length / charsPerLine); // Автоматические переносы
    const totalLines = 1 + explicitBreaks + implicitBreaks;

    return totalLines;
}

function updateCharacterCount() {
    const text = textInput.value;
    
    // Update character count (with spaces)
    charCount.textContent = text.length;
    
    // Update character count (without spaces)
    charNoSpaceCount.textContent = text.replace(/\s/g, '').length;
    
    // Update word count - excluding en space and em space
    const words = text.trim()
        .replace(/[\u2002\u2003\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Replace en space (\u2002), em space (\u2003), and other Unicode spaces with regular space
        .replace(/[—–]/g, ' ') // Replace em dash and en dash with space
        .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Replace all non-letter and non-number characters with space
        .split(/\s+/)
        .filter(word => word.length > 0);
    wordCount.textContent = text.trim() === '' ? 0 : words.length;
    
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
        return text.toLocaleLowerCase().replace(/(?:^|\s)\p{L}/gu, match => match.toLocaleUpperCase());
    },
    sentence: (text) => {
        return text.toLocaleLowerCase().replace(/(^\p{L}|\.\s+\p{L})/gu, match => match.toLocaleUpperCase());
    },
    camel: (text) => {
        return text.toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .replace(/\s+(\p{L})/gu, (_, char) => char.toLocaleUpperCase())
            .replace(/^\p{L}/u, char => char.toLocaleLowerCase());
    },
    pascal: (text) => {
        return text.toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .replace(/(^\p{L}|\s+\p{L})/gu, match => match.trim().toLocaleUpperCase());
    }
};

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
    const text = caseInput.value;
    if (text.trim() !== '') {
        try {
            await navigator.clipboard.writeText(text);
            
            // Show success feedback
            const originalText = copyButton.textContent;
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = originalText;
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    }
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
    
    // Set the height to match the content
    const newHeight = Math.max(cleanTextArea.scrollHeight, 300); // Minimum height of 300px
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
        // For wrapped text, we need to match the visual lines with logical lines
        const lineHeight = parseInt(getComputedStyle(cleanTextArea).lineHeight);
        
        // Create a temporary div to measure text width
        const measureDiv = document.createElement('div');
        measureDiv.style.visibility = 'hidden';
        measureDiv.style.position = 'absolute';
        measureDiv.style.whiteSpace = 'pre';
        measureDiv.style.font = getComputedStyle(cleanTextArea).font;
        measureDiv.style.lineHeight = getComputedStyle(cleanTextArea).lineHeight;
        document.body.appendChild(measureDiv);
        
        const lineWidth = cleanTextArea.clientWidth - 40; // Account for padding
        
        // Generate line numbers based on actual text content
        let lineNumbersHTML = '';
        
        lines.forEach((line, index) => {
            measureDiv.textContent = line;
            const lineLength = measureDiv.offsetWidth;
            const wrappedLines = Math.ceil(lineLength / lineWidth) || 1;
            
            // Add the line number for the first wrapped line
            lineNumbersHTML += (index + 1) + '\n';
            
            // Add empty lines for the rest of the wrapped lines
            for (let i = 1; i < wrappedLines; i++) {
                lineNumbersHTML += '\n';
            }
        });
        
        document.body.removeChild(measureDiv);
        lineNumbers.textContent = lineNumbersHTML;
    } else {
        // For non-wrapped text, number all lines including empty ones
        const numberedLines = lines.map((_, index) => (index + 1)).join('\n');
        lineNumbers.textContent = numberedLines;
    }
}

function handleCleanTextPaste(e) {
    // Prevent the default paste
    e.preventDefault();
    
    // Get clipboard data as plain text
    const text = e.clipboardData.getData('text/plain');
    
    // Insert text at cursor position
    const startPos = cleanTextArea.selectionStart;
    const endPos = cleanTextArea.selectionEnd;
    const textBefore = cleanTextArea.value.substring(0, startPos);
    const textAfter = cleanTextArea.value.substring(endPos);
    
    cleanTextArea.value = textBefore + text + textAfter;
    
    // Update cursor position
    cleanTextArea.selectionStart = startPos + text.length;
    cleanTextArea.selectionEnd = startPos + text.length;
    
    // Update line numbers
    updateLineNumbers();
}

function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        
        // Insert tab at cursor position
        const startPos = cleanTextArea.selectionStart;
        const endPos = cleanTextArea.selectionEnd;
        const textBefore = cleanTextArea.value.substring(0, startPos);
        const textAfter = cleanTextArea.value.substring(endPos);
        
        cleanTextArea.value = textBefore + '    ' + textAfter;
        
        // Update cursor position
        cleanTextArea.selectionStart = startPos + 4;
        cleanTextArea.selectionEnd = startPos + 4;
    }
}

// Sync scroll between textarea and line numbers
function syncScroll() {
    lineNumbers.scrollTop = cleanTextArea.scrollTop;
    lineNumbers.scrollLeft = cleanTextArea.scrollLeft;
}

cleanTextArea.addEventListener('scroll', syncScroll);

function handleInput() {
    updateEditorSize();
    syncScroll();
}

function handlePaste(e) {
    handleCleanTextPaste(e);
    handleInput();
}

function handleKeydown(e) {
    handleTab(e);
    handleInput();
}

function handleResize() {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        handleInput();
    }, 100);
}

cleanTextArea.addEventListener('input', handleInput);
cleanTextArea.addEventListener('paste', handlePaste);
cleanTextArea.addEventListener('keydown', handleKeydown);
window.addEventListener('resize', handleResize);

// Copy to clipboard functionality with error handling
async function copyToClipboard(text, button) {
    if (text.trim() === '') return;

    const originalText = button.textContent;

    try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text:', err);
        button.textContent = 'Failed to copy';
        setTimeout(() => {
            button.textContent = originalText;
        }, 1500);
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
    cleanTextArea.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
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
