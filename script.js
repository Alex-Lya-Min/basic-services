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
});

// Clean Text Tool
const cleanTextArea = document.getElementById('cleanTextArea');
const lineNumbers = document.getElementById('lineNumbers');
const copyCleanText = document.getElementById('copyCleanText');
const clearCleanText = document.getElementById('clearCleanText');

function updateLineNumbers() {
    const lines = cleanTextArea.value.split('\n');
    const numberedLines = lines.map((line, index) => {
        // Only show line number if the line contains non-whitespace characters
        return line.trim() ? (index + 1) : '';
    }).join('\n');
    lineNumbers.textContent = numberedLines;
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
cleanTextArea.addEventListener('scroll', () => {
    lineNumbers.scrollTop = cleanTextArea.scrollTop;
});

// Update line numbers when text changes
cleanTextArea.addEventListener('input', updateLineNumbers);
cleanTextArea.addEventListener('paste', handleCleanTextPaste);
cleanTextArea.addEventListener('keydown', handleTab);

// Copy clean text
copyCleanText.addEventListener('click', async () => {
    const text = cleanTextArea.value;
    if (text.trim() !== '') {
        try {
            await navigator.clipboard.writeText(text);
            
            // Show success feedback
            const originalText = copyCleanText.textContent;
            copyCleanText.textContent = 'Copied!';
            setTimeout(() => {
                copyCleanText.textContent = originalText;
            }, 1500);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    }
});

// Clear text
clearCleanText.addEventListener('click', () => {
    cleanTextArea.value = '';
    updateLineNumbers();
});

// Initialize line numbers
updateLineNumbers(); 