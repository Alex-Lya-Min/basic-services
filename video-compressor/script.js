import { createFFmpeg, fetchFile } from 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.6/+esm';

const videoInput = document.getElementById('videoInput');
const presetSelect = document.getElementById('presetSelect');
const prepareEngineBtn = document.getElementById('prepareEngineBtn');
const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusMessage = document.getElementById('statusMessage');
const spinner = document.getElementById('engineSpinner');
const progressFill = document.getElementById('progressFill');
const progressBar = document.querySelector('.progress-bar');
const progressText = document.getElementById('progressText');
const logList = document.getElementById('logList');
const clearLogBtn = document.getElementById('clearLogBtn');
const fileDetails = document.getElementById('fileDetails');
const resultSummary = document.getElementById('resultSummary');

let ffmpeg;
let outputUrl = '';
let lastInputSize = 0;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function setStatus(message) {
    statusMessage.textContent = message;
}

function toggleSpinner(show, message) {
    spinner.classList.toggle('active', show);
    if (message) {
        setStatus(message);
    }
}

function resetProgress() {
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
}

function updateProgress(ratio) {
    const percentage = Math.min(100, Math.round(ratio * 100));
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
    progressBar.setAttribute('aria-valuenow', String(percentage));
}

function addLog(message) {
    if (!message?.trim()) return;
    const item = document.createElement('li');
    item.textContent = message;
    logList.appendChild(item);
    while (logList.children.length > 8) {
        logList.removeChild(logList.firstChild);
    }
    logList.scrollTop = logList.scrollHeight;
}

function clearLog() {
    logList.innerHTML = '';
}

function revokeOutputUrl() {
    if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
        outputUrl = '';
    }
}

async function ensureFfmpeg() {
    if (!ffmpeg) {
        ffmpeg = createFFmpeg({ log: true });
        ffmpeg.setLogger(({ message }) => addLog(message));
        ffmpeg.setProgress(({ ratio }) => updateProgress(ratio));
    }

    if (!ffmpeg.isLoaded()) {
        toggleSpinner(true, 'Loading ffmpeg.wasm engine…');
        prepareEngineBtn.disabled = true;
        compressBtn.disabled = true;
        try {
            await ffmpeg.load();
            setStatus('Engine ready. Select a file and hit Compress.');
        } finally {
            toggleSpinner(false);
            prepareEngineBtn.disabled = false;
            compressBtn.disabled = false;
        }
    }

    return ffmpeg;
}

function describeFile(file) {
    if (!file) {
        fileDetails.textContent = 'No file selected.';
        return;
    }
    fileDetails.innerHTML = `${file.name} · ${formatBytes(file.size)}`;
    lastInputSize = file.size;
}

videoInput.addEventListener('change', (event) => {
    const [file] = event.target.files || [];
    describeFile(file);
});

prepareEngineBtn.addEventListener('click', () => {
    ensureFfmpeg().catch(error => {
        console.error(error);
        setStatus('Unable to load ffmpeg.wasm. Please retry or refresh.');
    });
});

clearLogBtn.addEventListener('click', clearLog);

downloadBtn.addEventListener('click', () => {
    if (!outputUrl) return;
    const link = document.createElement('a');
    link.href = outputUrl;
    link.download = resultSummary.dataset.filename || 'compressed-video';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

async function compress() {
    const file = videoInput.files[0];
    if (!file) {
        setStatus('Please choose an MP4 file first.');
        return;
    }

    if (file.type !== 'video/mp4') {
        setStatus('Only MP4 inputs are supported at the moment.');
        return;
    }

    const preset = presetSelect.value;
    const ffmpegInstance = await ensureFfmpeg();

    resetProgress();
    toggleSpinner(true, 'Compressing… keep this tab open.');
    prepareEngineBtn.disabled = true;
    compressBtn.disabled = true;
    downloadBtn.disabled = true;
    revokeOutputUrl();
    resultSummary.textContent = 'Running…';

    try {
        addLog(`Input: ${file.name}`);
        ffmpegInstance.FS('writeFile', 'input.mp4', await fetchFile(file));

        const mp4Args = ['-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '28', '-preset', 'veryfast', '-movflags', '+faststart', '-acodec', 'aac', '-b:a', '96k', 'output.mp4'];
        const webmArgs = ['-i', 'input.mp4', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '35', '-c:a', 'libopus', '-b:a', '96k', 'output.webm'];
        const args = preset === 'webm' ? webmArgs : mp4Args;
        const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';
        const mime = preset === 'webm' ? 'video/webm' : 'video/mp4';

        addLog(`Running preset: ${preset}`);
        await ffmpegInstance.run(...args);

        const data = ffmpegInstance.FS('readFile', outputName);
        const blob = new Blob([data.buffer], { type: mime });
        outputUrl = URL.createObjectURL(blob);
        downloadBtn.disabled = false;
        const humanReadable = formatBytes(data.length);
        resultSummary.textContent = `Done: ${formatBytes(lastInputSize)} → ${humanReadable}`;
        resultSummary.dataset.filename = `compressed-${preset}.${preset === 'webm' ? 'webm' : 'mp4'}`;
        setStatus('Compression finished. You can download the file.');

        ffmpegInstance.FS('unlink', 'input.mp4');
        ffmpegInstance.FS('unlink', outputName);
    } catch (error) {
        console.error(error);
        setStatus('Compression failed. Check the log and try again.');
        addLog(`Error: ${error.message}`);
    } finally {
        toggleSpinner(false);
        prepareEngineBtn.disabled = false;
        compressBtn.disabled = false;
    }
}

compressBtn.addEventListener('click', () => {
    compress().catch(error => {
        console.error(error);
        setStatus('Unexpected error during compression.');
        addLog(`Error: ${error.message}`);
        toggleSpinner(false);
        prepareEngineBtn.disabled = false;
        compressBtn.disabled = false;
    });
});

// Drag & drop support
const uploadZone = document.querySelector('.upload-zone');

['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        uploadZone.classList.add('drag-active');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        uploadZone.classList.remove('drag-active');
    });
});

uploadZone.addEventListener('drop', (event) => {
    const [file] = event.dataTransfer.files || [];
    if (file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        videoInput.files = dataTransfer.files;
        describeFile(file);
    }
});
