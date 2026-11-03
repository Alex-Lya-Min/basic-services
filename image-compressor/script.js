// Image Compressor UI. Compression itself happens in worker.js (Web Worker),
// which runs the MozJPEG / OxiPNG wasm codecs so the page never blocks.
//
// Same layout as the video compressor: a drop card while empty, a progress
// card while working, a result card with the total savings when done, and
// the list of images with a download button for each.

const $ = (id) => document.getElementById(id);

const MAX_FILES = 20;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
// Time limit for reading the file and downloading the codec from the CDN.
// Encoding itself is not limited: big PNGs can take minutes on slow devices.
const CODEC_LOAD_TIMEOUT_MS = 60 * 1000;

// JPEG quality per preset (MozJPEG). PNGs are always optimised losslessly.
const QUALITY = {
  small: { jpeg: 60, name: 'Smaller files', hint: 'For messengers and email' },
  balanced: { jpeg: 75, name: 'Balanced', hint: 'Recommended for most images' },
  better: { jpeg: 88, name: 'Better quality', hint: 'Sharper detail, bigger files' }
};
const QUALITY_ORDER = ['better', 'balanced', 'small'];
const QUALITY_STORAGE_KEY = 'imageCompressorQuality';

const tool = $('tool');
const dropZone = $('dropZone');
const fileInput = $('imageInput');
const chooseButton = $('chooseButton');
const dropNotice = $('dropNotice');
const jobCard = $('jobCard');
const jobMeta = $('jobMeta');
const cancelButton = $('cancelButton');
const progressValue = $('progressValue');
const progressNote = $('progressNote');
const progressBar = $('progressBar');
const progressFill = $('progressFill');
const resultCard = $('resultCard');
const resultTitle = $('resultTitle');
const resultSub = $('resultSub');
const savingsLabel = $('savingsLabel');
const savingsValue = $('savingsValue');
const beforeSize = $('beforeSize');
const afterSize = $('afterSize');
const afterFill = $('afterFill');
const downloadAllButton = $('downloadAllButton');
const downloadWhat = $('downloadWhat');
const downloadZip = $('downloadZip');
const downloadSize = $('downloadSize');
const addMoreButton = $('addMoreButton');
const resultStats = $('resultStats');
const smallerHint = $('smallerHint');
const smallerButton = $('smallerButton');
const listBlock = $('listBlock');
const imageList = $('imageList');
const clearAllButton = $('clearAllButton');
const qualityGroup = $('qualityGroup');
const qualityNote = $('qualityNote');
const qualityApply = $('qualityApply');
const qualityApplyText = $('qualityApplyText');
const recompressButton = $('recompressButton');
const liveStatus = $('liveStatus');

const pageTitle = document.title;

const items = new Map();
const queue = [];
let nextItemId = 1;
let queueRunning = false;
let worker = null;
let currentJob = null; // { id, finish, loadTimer } — one file is compressed at a time
let currentStage = '';
let durations = []; // seconds per finished image in this run, for the estimate
let quality = 'balanced';
let lastView = 'empty';

const DOWNLOAD_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5"></path><path d="M4 20h16"></path></svg>';

// --- Formatting ------------------------------------------------------------------

const friendlySize = (size) => {
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

const formatDuration = (seconds) => {
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.round(s / 60)} min`;
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const EXTENSION_BY_KIND = { jpeg: '.jpg', png: '.png' };

// photo.jpg -> photo.min.jpg. Files without an extension (e.g. accepted by
// MIME type) get one from their detected kind, so the download still opens.
const outputName = (name, kind) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.min${EXTENSION_BY_KIND[kind] || ''}`;
  return `${name.slice(0, dot)}.min${name.slice(dot)}`;
};

const detectKind = (file) => {
  if (file.type === 'image/jpeg') return 'jpeg';
  if (file.type === 'image/png') return 'png';
  // Drag-and-drop on some platforms delivers files with an empty or generic
  // MIME type, so fall back to the file extension.
  if (!file.type || file.type === 'application/octet-stream') {
    const name = (file.name || '').toLowerCase();
    if (/\.jpe?g$/.test(name)) return 'jpeg';
    if (/\.png$/.test(name)) return 'png';
  }
  return null;
};

// --- Notices and quality ---------------------------------------------------------

const announce = (text) => {
  if (liveStatus) liveStatus.textContent = text;
};

