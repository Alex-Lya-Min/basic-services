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
}

// Character Counter Tool
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const charNoSpaceCount = document.getElementById('charNoSpaceCount');
const wordCount = document.getElementById('wordCount');
const lineCount = document.getElementById('lineCount');

function updateCharacterCount() {
    const text = textInput.value;
    
    // Update character count (with spaces)
    charCount.textContent = text.length;
    
    // Update character count (without spaces)
    charNoSpaceCount.textContent = text.replace(/\s/g, '').length;
    
    // Update word count
    const words = text.trim().split(/\s+/);
    wordCount.textContent = text.trim() === '' ? 0 : words.length;
    
    // Update line count
    const lines = text.split(/\r\n|\r|\n/);
    lineCount.textContent = text.trim() === '' ? 0 : lines.length;
}

// Case Converter Tool
const caseInput = document.getElementById('caseInput');
const convertButtons = document.querySelectorAll('.convert-btn');
const copyButton = document.getElementById('copyButton');
const clearButton = document.getElementById('clearButton');

// Case conversion functions
const caseConverters = {
    upper: (text) => text.toUpperCase(),
    lower: (text) => text.toLowerCase(),
    title: (text) => {
        return text.toLowerCase().replace(/(?:^|\s)\w/g, match => match.toUpperCase());
    },
    sentence: (text) => {
        return text.toLowerCase().replace(/(^\w|\.\s+\w)/g, match => match.toUpperCase());
    },
    camel: (text) => {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+(.)/g, (_, char) => char.toUpperCase())
            .replace(/^[A-Z]/, char => char.toLowerCase());
    },
    pascal: (text) => {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/(^\w|\s+\w)/g, match => match.trim().toUpperCase());
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
window.addEventListener('resize', updateWindowSize);
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

// Update line numbers when text changes, editor is resized, or window is resized
cleanTextArea.addEventListener('input', () => {
    updateLineNumbers();
    syncScroll();
});

cleanTextArea.addEventListener('paste', (e) => {
    handleCleanTextPaste(e);
    syncScroll();
});

cleanTextArea.addEventListener('keydown', (e) => {
    handleTab(e);
    syncScroll();
});

window.addEventListener('resize', () => {
    // Debounce resize updates
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        updateLineNumbers();
        syncScroll();
    }, 100);
});

// Initialize line numbers
function initializeLineNumbers() {
    // Add initial empty line number
    lineNumbers.textContent = '1\n';
    lineNumbers.style.height = cleanTextArea.scrollHeight + 'px';
    syncScroll();
}

// Initialize line numbers
initializeLineNumbers();

// Clear text
clearCleanText.addEventListener('click', () => {
    cleanTextArea.value = '';
    initializeLineNumbers();
});

// Copy to clipboard functionality with error handling
async function copyToClipboard(text, button) {
    if (text.trim() === '') return;
    
    try {
        await navigator.clipboard.writeText(text);
        const originalText = button.textContent;
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

// Toggle text wrapping
wrapTextButton.addEventListener('click', () => {
    isWrapped = !isWrapped;
    cleanTextArea.style.whiteSpace = isWrapped ? 'pre-wrap' : 'pre';
    wrapTextButton.textContent = isWrapped ? 'Disable Word Wrap' : 'Toggle Word Wrap';
    updateEditorSize();
});

// Update editor size when text changes
cleanTextArea.addEventListener('input', updateEditorSize);

// Update editor size when text is pasted
cleanTextArea.addEventListener('paste', (e) => {
    handleCleanTextPaste(e);
    updateEditorSize();
});

// Update editor size when tab is pressed
cleanTextArea.addEventListener('keydown', (e) => {
    handleTab(e);
    updateEditorSize();
});

// Update editor size when window is resized
window.addEventListener('resize', () => {
    // Debounce resize updates
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(updateEditorSize, 100);
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