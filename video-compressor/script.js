// ffmpeg.js (ffmpeg.wasm 0.12.x) is loaded as a UMD script in index.html and
// exposes the FFmpegWASM.FFmpeg class.

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

const CORE_JS_URL = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const CORE_WASM_URL = new URL('./vendor/ffmpeg-core.wasm', import.meta.url).toString();
const CORE_WORKER_URL = new URL('./vendor/ffmpeg-core.worker.js', import.meta.url).toString();
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();

// The wasm core is ~31 MB: give slow mobile connections time to download it
// before reporting an error.
const ENGINE_LOAD_TIMEOUT_MS = 120 * 1000;

const INPUT_NAME = 'input.mp4';
const OUTPUT_NAME = 'output.mp4';

let ffmpeg = null;
let ffmpegLoaded = false;

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

let lastObjectUrl = null;

const resetDownloadState = () => {
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
};

const attachProgressHandler = (instance) => {
  instance.on('progress', ({ progress }) => {
    if (!Number.isFinite(progress)) return;
    const p = Math.min(1, Math.max(0, progress));
    progressBar.value = p;
    progressLabel.textContent = `Compressing… ${Math.round(p * 100)}%`;
  });
};

// Sanity-check that the URL serves the real asset and not an HTML 404 page.
// Only the first chunk of the body is read, then the request is cancelled,
// so the 30 MB wasm core is not downloaded twice.
const fetchHead = async (url) => {
  const response = await fetch(url, { headers: { Range: 'bytes=0-63' } });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  if (!response.body) return;
  const reader = response.body.getReader();
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  const prefix = new TextDecoder().decode((value || new Uint8Array()).slice(0, 32)).trim().toLowerCase();
  if (prefix.startsWith('<!doctype') || prefix.startsWith('<html')) {
    throw new Error(`Unexpected HTML response for ${url}`);
  }
};

const loadWithTimeout = (loadPromise, ms = ENGINE_LOAD_TIMEOUT_MS) => {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `The compression engine did not load within ${ms / 1000} seconds. Check your connection and try again.`
        )
      );
    }, ms);
  });
  const clearTimer = () => clearTimeout(timer);
  loadPromise.then(clearTimer, clearTimer);
  return Promise.race([loadPromise, timeout]);
};

const resolveFfmpegClass = () => {
  if (typeof globalThis.FFmpegWASM?.FFmpeg === 'function') return globalThis.FFmpegWASM.FFmpeg;
  if (typeof globalThis.FFmpeg === 'function') return globalThis.FFmpeg;
  return null;
};

const ensureFFmpegLoaded = async () => {
  if (ffmpegLoaded) return;

  const FFmpegClass = resolveFfmpegClass();
  if (!FFmpegClass) {
    throw new Error(
      `Compression engine failed to initialize: the ffmpeg script (${expectedFfmpegScriptUrl}) did not load. Reload the page and try again.`
    );
  }

  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading engine…';

  try {
    await fetchHead(CORE_JS_URL);
    await fetchHead(CORE_WASM_URL);
    await fetchHead(CORE_WORKER_URL);

    ffmpeg = new FFmpegClass();
    attachProgressHandler(ffmpeg);
    await loadWithTimeout(ffmpeg.load({ coreURL: CORE_JS_URL, wasmURL: CORE_WASM_URL, workerURL: CORE_WORKER_URL }));

    ffmpegLoaded = true;
  } catch (error) {
    // Discard the half-initialised instance so a retry starts from scratch
    // (with its own progress handler) instead of reusing a broken engine.
    if (ffmpeg && typeof ffmpeg.terminate === 'function') {
      try {
        ffmpeg.terminate();
      } catch (_) {
        // ignore
      }
    }
    ffmpeg = null;
    throw error;
  } finally {
    showEngineLoader(false);
  }
};

// Some platforms (notably drag-and-drop on Windows) deliver files with an
// empty MIME type, so fall back to the file extension.
const isMp4File = (file) => {
  if (file.type && file.type.includes('mp4')) return true;
  if (!file.type || file.type === 'application/octet-stream') {
    return /\.(mp4|m4v)$/i.test(file.name || '');
  }
  return false;
};

