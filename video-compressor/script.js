// ffmpeg.js (ffmpeg.wasm 0.12.x) is loaded as a UMD script in index.html and
// exposes the FFmpegWASM.FFmpeg class.
//
// The page is one card that changes state: empty (drop / choose) →
// working (steps, progress, time left, cancel) → done (savings, download)
// or error (what happened, what to do).

const $ = (id) => document.getElementById(id);

const tool = $('tool');
const fileInput = $('videoInput');
const dropZone = $('dropZone');
const chooseButton = $('chooseButton');
const dropNotice = $('dropNotice');
const qualityGroup = $('qualityGroup');
const qualityNote = $('qualityNote');
const qualityCustom = $('qualityCustom');
const customQuality = $('customQuality');
const customQualityValue = $('customQualityValue');
const jobCard = $('jobCard');
const jobName = $('jobName');
const jobMeta = $('jobMeta');
const cancelButton = $('cancelButton');
const progressValue = $('progressValue');
const progressNote = $('progressNote');
const progressBar = $('progressBar');
const progressFill = $('progressFill');
const qualitySummary = $('qualitySummary');
const qualitySummaryName = $('qualitySummaryName');
const resultCard = $('resultCard');
const resultTitle = $('resultTitle');
const resultSub = $('resultSub');
const savingsLabel = $('savingsLabel');
const savingsValue = $('savingsValue');
const beforeSize = $('beforeSize');
const afterSize = $('afterSize');
const afterFill = $('afterFill');
const downloadLink = $('downloadLink');
const downloadSize = $('downloadSize');
const anotherButton = $('anotherButton');
const resultStats = $('resultStats');
const smallerHint = $('smallerHint');
const smallerButton = $('smallerButton');
const errorCard = $('errorCard');
const errorTitle = $('errorTitle');
const errorMessage = $('errorMessage');
const errorChooseButton = $('errorChooseButton');
const retryButton = $('retryButton');
const errorDetails = $('errorDetails');
const errorLog = $('errorLog');
const liveStatus = $('liveStatus');

const STEP_IDS = ['stepEngine', 'stepRead', 'stepCompress'];

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

// Quality presets: x264 CRF (lower = better quality, bigger file).
const QUALITY = {
  small: { crf: 32, name: 'Smaller file', hint: 'For messengers and email' },
  balanced: { crf: 28, name: 'Balanced', hint: 'Recommended for most videos' },
  better: { crf: 23, name: 'Better quality', hint: 'Sharper detail, bigger file' }
};
const QUALITY_STORAGE_KEY = 'videoCompressorQuality';
const CUSTOM_LEVEL_STORAGE_KEY = 'videoCompressorCustomLevel';

// "Custom" uses a 1–100 quality level (like JPEG quality) instead of CRF:
// 1 → CRF 40 (smallest file), 100 → CRF 18 (visually lossless).
const levelToCrf = (level) => Math.round(40 - ((level - 1) * 22) / 99);
const crfToLevel = (crf) => Math.round(1 + ((40 - crf) * 99) / 22);

const pageTitle = document.title;

let ffmpeg = null;
let ffmpegLoaded = false;

let currentFile = null;
let isProcessing = false;
let lastObjectUrl = null;
let compressStartedAt = 0;
let ffmpegLogs = [];
let mediaInfo = {};
let job = null;
let quality = 'balanced';
let customLevel = null; // null until the user opens "Custom"

const effectiveCrf = () => (quality === 'custom' ? levelToCrf(customLevel) : QUALITY[quality].crf);
const qualityLabel = () => (quality === 'custom' ? `Custom · ${customLevel}` : QUALITY[quality].name);

// The next preset that gives a smaller file than the current setting.
const nextSmallerPreset = () => ['better', 'balanced', 'small']
  .find((key) => QUALITY[key].crf > effectiveCrf()) || null;

class CancelledError extends Error {
  constructor() {
    super('Compression cancelled.');
    this.name = 'CancelledError';
  }
}

