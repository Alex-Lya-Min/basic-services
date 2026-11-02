// ffmpeg.js (ffmpeg.wasm 0.12.x) is loaded as a UMD script in index.html and
// exposes the FFmpegWASM.FFmpeg class.

const startButton = document.getElementById('startButton');
const fileInput = document.getElementById('videoInput');
const dropZone = document.getElementById('dropZone');
const dropTitle = document.getElementById('dropTitle');
const dropNotice = document.getElementById('dropNotice');
const fileStatus = document.getElementById('fileStatus');
const statusText = document.getElementById('statusText');
const statusDetail = document.getElementById('statusDetail');
const statusFill = document.getElementById('statusFill');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const selectedFileLabel = document.getElementById('selectedFile');
const engineLoader = document.getElementById('engineLoader');
const engineLoaderText = document.getElementById('engineLoaderText');
const downloadLink = document.getElementById('downloadLink');
const resultMessage = document.getElementById('resultMessage');

const CORE_JS_URL = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const CORE_WASM_URL = new URL('./vendor/ffmpeg-core.wasm', import.meta.url).toString();
const CORE_WORKER_URL = new URL('./vendor/ffmpeg-core.worker.js', import.meta.url).toString();
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();

// Uncompressed size of vendor/ffmpeg-core.wasm. Used for the download
// percentage when the server sends no (or a compressed) Content-Length.
const CORE_WASM_BYTES = 31739621;

// The engine download fails only when it stalls (no data for this long), so
// slow but working mobile connections are never cut off.
const ENGINE_STALL_TIMEOUT_MS = 30 * 1000;
// Time allowed to start the engine once its files are downloaded.
const ENGINE_LOAD_TIMEOUT_MS = 120 * 1000;

const OUTPUT_NAME = 'output.mp4';

// ffmpeg's error when the audio track cannot be stored in mp4 as-is (PCM
// from cameras and screen recordings, for example); such audio is converted
// to AAC instead.
const MP4_AUDIO_HINT = /Could not find tag for codec|codec not currently supported in container/i;

let ffmpeg = null;
let ffmpegLoaded = false;

let currentFile = null;
let isProcessing = false;
let lastObjectUrl = null;
let compressStartedAt = 0;
let ffmpegLogs = [];

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

// --- Status UI ----------------------------------------------------------------
// The status block sits right under the drop zone, where the user looks after
// dropping a file. Card 2 mirrors the same progress in its bigger bar.

const setStatus = (state, text = '', { progress = null, detail = '' } = {}) => {
  if (fileStatus) fileStatus.dataset.state = state;
  if (statusText && statusText.textContent !== text) statusText.textContent = text;
  if (statusDetail) statusDetail.textContent = detail;
  if (statusFill) {
    const bar = statusFill.parentElement;
    const indeterminate = state === 'busy' && progress === null;
    if (bar && bar.classList) bar.classList.toggle('indeterminate', indeterminate);
    statusFill.style.width = indeterminate ? '' : `${Math.round((progress || 0) * 100)}%`;
  }
};

const showProgress = (ratio, label) => {
  progressBar.value = ratio;
  progressLabel.textContent = label;
};

// kind 'busy' marks "please wait" notices, which are cleared automatically
// once the running compression finishes.
const showNotice = (message, { error = false, kind = '' } = {}) => {
  if (!dropNotice) return;
  dropNotice.textContent = message;
  dropNotice.hidden = !message;
  dropNotice.dataset.kind = message ? kind : '';
  dropNotice.classList.toggle('error', Boolean(message) && error);
};

const BUSY_NOTICE = 'Please wait until the current video is finished, then drop the next one.';

const updateDropZone = () => {
  dropZone.classList.toggle('has-file', Boolean(currentFile));
  dropZone.classList.toggle('busy', isProcessing);
  dropZone.setAttribute('aria-busy', isProcessing ? 'true' : 'false');
  if (!dropTitle) return;
  if (isProcessing) dropTitle.textContent = 'Working… keep this tab open';
  else if (currentFile) dropTitle.textContent = 'Drop another video or click to replace';
  else dropTitle.textContent = 'Drop video here or click to browse';
};

const updateSelectedFile = () => {
  selectedFileLabel.textContent = currentFile
    ? `${currentFile.name} (${readerFriendlySize(currentFile.size)})`
    : 'No file selected.';
};

