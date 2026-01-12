// ffmpeg.js is loaded as a UMD script in index.html and exposes globals.
// In this UMD build (unpkg @ffmpeg/ffmpeg@0.12.4), the API is the FFmpeg CLASS,
// not createFFmpeg/fetchFile/run/FS.

function getFFmpegClass() {
  // UMD can expose: window.FFmpegWASM.FFmpeg (your case), window.FFmpegWasm.FFmpeg, or window.FFmpeg
  return (
    window.FFmpegWASM?.FFmpeg ||
    window.FFmpegWasm?.FFmpeg ||
    window.FFmpeg ||
    null
  );
}

const startButton = document.getElementById('startButton');
const fileInput = document.getElementById('videoInput');
const dropZone = document.getElementById('dropZone');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const selectedFileLabel = document.getElementById('selectedFile');
const engineLoader = document.getElementById('engineLoader');
const engineLoaderText = document.getElementById('engineLoaderText');
const downloadLink = document.getElementById('downloadLink');
const resultMessage = document.getElementById('resultMessage');
const uploadStatus = document.getElementById('uploadStatus');
const uploadStatusText = document.getElementById('uploadStatusText');

const CORE_URL = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const WASM_URL = new URL('./vendor/ffmpeg-core.wasm', import.meta.url).toString();
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();

let ffmpeg = null;
let ffmpegLoaded = false;
let progressHandlerAttached = false;

let currentFile = null;
let isProcessing = false;

const readerFriendlySize = (size) => {
  if (!size && size !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = size;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const updateSelectedFile = () => {
  if (currentFile) {
    selectedFileLabel.textContent = `${currentFile.name} (${readerFriendlySize(currentFile.size)})`;
    progressLabel.textContent = 'Ready to compress.';
  } else {
    selectedFileLabel.textContent = 'No file selected.';
    progressLabel.textContent = 'Waiting for a file…';
  }
};

const showEngineLoader = (show, message) => {
  if (engineLoader) engineLoader.hidden = !show;
  if (typeof message === 'string' && engineLoaderText) {
    engineLoaderText.textContent = message;
  }
};

const toggleUploadStatus = (show, text) => {
  if (!uploadStatus) return;
  uploadStatus.hidden = !show;
  if (typeof text === 'string' && uploadStatusText) {
    uploadStatusText.textContent = text;
  }
};

const resetDownloadState = () => {
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
};

const attachProgressHandler = () => {
  if (!ffmpeg || typeof ffmpeg.on !== 'function') return;
  if (progressHandlerAttached) return;
  progressHandlerAttached = true;

  ffmpeg.on('progress', ({ progress }) => {
    if (!Number.isFinite(progress)) return;
    const p = Math.min(1, Math.max(0, progress));
    progressBar.value = p;
    progressLabel.textContent = `Compressing… ${Math.round(p * 100)}%`;
  });
};

const ensureFFmpegLoaded = async () => {
  if (ffmpegLoaded) return;

  const FFmpegClass = getFFmpegClass();
  if (!FFmpegClass) {
    throw new Error(
      `FFmpeg UMD class not found. Ensure this script is loaded before script.js: ${expectedFfmpegScriptUrl}`
    );
  }

  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading ffmpeg engine…';

  try {
    if (!ffmpeg) {
      ffmpeg = new FFmpegClass();
      attachProgressHandler();
    }

    // New API: load({ coreURL, wasmURL })
    await ffmpeg.load({
      coreURL: CORE_URL,
      wasmURL: WASM_URL,
    });

    ffmpegLoaded = true;
  } finally {
    showEngineLoader(false);
  }
};

const handleFiles = (files) => {
  if (!files || files.length === 0) return;
  const [file] = files;

  // Keep it simple: accept mp4 only (like your UI copy)
  if (!file.type.includes('mp4')) {
    resultMessage.textContent = 'Only mp4 files are supported right now.';
    return;
  }

  currentFile = file;
  resetDownloadState();
  progressBar.value = 0;
  updateSelectedFile();

  resultMessage.textContent = 'Choose a preset and click "Compress video" to start.';
  toggleUploadStatus(false);
};

const getPreset = () => {
  const form = document.getElementById('presetForm');
  const formData = new FormData(form);
  return formData.get('preset');
};

async function safeDelete(name) {
  if (!ffmpeg) return;
  if (typeof ffmpeg.deleteFile !== 'function') return;
  try {
    await ffmpeg.deleteFile(name);
  } catch (_) {
    // ignore
  }
}

const runCompression = async () => {
  if (isProcessing) {
    resultMessage.textContent = 'Another compression is already running…';
    return;
  }
  if (!currentFile) {
    resultMessage.textContent = 'Please choose a file first.';
    return;
  }

  isProcessing = true;
  startButton.disabled = true;
  resetDownloadState();

  progressBar.value = 0;
  progressLabel.textContent = 'Preparing…';

  try {
    await ensureFFmpegLoaded();

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    toggleUploadStatus(true, 'Copying file to encoder…');
    const fileBuffer = new Uint8Array(await currentFile.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileBuffer);
    toggleUploadStatus(false);

    const command = preset === 'webm'
      ? ['-y', '-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-y', '-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    progressBar.value = 0;
    progressLabel.textContent = 'Compressing… 0%';

    await ffmpeg.exec(command);

    const data = await ffmpeg.readFile(outputName);
    if (!data || data.length === 0) {
      throw new Error('Compression failed to produce an output file.');
    }

    const mime = preset === 'webm' ? 'video/webm' : 'video/mp4';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = preset === 'webm' ? 'compressed.webm' : 'compressed.mp4';
    downloadLink.hidden = false;

    resultMessage.textContent = 'Done! Click the button below to download the compressed video.';
    progressLabel.textContent = 'Complete';
    progressBar.value = 1;
  } catch (error) {
    console.error(error);
    resultMessage.textContent = 'Something went wrong while compressing the file. Please try again or refresh the page.';
    progressLabel.textContent = 'Error';
  } finally {
    toggleUploadStatus(false);
    showEngineLoader(false);
    startButton.disabled = false;
    isProcessing = false;

    // Cleanup temp files
    await safeDelete('input.mp4');
    await safeDelete('output.mp4');
    await safeDelete('output.webm');
  }
};

startButton.addEventListener('click', runCompression);

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
  event.target.value = '';
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(event.dataTransfer.files);
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

updateSelectedFile();