const showNotice = (message, { error = false } = {}) => {
  dropNotice.textContent = message;
  dropNotice.hidden = !message;
  dropNotice.classList.toggle('error', Boolean(message) && error);
};

const selectQuality = (value, { persist = true } = {}) => {
  if (!QUALITY[value]) return;
  quality = value;
  qualityGroup.querySelectorAll('input[name="quality"]').forEach((input) => {
    input.checked = input.value === value;
    const option = input.closest('.quality-option');
    if (option) option.classList.toggle('is-selected', input.value === value);
  });
  if (qualityNote) qualityNote.textContent = QUALITY[value].hint;
  if (persist) {
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, value);
    } catch (_) {
      // storage unavailable: the choice still applies to this page view
    }
  }
};

const loadSavedQuality = () => {
  try {
    const saved = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (QUALITY[saved]) return saved;
  } catch (_) {
    // ignore
  }
  return 'balanced';
};

// Finished JPEGs that were compressed with another quality than the chosen one.
const jpegsAtOtherQuality = () => Array.from(items.values()).filter((item) => item.kind === 'jpeg'
  && (item.status === 'done' || item.status === 'error')
  && item.quality !== quality);

// --- Rows ------------------------------------------------------------------------

const setItemStatus = (item, text, options = {}) => {
  const el = item.els.status;
  el.classList.toggle('error', Boolean(options.error));
  el.textContent = '';
  if (options.spinner) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner-inline';
    spinner.setAttribute('aria-hidden', 'true');
    el.appendChild(spinner);
  }
  el.appendChild(document.createTextNode(text));
};

const renderRow = (item) => {
  const row = document.createElement('li');
  row.className = 'image-row';
  row.innerHTML = `
        <img class="image-thumb" alt="">
        <div class="image-info">
            <p class="image-name"></p>
            <p class="image-status"></p>
        </div>
        <span class="image-badge" hidden></span>
        <a class="btn image-download" hidden>${DOWNLOAD_ICON}</a>
    `;

  item.els = {
    row,
    thumb: row.querySelector('.image-thumb'),
    name: row.querySelector('.image-name'),
    status: row.querySelector('.image-status'),
    badge: row.querySelector('.image-badge'),
    download: row.querySelector('.image-download')
  };

  item.els.thumb.src = item.originalUrl;
  item.els.name.textContent = item.file.name;
  item.els.name.title = item.file.name;
  setItemStatus(item, `${friendlySize(item.file.size)} · Waiting…`);

  imageList.appendChild(row);
};

const resetRow = (item) => {
  if (item.resultUrl) {
    URL.revokeObjectURL(item.resultUrl);
    item.resultUrl = null;
  }
  item.resultBlob = null;
  item.keptOriginal = false;
  item.status = 'queued';
  item.els.thumb.src = item.originalUrl;
  item.els.badge.hidden = true;
  item.els.download.hidden = true;
  item.els.download.removeAttribute('href');
  setItemStatus(item, `${friendlySize(item.file.size)} · Waiting…`);
};