const showEngineLoader = (show, message) => {
  if (engineLoader) engineLoader.hidden = !show;
  if (typeof message === 'string' && engineLoaderText) {
    engineLoaderText.textContent = message;
  }
};

const resetDownloadState = () => {
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
};

// --- Engine ---------------------------------------------------------------------

const formatDuration = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// Remaining time, once there is enough progress to estimate it. Long 4K or
// HEVC clips can take many minutes; a countdown shows the page is working.
const estimateRemaining = (ratio, elapsedMs) => {
  if (ratio < 0.02 || ratio >= 1 || elapsedMs < 3000) return '';
  return `about ${formatDuration(elapsedMs * (1 - ratio) / ratio)} left`;
};

const attachEngineHandlers = (instance) => {
  instance.on('progress', ({ progress }) => {
    if (!isProcessing || !Number.isFinite(progress)) return;
    const p = Math.min(1, Math.max(0, progress));
    const percent = `${Math.round(p * 100)}%`;
    const remaining = estimateRemaining(p, Date.now() - compressStartedAt);
    showProgress(p, `Compressing… ${percent}${remaining ? ` · ${remaining}` : ''}`);
    setStatus('busy', 'Compressing…', { progress: p, detail: remaining ? `${percent} · ${remaining}` : percent });
  });
  // Keep the tail of ffmpeg's log to explain failures.
  instance.on('log', ({ message }) => {
    ffmpegLogs.push(String(message));
    if (ffmpegLogs.length > 60) ffmpegLogs.shift();
  });
};

// Sanity-check that the URL serves the real asset and not an HTML 404 page.
// Only the first chunk of the body is read, then the request is cancelled.
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

// Download the ~31 MB wasm core with visible progress and hand it to ffmpeg
// as a blob URL, so it is downloaded once. Fails if no data arrives for
// ENGINE_STALL_TIMEOUT_MS.
const downloadWasm = async (url, onProgress) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let stallTimer = null;
  let stalled = false;
  const armStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      if (controller) controller.abort();
    }, ENGINE_STALL_TIMEOUT_MS);
  };

  const stallError = () => new Error(
    'The compression engine stopped downloading. Check your connection and try again.'
  );

  try {
    armStallTimer();
    let response;
    try {
      response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    } catch (error) {
      throw stalled ? stallError() : error;
    }
    if (!response.ok) {
      throw new Error(`Failed to download the compression engine: HTTP ${response.status}`);
    }

    const declared = Number(response.headers?.get?.('Content-Length')) || 0;
    // A gzip-encoded response declares the compressed size, while the
    // stream yields decompressed bytes: never use a total below the real size.
    const total = Math.max(declared, CORE_WASM_BYTES);

    if (!response.body || typeof response.body.getReader !== 'function') {
      const buffer = await response.arrayBuffer();
      onProgress(buffer.byteLength, buffer.byteLength);
      return URL.createObjectURL(new Blob([buffer], { type: 'application/wasm' }));
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      let result;
      try {
        result = await reader.read();
      } catch (error) {
        throw stalled ? stallError() : error;
      }
      if (result.done) break;
      armStallTimer();
      if (received === 0) {
        // "\0asm" magic number: anything else is an error page, not the engine.
        const v = result.value;
        if (!(v[0] === 0x00 && v[1] === 0x61 && v[2] === 0x73 && v[3] === 0x6d)) {
          throw new Error(`Unexpected response for ${url}: not a WebAssembly file.`);
        }
      }
      chunks.push(result.value);
      received += result.value.length;
      onProgress(received, Math.max(total, received));
    }
    if (stalled) throw stallError();
    if (received === 0) throw new Error('The compression engine download was empty. Reload the page and try again.');
    return URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
  } finally {
    clearTimeout(stallTimer);
  }
};