// photo.mp4 -> photo.min.mp4 (same convention as the image compressor).
const compressedFileName = (name) => {
  const base = (name || 'video').replace(/\.[^./\\]+$/, '') || 'video';
  return `${base}.min.mp4`;
};

const handleFiles = (files) => {
  if (!files || files.length === 0) return;
  const [file] = files;

  // Swapping the file mid-run would label the running job's result with the
  // new file and reset the progress UI under the encoder.
  if (isProcessing) {
    resultMessage.textContent = 'Please wait until the current compression finishes.';
    return;
  }

  if (!isMp4File(file)) {
    resultMessage.textContent = 'Only mp4 files are supported right now.';
    return;
  }

  currentFile = file;
  resetDownloadState();
  progressBar.value = 0;
  updateSelectedFile();

  resultMessage.textContent = files.length > 1
    ? `One video at a time: using "${file.name}", the other ${files.length - 1} file(s) were skipped.`
    : 'Choose a preset and click "Compress video" to start.';
  toggleUploadStatus(false);
};

async function safeDelete(name) {
  if (!ffmpeg || typeof ffmpeg.deleteFile !== 'function') return;
  try {
    await ffmpeg.deleteFile(name);
  } catch (_) {
    // ignore: the file may not exist
  }
}

const runCompression = async () => {
  if (isProcessing) {
    resultMessage.textContent = 'Another compression is already running…';
    toggleUploadStatus(false);
    showEngineLoader(false);
    return;
  }
  if (!currentFile) {
    resultMessage.textContent = 'Please choose a file first.';
    toggleUploadStatus(false);
    showEngineLoader(false);
    return;
  }

  isProcessing = true;
  startButton.disabled = true;
  resetDownloadState();

  progressBar.value = 0;
  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading engine…';

  try {
    await ensureFFmpegLoaded();
    showEngineLoader(false);

    toggleUploadStatus(true, 'Copying file to encoder…');
    const sourceFile = currentFile;
    await ffmpeg.writeFile(INPUT_NAME, new Uint8Array(await sourceFile.arrayBuffer()));
    toggleUploadStatus(false);

    progressBar.value = 0;
    progressLabel.textContent = 'Compressing… 0%';
    await ffmpeg.exec(['-y', '-i', INPUT_NAME, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', OUTPUT_NAME]);

    const data = await ffmpeg.readFile(OUTPUT_NAME);
    if (!data || data.length === 0) {
      throw new Error('Compression failed to produce an output file.');
    }

    const blob = new Blob([data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    lastObjectUrl = url;

    downloadLink.href = url;
    downloadLink.download = compressedFileName(sourceFile.name);
    downloadLink.hidden = false;

    resultMessage.textContent = 'Done! Click the button below to download the compressed video.';
    progressLabel.textContent = 'Complete';
    progressBar.value = 1;
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'Something went wrong while compressing the file. Please try again or refresh the page.';
    resultMessage.textContent = errorMessage;
    progressLabel.textContent = 'Error';
  } finally {
    toggleUploadStatus(false);
    showEngineLoader(false);
    startButton.disabled = false;
    isProcessing = false;

    await safeDelete(INPUT_NAME);
    await safeDelete(OUTPUT_NAME);
  }
};

startButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  runCompression();
});

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
  event.target.value = '';
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});

// dragleave also fires when the pointer moves onto a child element of the
// drop zone; only clear the highlight when it really leaves the zone.
dropZone.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && dropZone.contains(event.relatedTarget)) return;
  dropZone.classList.remove('dragover');
});

// A file dropped next to the drop zone would make the browser navigate to
// it (and stop a running compression).
const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (event) => {
  if (hasDraggedFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (hasDraggedFiles(event) && !dropZone.contains(event.target)) event.preventDefault();
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(event.dataTransfer.files);
});

dropZone.addEventListener('click', (event) => {
  if (event.target !== fileInput) fileInput.click();
});

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

updateSelectedFile();

// Theme handling lives in ../theme.js (shared across all pages).