const removeItem = (item) => {
  URL.revokeObjectURL(item.originalUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  if (item.els && item.els.row) item.els.row.remove();
  items.delete(item.id);
};

// --- View ----------------------------------------------------------------------

const counts = () => {
  const result = { total: items.size, done: 0, failed: 0, pending: 0, kept: 0, before: 0, after: 0, jpegDone: 0 };
  items.forEach((item) => {
    if (item.status === 'done') {
      result.done += 1;
      result.before += item.file.size;
      result.after += item.resultBlob ? item.resultBlob.size : item.file.size;
      if (item.keptOriginal) result.kept += 1;
      if (item.kind === 'jpeg') result.jpegDone += 1;
    } else if (item.status === 'error') {
      result.failed += 1;
    } else {
      result.pending += 1;
    }
  });
  return result;
};

const setProgress = (ratio, note) => {
  const percent = Math.round(ratio * 100);
  progressValue.textContent = `${percent}%`;
  progressNote.textContent = note;
  progressFill.style.width = `${percent}%`;
  progressBar.setAttribute('aria-valuenow', String(percent));
};

const updateWorking = (c) => {
  const finished = c.done + c.failed;
  jobMeta.textContent = `${finished} of ${plural(c.total, 'image', 'images')} done`;
  let note = currentStage || 'Compressing…';
  if (durations.length > 0 && c.pending > 0) {
    const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    note = `About ${formatDuration(average * c.pending)} left`;
  }
  setProgress(c.total ? finished / c.total : 0, note);
  document.title = `${Math.round((c.total ? finished / c.total : 0) * 100)}% · Compressing… · ${pageTitle}`;
};

const updateResult = (c) => {
  const anyDone = c.done > 0;
  const smaller = c.after < c.before;
  if (!anyDone) {
    resultTitle.textContent = 'No images could be compressed';
  } else if (c.done === 1) {
    resultTitle.textContent = 'Your image is ready';
  } else {
    resultTitle.textContent = 'Your images are ready';
  }
  const parts = [plural(c.done, 'image', 'images')];
  if (c.kept) parts.push(`${c.kept} kept as original`);
  if (c.failed) parts.push(`${c.failed} couldn’t be compressed`);
  resultSub.textContent = parts.join(' · ');

  if (smaller) {
    savingsLabel.textContent = 'Smaller by';
    savingsValue.textContent = `${Math.round((1 - c.after / c.before) * 100)}%`;
  } else {
    savingsLabel.textContent = 'Size change';
    savingsValue.textContent = '0%';
  }
  beforeSize.textContent = friendlySize(c.before);
  afterSize.textContent = friendlySize(c.after);
  afterFill.style.width = `${c.before ? Math.max(2, Math.min(100, Math.round((c.after / c.before) * 100))) : 0}%`;

  downloadAllButton.hidden = !anyDone;
  downloadAllButton.disabled = !anyDone;
  downloadWhat.textContent = c.done === 1 ? 'Download image' : 'Download all';
  downloadZip.hidden = c.done === 1;
  downloadSize.textContent = friendlySize(c.after);

  resultStats.textContent = smaller
    ? `Saved ${friendlySize(c.before - c.after)}`
    : 'Already well compressed — originals kept';
  smallerHint.hidden = c.jpegDone === 0 || quality === 'small';
};

const updateView = () => {
  const c = counts();
  const view = c.total === 0 ? 'empty' : (queueRunning || c.pending > 0 ? 'working' : 'done');
  tool.dataset.state = view;
  dropZone.hidden = view !== 'empty';
  listBlock.hidden = view === 'empty';
  jobCard.hidden = view !== 'working';
  resultCard.hidden = view !== 'done';
  qualityGroup.disabled = view === 'working';
  clearAllButton.disabled = view === 'working';

  if (view === 'working') updateWorking(c);
  if (view === 'done') updateResult(c);
  if (view !== 'working') document.title = view === 'done' ? `Done · ${pageTitle}` : pageTitle;

  const other = view === 'done' ? jpegsAtOtherQuality() : [];
  qualityApply.hidden = other.length === 0;
  if (other.length) {
    qualityApplyText.textContent = `Re-compress ${plural(other.length, 'JPEG', 'JPEGs')} as “${QUALITY[quality].name}”`;
  }

  if (view !== lastView) {
    if (view === 'done') announce(`${resultTitle.textContent}. ${resultSub.textContent}`);
    if (view === 'working' && lastView !== 'working') announce('Compressing images…');
    lastView = view;
  }
};

// --- Worker ----------------------------------------------------------------------

const clearLoadTimer = () => {
  if (currentJob && currentJob.loadTimer) {
    clearTimeout(currentJob.loadTimer);
    currentJob.loadTimer = null;
  }
};

// A worker that crashed, failed to load or got stuck never answers again.
// Drop it so the next file starts a fresh worker instead of waiting forever.
const discardWorker = () => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
};

const finishJob = (id) => {
  if (currentJob && currentJob.id === id) {
    clearLoadTimer();
    const { finish } = currentJob;
    currentJob = null;
    finish();
  }
  updateView();
};

const failItem = (item, message) => {
  item.status = 'error';
  setItemStatus(item, message, { error: true });
};