const loadWithTimeout = (loadPromise, ms = ENGINE_LOAD_TIMEOUT_MS) => {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `The compression engine did not start within ${ms / 1000} seconds. Reload the page and try again.`
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
  showProgress(0, 'Loading engine…');
  setStatus('busy', 'Loading compression engine…', { detail: 'first run only' });

  let wasmUrl = null;
  try {
    await fetchHead(CORE_JS_URL);
    await fetchHead(CORE_WORKER_URL);

    wasmUrl = await downloadWasm(CORE_WASM_URL, (received, total) => {
      const ratio = Math.min(1, received / total);
      const detail = `${readerFriendlySize(received)} of ${readerFriendlySize(total)}`;
      setStatus('busy', 'Loading compression engine…', { progress: ratio, detail });
      showEngineLoader(true, `Loading compression engine… ${Math.round(ratio * 100)}%`);
      showProgress(ratio, `Loading engine… ${Math.round(ratio * 100)}%`);
    });

    setStatus('busy', 'Starting compression engine…');
    ffmpeg = new FFmpegClass();
    attachEngineHandlers(ffmpeg);
    await loadWithTimeout(ffmpeg.load({ coreURL: CORE_JS_URL, wasmURL: wasmUrl, workerURL: CORE_WORKER_URL }));

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
    // The engine has compiled the module; the downloaded copy is not needed.
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
    showEngineLoader(false);
  }
};

// --- Files ----------------------------------------------------------------------

// mp4 and QuickTime .mov (iPhone, cameras, screen recordings). Some
// platforms (notably drag-and-drop on Windows) deliver files with an empty
// MIME type, so fall back to the file extension.
const SUPPORTED_EXTENSION = /\.(mp4|m4v|mov|qt)$/i;

const isSupportedVideo = (file) => {
  const type = (file.type || '').toLowerCase();
  if (type.includes('mp4') || type === 'video/quicktime' || type === 'video/x-m4v') return true;
  if (!type || type === 'application/octet-stream') {
    return SUPPORTED_EXTENSION.test(file.name || '');
  }
  return false;
};

// Name of the input inside ffmpeg's virtual file system; keeping the real
// container extension helps ffmpeg pick the right demuxer.
const inputNameFor = (file) => {
  const match = (file.name || '').match(/\.(mp4|m4v|mov|qt)$/i);
  return `input.${match ? match[1].toLowerCase() : 'mp4'}`;
};

// -pix_fmt yuv420p: iPhone HDR / 10-bit sources would otherwise become
// H.264 "High 10", which Safari, QuickTime, iOS and most players cannot
// play. Colour tags (e.g. HLG) are kept, so HDR-capable players still show
// them correctly. Rotation of portrait videos is applied while re-encoding.
const buildCommand = (inputName, { convertAudio = false } = {}) => [
  '-y', '-i', inputName,
  '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-pix_fmt', 'yuv420p',
  ...(convertAudio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy']),
  OUTPUT_NAME
];

// Turn ffmpeg's log into a message a person can act on.
const describeFfmpegFailure = (logs, code) => {
  const text = logs.join('\n');
  if (/Invalid data found when processing input|moov atom not found/i.test(text)) {
    return 'This file could not be read. It may be damaged or not fully copied — try exporting the video again.';
  }
  if (/Decoder \(codec [^)]+\) not found|Unsupported codec|Could not find codec parameters/i.test(text)) {
    return 'This video uses a codec the compressor cannot decode. mp4 or mov with H.264 or HEVC video is supported.';
  }
  if (/Cannot allocate memory|out of memory|OOM/i.test(text)) {
    return 'The browser ran out of memory. Try a shorter or smaller video, or close other tabs.';
  }
  const lastLine = logs.filter((line) => line.trim()).slice(-1)[0];
  return `Compression failed (ffmpeg exit code ${code})${lastLine ? `: ${lastLine.trim()}` : '.'}`;
};

// photo.mp4 -> photo.min.mp4 (same convention as the image compressor).
const compressedFileName = (name) => {
  const base = (name || 'video').replace(/\.[^./\\]+$/, '') || 'video';
  return `${base}.min.mp4`;
};