// --- Formatting -------------------------------------------------------------------

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

const formatDuration = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

// "6 min 40 s" for the result line.
const formatElapsed = (ms) => {
  const total = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds} s`;
  if (minutes < 60) return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

const formatClock = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
};

// Remaining time, once there is enough progress to estimate it. Long 4K or
// HEVC clips can take many minutes; a countdown shows the page is working.
const estimateRemaining = (ratio, elapsedMs) => {
  if (ratio < 0.02 || ratio >= 1 || elapsedMs < 3000) return '';
  return `About ${formatDuration(elapsedMs * (1 - ratio) / ratio)} left`;
};

const resolutionLabel = (width, height) => {
  const short = Math.min(width, height);
  if (short >= 2160) return '4K';
  if (short >= 1440) return '1440p';
  if (short >= 1080) return '1080p';
  if (short >= 720) return '720p';
  return `${short}p`;
};

// --- Media info from ffmpeg's log -------------------------------------------------

const resetMediaInfo = () => {
  mediaInfo = { inOutput: false };
};

// Reads duration, resolution, rotation and HDR of the input, and the size
// of the output, from the lines ffmpeg prints while it runs.
const parseLogLine = (line) => {
  if (/^Output #0/.test(line.trim())) {
    mediaInfo.inOutput = true;
    return;
  }
  const duration = line.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (duration && !mediaInfo.inOutput) {
    mediaInfo.duration = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
    return;
  }
  const rotation = line.match(/rotation of (-?\d+(?:\.\d+)?) degrees/);
  if (rotation && !mediaInfo.inOutput) {
    mediaInfo.rotation = Number(rotation[1]);
    return;
  }
  const video = line.match(/Stream #\d+:\d+.*?: Video: (\w+).*?, (\d{2,5})x(\d{2,5})/);
  if (!video) return;
  const width = Number(video[2]);
  const height = Number(video[3]);
  if (mediaInfo.inOutput) {
    if (!mediaInfo.outWidth) {
      mediaInfo.outWidth = width;
      mediaInfo.outHeight = height;
    }
  } else if (!mediaInfo.width) {
    mediaInfo.codec = video[1];
    mediaInfo.width = width;
    mediaInfo.height = height;
    mediaInfo.hdr = /arib-std-b67|smpte2084/.test(line);
  }
};

const describeFile = (file) => {
  const parts = [readerFriendlySize(file.size)];
  if (mediaInfo.width) {
    parts.push(`${resolutionLabel(mediaInfo.width, mediaInfo.height)}${mediaInfo.hdr ? ' HDR' : ''}`);
  }
  if (mediaInfo.duration) parts.push(formatClock(mediaInfo.duration));
  return parts.join(' · ');
};

// --- View ---------------------------------------------------------------------------

const announce = (text) => {
  if (liveStatus) liveStatus.textContent = text;
};

const showView = (view) => {
  tool.dataset.state = view;
  dropZone.hidden = view !== 'empty';
  qualityGroup.hidden = view !== 'empty';
  jobCard.hidden = view !== 'working';
  qualitySummary.hidden = view !== 'working';
  resultCard.hidden = view !== 'done';
  errorCard.hidden = view !== 'error';
};

// kind 'busy' marks "please wait" notices, which are cleared automatically
// once the running compression finishes.
const showNotice = (message, { error = false, kind = '' } = {}) => {
  dropNotice.textContent = message;
  dropNotice.hidden = !message;
  dropNotice.dataset.kind = message ? kind : '';
  dropNotice.classList.toggle('error', Boolean(message) && error);
};

const BUSY_NOTICE = 'Please wait until the current video is finished, then add the next one.';

const setStep = (index) => {
  STEP_IDS.forEach((id, i) => {
    const step = $(id);
    step.classList.toggle('is-done', i < index);
    step.classList.toggle('is-current', i === index);
    if (i === index) step.setAttribute('aria-current', 'step');
    else step.removeAttribute('aria-current');
  });
};

// ratio null = unknown progress (moving bar).
const showProgress = (value, note, ratio) => {
  progressValue.textContent = value;
  progressNote.textContent = note;
  const unknown = ratio === null || ratio === undefined;
  progressBar.classList.toggle('indeterminate', unknown);
  progressFill.style.width = unknown ? '' : `${Math.round(ratio * 100)}%`;
  if (unknown) progressBar.removeAttribute('aria-valuenow');
  else progressBar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
};

const store = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch (_) {
    // storage unavailable: the choice still applies to this page view
  }
};

const updateQualityNote = () => {
  qualityNote.textContent = quality === 'custom'
    ? 'Your own level: lower gives a smaller file, higher keeps more detail.'
    : QUALITY[quality].hint;
};

const setCustomLevel = (level, { persist = true } = {}) => {
  const value = Math.min(100, Math.max(1, Math.round(Number(level) || 55)));
  customLevel = value;
  customQuality.value = String(value);
  customQualityValue.textContent = String(value);
  if (persist) store(CUSTOM_LEVEL_STORAGE_KEY, value);
};

const selectQuality = (value, { persist = true } = {}) => {
  if (!QUALITY[value] && value !== 'custom') return;
  // Opening "Custom" for the first time starts from the current preset.
  if (value === 'custom' && customLevel === null) {
    setCustomLevel(crfToLevel(QUALITY[quality] ? QUALITY[quality].crf : QUALITY.balanced.crf), { persist });
  }
  quality = value;
  qualityGroup.querySelectorAll('input[name="quality"]').forEach((input) => {
    input.checked = input.value === value;
    const option = input.closest('.quality-option');
    if (option) option.classList.toggle('is-selected', input.value === value);
  });
  qualityCustom.hidden = value !== 'custom';
  updateQualityNote();
  if (persist) store(QUALITY_STORAGE_KEY, value);
};

const loadSavedQuality = () => {
  try {
    const level = Number(localStorage.getItem(CUSTOM_LEVEL_STORAGE_KEY));
    if (level >= 1 && level <= 100) setCustomLevel(level, { persist: false });
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (QUALITY[saved] || saved === 'custom') return saved;
  } catch (_) {
    // ignore
  }
  return 'balanced';
};

const resetDownloadState = () => {
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = null;
  }
};

const openFileDialog = () => {
  if (isProcessing) {
    showNotice(BUSY_NOTICE, { kind: 'busy' });
    return;
  }
  fileInput.click();
};

// --- Engine ---------------------------------------------------------------------

const attachEngineHandlers = (instance) => {
  instance.on('progress', ({ progress }) => {
    if (!isProcessing || !Number.isFinite(progress)) return;
    const p = Math.min(1, Math.max(0, progress));
    const percent = `${Math.round(p * 100)}%`;
    const remaining = estimateRemaining(p, Date.now() - compressStartedAt);
    showProgress(percent, remaining || 'Compressing…', p);
    document.title = `${percent} · Compressing… · ${pageTitle}`;
  });
  // Keep the tail of ffmpeg's log to explain failures, and read the video's
  // resolution, duration and HDR from it.
  instance.on('log', ({ message }) => {
    const line = String(message);
    ffmpegLogs.push(line);
    if (ffmpegLogs.length > 60) ffmpegLogs.shift();
    const hadInfo = Boolean(mediaInfo.width && mediaInfo.duration);
    parseLogLine(line);
    if (!hadInfo && currentFile && (mediaInfo.width || mediaInfo.duration)) {
      jobMeta.textContent = describeFile(currentFile);
    }
  });
};

// Sanity-check that the URL serves the real asset and not an HTML 404 page.
// Only the first chunk of the body is read, then the request is cancelled.
const fetchHead = async (url, signal) => {
  const response = await fetch(url, { headers: { Range: 'bytes=0-63' }, signal });
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
const downloadWasm = async (url, onProgress, outerSignal) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const abortFromOuter = () => controller && controller.abort();
  if (outerSignal && typeof outerSignal.addEventListener === 'function') {
    outerSignal.addEventListener('abort', abortFromOuter);
  }
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
          throw new Error(`The compression engine download failed: ${url} is not a WebAssembly file.`);
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
    if (outerSignal && typeof outerSignal.removeEventListener === 'function') {
      outerSignal.removeEventListener('abort', abortFromOuter);
    }
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

const discardEngine = () => {
  if (ffmpeg && typeof ffmpeg.terminate === 'function') {
    try {
      ffmpeg.terminate();
    } catch (_) {
      // ignore
    }
  }
  ffmpeg = null;
  ffmpegLoaded = false;
};

// Rejects as soon as the current job is cancelled.
const guard = (promise) => (job ? Promise.race([promise, job.cancelled]) : promise);

const ensureFFmpegLoaded = async () => {
  if (ffmpegLoaded) return;

  const FFmpegClass = resolveFfmpegClass();
  if (!FFmpegClass) {
    throw new Error(
      `Compression engine failed to initialize: the ffmpeg script (${expectedFfmpegScriptUrl}) did not load. Reload the page and try again.`
    );
  }

  showProgress('0%', 'Loading the engine (first time only)…', 0);

  let wasmUrl = null;
  const signal = job && job.controller ? job.controller.signal : undefined;
  try {
    await guard(fetchHead(CORE_JS_URL, signal));
    await guard(fetchHead(CORE_WORKER_URL, signal));

    wasmUrl = await guard(downloadWasm(CORE_WASM_URL, (received, total) => {
      const ratio = Math.min(1, received / total);
      showProgress(
        `${Math.round(ratio * 100)}%`,
        `Loading the engine · ${readerFriendlySize(received)} of ${readerFriendlySize(total)}`,
        ratio
      );
    }, signal));

    showProgress('100%', 'Starting the engine…', null);
    ffmpeg = new FFmpegClass();
    attachEngineHandlers(ffmpeg);
    await guard(loadWithTimeout(ffmpeg.load({ coreURL: CORE_JS_URL, wasmURL: wasmUrl, workerURL: CORE_WORKER_URL })));

    ffmpegLoaded = true;
  } catch (error) {
    // Discard the half-initialised instance so a retry starts from scratch
    // (with its own handlers) instead of reusing a broken engine.
    discardEngine();
    throw error;
  } finally {
    // The engine has compiled the module; the downloaded copy is not needed.
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
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

// photo.mp4 -> photo.min.mp4 (same convention as the image compressor).
const compressedFileName = (name) => {
  const base = (name || 'video').replace(/\.[^./\\]+$/, '') || 'video';
  return `${base}.min.mp4`;
};

// -preset veryfast: in ffmpeg.wasm it is ~1.5x faster than "faster" with
// nearly the same quality at CRF 28 (about -0.5..-0.9 dB PSNR in tests).
// -pix_fmt yuv420p: iPhone HDR / 10-bit sources would otherwise become
// H.264 "High 10", which Safari, QuickTime, iOS and most players cannot
// play. Colour tags (e.g. HLG) are kept, so HDR-capable players still show
// them correctly. Rotation of portrait videos is applied while re-encoding.
const buildCommand = (inputName, { convertAudio = false, crf = QUALITY.balanced.crf } = {}) => [
  '-y', '-i', inputName,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p',
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

// Title for the error card, from the message.
const errorTitleFor = (message) => {
  if (/could not be read|damaged/i.test(message)) return 'We couldn’t read this video';
  if (/codec|not supported/i.test(message)) return 'This video isn’t supported';
  if (/memory/i.test(message)) return 'Not enough memory';
  if (/engine|download|connection|fetch/i.test(message)) return 'The compression engine didn’t load';
  return 'Something went wrong';
};

// Selecting a valid file starts compression right away. Returns the running
// compression, if one was started.
const handleFiles = (files) => {
  if (!files || files.length === 0) return null;
  const [file] = files;

  // Swapping the file mid-run would label the running job's result with the
  // new file.
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

const showResult = (sourceFile, blob, elapsedMs) => {
  const before = sourceFile.size;
  const after = blob.size;
  const smaller = after < before;
  const width = mediaInfo.outWidth || 0;
  const height = mediaInfo.outHeight || 0;

  resultTitle.textContent = smaller ? 'Your video is ready' : 'Done, but it didn’t get smaller';
  resultSub.textContent = [compressedFileName(sourceFile.name), 'H.264 MP4', width ? `${width} × ${height}` : '']
    .filter(Boolean).join(' · ');
  if (smaller) {
    savingsLabel.textContent = 'Smaller by';
    savingsValue.textContent = `${Math.round((1 - after / before) * 100)}%`;
  } else {
    savingsLabel.textContent = 'Size change';
    savingsValue.textContent = before ? `+${Math.round((after / before - 1) * 100)}%` : '0%';
  }
  beforeSize.textContent = readerFriendlySize(before);
  afterSize.textContent = readerFriendlySize(after);
  afterFill.style.width = `${Math.max(2, Math.min(100, Math.round((after / Math.max(before, 1)) * 100)))}%`;
  downloadSize.textContent = readerFriendlySize(after);
  resultStats.textContent = smaller
    ? `Saved ${readerFriendlySize(before - after)} · took ${formatElapsed(elapsedMs)}`
    : `Took ${formatElapsed(elapsedMs)} · you can keep the original file`;
  smallerHint.hidden = nextSmallerPreset() === null;
};

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
  let rejectCancel;
  job = {
    controller: typeof AbortController === 'function' ? new AbortController() : null,
    cancelled: new Promise((_, reject) => {
      rejectCancel = reject;
    }),
    isCancelled: false
  };
  job.cancelled.catch(() => {}); // handled where it is raced
  job.cancel = () => {
    job.isCancelled = true;
    if (job.controller) job.controller.abort();
    rejectCancel(new CancelledError());
  };
  const thisJob = job;

  const sourceFile = currentFile;
  const inputName = inputNameFor(sourceFile);
  const startedAt = Date.now();
  resetDownloadState();
  resetMediaInfo();

  jobName.textContent = sourceFile.name;
  jobMeta.textContent = describeFile(sourceFile);
  qualitySummaryName.textContent = qualityLabel();
  cancelButton.disabled = false;
  setStep(ffmpegLoaded ? 1 : 0);
  showProgress('0%', 'Starting…', null);
  showView('working');
  announce(`Compressing ${sourceFile.name}…`);

  try {
    await ensureFFmpegLoaded();

    setStep(1);
    showProgress('—', 'Reading the video…', null);
    const bytes = new Uint8Array(await guard(sourceFile.arrayBuffer()));
    await guard(ffmpeg.writeFile(inputName, bytes));

    setStep(2);
    showProgress('0%', 'Starting the encoder…', null);
    ffmpegLogs = [];
    compressStartedAt = Date.now();
    const crf = effectiveCrf();
    let code = await guard(ffmpeg.exec(buildCommand(inputName, { crf })));
    // Audio that mp4 cannot hold fails instantly while writing the header:
    // retry with the audio converted to AAC.
    if (code !== 0 && code !== undefined && MP4_AUDIO_HINT.test(ffmpegLogs.join('\n'))) {
      ffmpegLogs = [];
      resetMediaInfo();
      compressStartedAt = Date.now();
      code = await guard(ffmpeg.exec(buildCommand(inputName, { crf, convertAudio: true })));
    }
    if (code !== 0 && code !== undefined) {
      throw new Error(describeFfmpegFailure(ffmpegLogs, code));
    }

    const data = await guard(ffmpeg.readFile(OUTPUT_NAME));
    if (!data || data.length === 0) {
      throw new Error('Compression failed to produce an output file. The video may be damaged or use an unsupported codec.');
    }

    const blob = new Blob([data], { type: 'video/mp4' });
    lastObjectUrl = URL.createObjectURL(blob);
    downloadLink.href = lastObjectUrl;
    downloadLink.download = compressedFileName(sourceFile.name);
    downloadLink.hidden = false;

    showResult(sourceFile, blob, Date.now() - startedAt);
    showView('done');
    announce(`Done. ${resultSub.textContent}`);
    document.title = `Done · ${pageTitle}`;

    // On narrow screens the result card may start below the fold.
    if (typeof resultCard.scrollIntoView === 'function') {
      resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (error) {
    if (thisJob.isCancelled || error instanceof CancelledError) {
      showView('empty');
      showNotice('Compression cancelled.');
      announce('Compression cancelled.');
    } else {
      console.error(error);
      const message = error instanceof Error && error.message
        ? error.message
        : 'Something went wrong while compressing the file. Please try again or refresh the page.';
      errorTitle.textContent = errorTitleFor(message);
      errorMessage.textContent = message;
      const tail = ffmpegLogs.filter((line) => line.trim()).slice(-12).join('\n');
      errorLog.textContent = tail || String(error && error.stack ? error.stack : error);
      errorDetails.hidden = !errorLog.textContent;
      showView('error');
      announce(`${errorTitle.textContent}. ${message}`);
    }
    document.title = pageTitle;
  } finally {
    // Remove the temporary files before another run can start: the next
    // run uses the same names.
    await safeDelete(inputName);
    await safeDelete(OUTPUT_NAME);

    isProcessing = false;
    if (job === thisJob) job = null;
    if (dropNotice.dataset.kind === 'busy') showNotice('');
  }
};

const cancelCompression = () => {
  if (!job || job.isCancelled) return;
  cancelButton.disabled = true;
  showProgress(progressValue.textContent, 'Cancelling…', null);
  job.cancel();
  // Stops the encoder immediately; the engine is loaded again next time.
  discardEngine();
};

// --- Events ---------------------------------------------------------------------

chooseButton.addEventListener('click', (event) => {
  event.stopPropagation();
  openFileDialog();
});

dropZone.addEventListener('click', (event) => {
  if (event.target === fileInput) return;
  openFileDialog();
});

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
  event.target.value = '';
});

cancelButton.addEventListener('click', cancelCompression);
anotherButton.addEventListener('click', openFileDialog);
errorChooseButton.addEventListener('click', openFileDialog);
retryButton.addEventListener('click', () => runCompression());

smallerButton.addEventListener('click', () => {
  const next = nextSmallerPreset();
  if (!next) return;
  selectQuality(next);
  runCompression();
});

qualityGroup.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'quality') selectQuality(event.target.value);
});

customQuality.addEventListener('input', () => setCustomLevel(customQuality.value));

// Files can be dropped anywhere on the tool, whatever card is shown.
tool.addEventListener('dragover', (event) => {
  event.preventDefault();
  tool.classList.add('dragover');
});

// dragleave also fires when the pointer moves onto a child element; only
// clear the highlight when it really leaves the tool.
tool.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && tool.contains(event.relatedTarget)) return;
  tool.classList.remove('dragover');
});

tool.addEventListener('drop', (event) => {
  event.preventDefault();
  tool.classList.remove('dragover');
  handleFiles(event.dataTransfer.files);
});

// A file dropped next to the tool would make the browser navigate to it
// (and stop a running compression).
const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (event) => {
  if (hasDraggedFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (hasDraggedFiles(event) && !tool.contains(event.target)) event.preventDefault();
});

// Leaving the page while a video is being compressed loses the work.
window.addEventListener('beforeunload', (event) => {
  if (!isProcessing) return;
  event.preventDefault();
  event.returnValue = '';
});

selectQuality(loadSavedQuality(), { persist: false });
showView('empty');