const finalizeItem = (item, buffer) => {
  const originalSize = item.file.size;
  let blob;
  let keptOriginal = false;

  if (buffer.byteLength >= originalSize) {
    // Re-encoding did not help; keep the original bytes instead of
    // shipping a larger file.
    blob = item.file;
    keptOriginal = true;
  } else {
    blob = new Blob([buffer], { type: item.kind === 'png' ? 'image/png' : 'image/jpeg' });
  }

  item.resultBlob = blob;
  item.keptOriginal = keptOriginal;
  item.resultUrl = URL.createObjectURL(blob);
  item.status = 'done';
  if (typeof item.startedAt === 'number') durations.push((Date.now() - item.startedAt) / 1000);

  item.els.thumb.src = item.resultUrl;
  const badge = item.els.badge;
  badge.hidden = false;
  if (keptOriginal) {
    badge.className = 'image-badge zero';
    badge.textContent = 'Kept original';
    setItemStatus(item, `${friendlySize(originalSize)} · already optimised`);
  } else {
    const savedPct = (1 - blob.size / originalSize) * 100;
    badge.className = 'image-badge';
    badge.textContent = `−${savedPct.toFixed(savedPct >= 10 ? 0 : 1)}%`;
    setItemStatus(item, `${friendlySize(originalSize)} → ${friendlySize(blob.size)}`);
  }

  const name = outputName(item.file.name || `image-${item.id}`, item.kind);
  item.els.download.href = item.resultUrl;
  item.els.download.download = name;
  item.els.download.setAttribute('aria-label', `Download ${name}`);
  item.els.download.title = `Download ${name}`;
  item.els.download.hidden = false;
};

const onWorkerMessage = (event) => {
  const { id, status, stage, buffer, message } = event.data;
  const item = items.get(id);

  if (status === 'stage') {
    // The codec is loaded and encoding has started: lift the load time limit.
    if (event.data.phase === 'working' && currentJob && currentJob.id === id) {
      clearLoadTimer();
    }
    if (item && item.status === 'processing') {
      setItemStatus(item, stage, { spinner: true });
      currentStage = stage;
      updateView();
    }
    return;
  }

  if (status === 'done') {
    if (item) finalizeItem(item, buffer);
    finishJob(id);
    return;
  }

  if (status === 'error') {
    if (item) failItem(item, message || 'Compression failed.');
    finishJob(id);
  }
};

const onWorkerError = (event) => {
  event.preventDefault();
  discardWorker();
  if (currentJob) {
    const item = items.get(currentJob.id);
    if (item) {
      failItem(item, 'Compression engine failed to load. Check your network connection and try again.');
    }
    finishJob(currentJob.id);
  }
};

const getWorker = () => {
  if (!worker) {
    worker = new Worker('./worker.js', { type: 'module' });
    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', onWorkerError);
  }
  return worker;
};

const compressItem = (item) => new Promise((finish) => {
  item.status = 'processing';
  item.quality = quality;
  item.startedAt = Date.now();
  currentStage = 'Reading file…';
  setItemStatus(item, 'Reading file…', { spinner: true });
  currentJob = { id: item.id, finish, loadTimer: null };
  // If the codec download stalls, the worker would never answer and the whole
  // queue would wait forever without telling the user anything.
  currentJob.loadTimer = setTimeout(() => {
    if (!currentJob || currentJob.id !== item.id) return;
    discardWorker();
    failItem(item, 'Compression engine did not load in time. Check your network connection and try again.');
    finishJob(item.id);
  }, CODEC_LOAD_TIMEOUT_MS);
  updateView();

  item.file.arrayBuffer()
    .then((buffer) => {
      if (!currentJob || currentJob.id !== item.id) return; // timed out or cancelled
      getWorker().postMessage(
        { id: item.id, kind: item.kind, buffer, quality: QUALITY[item.quality].jpeg },
        [buffer]
      );
    })
    .catch((error) => {
      if (!currentJob || currentJob.id !== item.id) return; // timed out or cancelled
      failItem(item, `Could not read file: ${error.message}`);
      finishJob(item.id);
    });
});

const runQueue = async () => {
  if (queueRunning) return;
  queueRunning = true;
  durations = [];
  updateView();
  while (queue.length > 0) {
    const id = queue.shift();
    const item = items.get(id);
    if (!item || item.status !== 'queued') continue;
    await compressItem(item);
  }
  queueRunning = false;
  currentStage = '';
  updateView();
};