// Selecting a valid file starts compression right away (there is a single
// preset). Returns the running compression, if one was started.
const handleFiles = (files) => {
  if (!files || files.length === 0) return null;
  const [file] = files;

  // Swapping the file mid-run would label the running job's result with the
  // new file and reset the progress UI under the encoder.
  if (isProcessing) {
    showNotice(BUSY_NOTICE, { kind: 'busy' });
    return null;
  }

  if (!isSupportedVideo(file)) {
    const keeping = currentFile ? ` Still using "${currentFile.name}".` : '';
    showNotice(`"${file.name}" is not a supported video. Use mp4 or mov (H.264 / HEVC).${keeping}`, { error: true });
    return null;
  }

  currentFile = file;
  resetDownloadState();
  updateSelectedFile();
  showNotice(files.length > 1
    ? `One video at a time: using "${file.name}", the other ${files.length - 1} file(s) were skipped.`
    : '');

  return runCompression();
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
    showNotice(BUSY_NOTICE, { kind: 'busy' });
    return;
  }
  if (!currentFile) {
    showNotice('Please choose an mp4 or mov video first.', { error: true });
    return;
  }

  isProcessing = true;
  startButton.disabled = true;
  resetDownloadState();
  updateDropZone();
  resultMessage.textContent = 'Working… the download button will appear here.';
  showProgress(0, 'Starting…');
  setStatus('busy', 'Starting…');

  const sourceFile = currentFile;
  const inputName = inputNameFor(sourceFile);
  try {
    await ensureFFmpegLoaded();

    setStatus('busy', 'Reading the video…', { detail: readerFriendlySize(sourceFile.size) });
    showProgress(0, 'Reading the video…');
    await ffmpeg.writeFile(inputName, new Uint8Array(await sourceFile.arrayBuffer()));

    setStatus('busy', 'Compressing…', { progress: 0, detail: '0%' });
    showProgress(0, 'Compressing… 0%');
    ffmpegLogs = [];
    compressStartedAt = Date.now();
    let code = await ffmpeg.exec(buildCommand(inputName));
    // Audio that mp4 cannot hold fails instantly while writing the header:
    // retry with the audio converted to AAC.
    if (code !== 0 && code !== undefined && MP4_AUDIO_HINT.test(ffmpegLogs.join('\n'))) {
      ffmpegLogs = [];
      compressStartedAt = Date.now();
      code = await ffmpeg.exec(buildCommand(inputName, { convertAudio: true }));
    }
    if (code !== 0 && code !== undefined) {
      throw new Error(describeFfmpegFailure(ffmpegLogs, code));
    }

    const data = await ffmpeg.readFile(OUTPUT_NAME);
    if (!data || data.length === 0) {
      throw new Error('Compression failed to produce an output file. The video may be damaged or use an unsupported codec.');
    }

    const blob = new Blob([data], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    lastObjectUrl = url;

    downloadLink.href = url;
    downloadLink.download = compressedFileName(sourceFile.name);
    downloadLink.hidden = false;

    const sizes = `${readerFriendlySize(sourceFile.size)} → ${readerFriendlySize(blob.size)}`;
    if (blob.size < sourceFile.size) {
      const saved = Math.round((1 - blob.size / sourceFile.size) * 100);
      setStatus('done', 'Done!', { detail: `${sizes} (−${saved}%)` });
      resultMessage.textContent = `Done! ${sizes}. Click the button below to download the compressed video.`;
    } else {
      setStatus('done', 'Done, but the video was already well compressed.', { detail: sizes });
      resultMessage.textContent = `The result is not smaller than the original (${sizes}). You can keep the original file.`;
    }
    showProgress(1, 'Complete');

    // On narrow screens the download card is below the fold.
    if (typeof downloadLink.scrollIntoView === 'function') {
      downloadLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'Something went wrong while compressing the file. Please try again or refresh the page.';
    resultMessage.textContent = errorMessage;
    showProgress(0, 'Error');
    setStatus('error', errorMessage, { detail: 'press "Compress video" to retry' });
  } finally {
    showEngineLoader(false);
    startButton.disabled = false;
    isProcessing = false;
    updateDropZone();
    if (dropNotice && dropNotice.dataset.kind === 'busy') showNotice('');

    await safeDelete(inputName);
    await safeDelete(OUTPUT_NAME);
  }
};

// --- Events ---------------------------------------------------------------------

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

// While a video is being compressed, picking another one is not possible:
// keep the file dialog closed instead of silently ignoring the choice.
fileInput.addEventListener('click', (event) => {
  if (isProcessing) {
    event.preventDefault();
    showNotice(BUSY_NOTICE, { kind: 'busy' });
  }
});

dropZone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});

updateSelectedFile();
updateDropZone();
setStatus('idle');

// Theme handling lives in ../theme.js (shared across all pages).