const addFiles = (fileList) => {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;

  const rejected = [];
  let added = 0;

  for (const file of files) {
    if (items.size >= MAX_FILES) {
      rejected.push(`${file.name}: limit of ${MAX_FILES} files reached`);
      continue;
    }
    const kind = detectKind(file);
    if (!kind) {
      rejected.push(`${file.name}: only JPEG and PNG are supported`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push(`${file.name}: larger than ${friendlySize(MAX_FILE_BYTES)}`);
      continue;
    }

    const item = {
      id: nextItemId++,
      file,
      kind,
      status: 'queued',
      quality: null,
      originalUrl: URL.createObjectURL(file),
      resultBlob: null,
      resultUrl: null,
      keptOriginal: false,
      els: null
    };
    items.set(item.id, item);
    renderRow(item);
    queue.push(item.id);
    added += 1;
  }

  showNotice(rejected.length > 0 ? `Skipped: ${rejected.join('; ')}` : '', { error: rejected.length > 0 });
  if (added > 0) runQueue();
  updateView();
};

// Compress the given finished JPEGs again with the current quality.
const requeue = (list) => {
  list.forEach((item) => {
    resetRow(item);
    queue.push(item.id);
  });
  if (list.length > 0) {
    showNotice('');
    runQueue();
    updateView();
  }
};

const cancelQueue = () => {
  if (!queueRunning) return;
  const stopped = [...queue];
  queue.length = 0;
  if (currentJob) stopped.push(currentJob.id);
  discardWorker();
  if (currentJob) {
    clearLoadTimer();
    const { finish } = currentJob;
    currentJob = null;
    finish();
  }
  let removed = 0;
  stopped.forEach((id) => {
    const item = items.get(id);
    if (item && item.status !== 'done' && item.status !== 'error') {
      removeItem(item);
      removed += 1;
    }
  });
  showNotice(`Stopped. ${plural(removed, 'image was', 'images were')} not compressed.`);
  updateView();
};

const downloadBlob = (url, name) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const downloadAll = async () => {
  const done = [];
  items.forEach((item) => {
    if (item.status === 'done' && item.resultBlob) done.push(item);
  });
  if (done.length === 0) return;

  if (done.length === 1) {
    const [item] = done;
    downloadBlob(item.resultUrl, outputName(item.file.name || `image-${item.id}`, item.kind));
    return;
  }

  if (typeof JSZip === 'undefined') {
    showNotice('Could not load the zip library — check your network connection and reload the page.', { error: true });
    return;
  }

  downloadAllButton.disabled = true;
  const label = downloadWhat.textContent;
  downloadWhat.textContent = 'Building zip…';
  try {
    const zip = new JSZip();
    const usedNames = new Set();
    for (const item of done) {
      let name = outputName(item.file.name || `image-${item.id}`, item.kind);
      if (usedNames.has(name)) name = `${item.id}-${name}`;
      usedNames.add(name);
      zip.file(name, item.resultBlob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    downloadBlob(url, 'compressed-images.zip');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    showNotice(`Failed to build zip: ${error.message}`, { error: true });
  } finally {
    downloadWhat.textContent = label;
    downloadAllButton.disabled = false;
  }
};

const clearAll = () => {
  if (queueRunning) return;
  queue.length = 0;
  Array.from(items.values()).forEach(removeItem);
  imageList.textContent = '';
  showNotice('');
  updateView();
};

const openFileDialog = () => fileInput.click();

// --- Wire up the UI ----------------------------------------------------------------

chooseButton.addEventListener('click', (event) => {
  event.stopPropagation();
  openFileDialog();
});

dropZone.addEventListener('click', (event) => {
  if (event.target === fileInput) return;
  openFileDialog();
});

addMoreButton.addEventListener('click', openFileDialog);

fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});

// Images can be dropped anywhere on the tool, whatever card is shown.
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
  addFiles(event.dataTransfer.files);
});

// A file dropped next to the tool would make the browser navigate to it,
// discarding every compressed result on the page.
const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragover', (event) => {
  if (hasDraggedFiles(event)) event.preventDefault();
});
window.addEventListener('drop', (event) => {
  if (hasDraggedFiles(event) && !tool.contains(event.target)) event.preventDefault();
});

qualityGroup.addEventListener('change', (event) => {
  if (event.target && event.target.name === 'quality') {
    selectQuality(event.target.value);
    updateView();
  }
});

recompressButton.addEventListener('click', () => requeue(jpegsAtOtherQuality()));

smallerButton.addEventListener('click', () => {
  const next = QUALITY_ORDER[QUALITY_ORDER.indexOf(quality) + 1];
  if (!next) return;
  selectQuality(next);
  requeue(jpegsAtOtherQuality());
});

cancelButton.addEventListener('click', cancelQueue);
downloadAllButton.addEventListener('click', downloadAll);
clearAllButton.addEventListener('click', clearAll);

// Leaving the page while images are being compressed loses the work.
window.addEventListener('beforeunload', (event) => {
  if (!queueRunning) return;
  event.preventDefault();
  event.returnValue = '';
});

selectQuality(loadSavedQuality(), { persist: false });
updateView();
