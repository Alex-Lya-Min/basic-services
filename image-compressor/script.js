// Image Compressor UI. Compression itself happens in worker.js (Web Worker),
// which runs the MozJPEG / OxiPNG wasm codecs so the page never blocks.

const MAX_FILES = 20;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('imageInput');
const statusLine = document.getElementById('statusLine');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const recompressButton = document.getElementById('recompressButton');
const resultsGrid = document.getElementById('resultsGrid');
const emptyState = document.getElementById('emptyState');
const overallWrapper = document.getElementById('overallProgressWrapper');
const overallProgress = document.getElementById('overallProgress');
const overallLabel = document.getElementById('overallLabel');
const downloadAllButton = document.getElementById('downloadAllButton');
const clearAllButton = document.getElementById('clearAllButton');

const items = new Map();
const queue = [];
let nextItemId = 1;
let queueRunning = false;
let worker = null;
let currentJob = null; // { id, finish } — one file is compressed at a time

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

// photo.jpg -> photo.min.jpg
const outputName = (name) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}.min`;
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

const setStatus = (message) => {
  statusLine.textContent = message;
};

const setItemStatus = (item, text, options = {}) => {
  const el = item.els.status;
  el.classList.toggle('error', Boolean(options.error));
  el.textContent = '';
  if (options.spinner) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner small';
    spinner.setAttribute('aria-hidden', 'true');
    el.appendChild(spinner);
  }
  el.appendChild(document.createTextNode(text));
};

const renderCard = (item) => {
  const card = document.createElement('article');
  card.className = 'image-card';
  card.innerHTML = `
        <div class="thumb-pair">
            <figure>
                <img class="thumb-before" alt="Original preview">
                <figcaption class="cap-before">Before · —</figcaption>
            </figure>
            <figure>
                <img class="thumb-after" alt="Compressed preview" hidden>
                <figcaption class="cap-after">After · —</figcaption>
            </figure>
        </div>
        <p class="file-name"></p>
        <p class="file-status"></p>
        <a class="primary ghost download-one" hidden>Download</a>
    `;

  item.els = {
    thumbBefore: card.querySelector('.thumb-before'),
    thumbAfter: card.querySelector('.thumb-after'),
    capBefore: card.querySelector('.cap-before'),
    capAfter: card.querySelector('.cap-after'),
    name: card.querySelector('.file-name'),
    status: card.querySelector('.file-status'),
    download: card.querySelector('.download-one')
  };

  item.els.thumbBefore.src = item.originalUrl;
  item.els.capBefore.textContent = `Before · ${friendlySize(item.file.size)}`;
  item.els.name.textContent = item.file.name;
  item.els.name.title = item.file.name;
  setItemStatus(item, 'Queued…');

  resultsGrid.appendChild(card);
};

const updateOverall = () => {
  const total = items.size;
  let finished = 0;
  items.forEach((item) => {
    if (item.status === 'done' || item.status === 'error') finished += 1;
  });
  overallWrapper.hidden = total === 0;
  overallProgress.value = total === 0 ? 0 : finished / total;
  overallLabel.textContent = total === 0 ? '' : `Processed ${finished} of ${total}`;
};

const updateControls = () => {
  let anyDone = false;
  let anyRedoableJpeg = false;
  items.forEach((item) => {
    if (item.status === 'done') anyDone = true;
    if (item.kind === 'jpeg' && (item.status === 'done' || item.status === 'error')) {
      anyRedoableJpeg = true;
    }
  });
  downloadAllButton.disabled = !anyDone;
  clearAllButton.disabled = items.size === 0;
  recompressButton.disabled = !anyRedoableJpeg;
  emptyState.hidden = items.size !== 0;
};

const finishJob = (id) => {
  if (currentJob && currentJob.id === id) {
    const { finish } = currentJob;
    currentJob = null;
    finish();
  }
  updateOverall();
  updateControls();
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
  item.resultUrl = URL.createObjectURL(blob);
  item.status = 'done';

  item.els.thumbAfter.src = item.resultUrl;
  item.els.thumbAfter.hidden = false;
  item.els.capAfter.textContent = `After · ${friendlySize(blob.size)}`;

  const statusEl = item.els.status;
  statusEl.classList.remove('error');
  statusEl.textContent = '';
  const savings = document.createElement('span');
  if (keptOriginal) {
    savings.className = 'savings zero';
    savings.textContent = '0%';
    statusEl.appendChild(savings);
    statusEl.appendChild(document.createTextNode(' Already optimized — original kept.'));
  } else {
    const savedPct = (1 - blob.size / originalSize) * 100;
    savings.className = 'savings positive';
    savings.textContent = `−${savedPct.toFixed(savedPct >= 10 ? 0 : 1)}%`;
    statusEl.appendChild(savings);
    statusEl.appendChild(
      document.createTextNode(` ${friendlySize(originalSize)} → ${friendlySize(blob.size)}`)
    );
  }

  item.els.download.href = item.resultUrl;
  item.els.download.download = outputName(item.file.name || `image-${item.id}`);
  item.els.download.hidden = false;
};

const onWorkerMessage = (event) => {
  const { id, status, stage, buffer, message } = event.data;
  const item = items.get(id);

  if (status === 'stage') {
    if (item && item.status === 'processing') {
      setItemStatus(item, stage, { spinner: true });
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
  if (currentJob) {
    const item = items.get(currentJob.id);
    if (item) {
      failItem(item, 'Compression engine failed to load. Check your network connection and reload the page.');
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
  setItemStatus(item, 'Reading file…', { spinner: true });
  currentJob = { id: item.id, finish };

  item.file.arrayBuffer()
    .then((buffer) => {
      getWorker().postMessage(
        { id: item.id, kind: item.kind, buffer, quality: Number(qualitySlider.value) },
        [buffer]
      );
    })
    .catch((error) => {
      failItem(item, `Could not read file: ${error.message}`);
      finishJob(item.id);
    });
});

const runQueue = async () => {
  if (queueRunning) return;
  queueRunning = true;
  while (queue.length > 0) {
    const id = queue.shift();
    const item = items.get(id);
    if (!item || item.status !== 'queued') continue;
    await compressItem(item);
  }
  queueRunning = false;
  updateControls();
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
      originalUrl: URL.createObjectURL(file),
      resultBlob: null,
      resultUrl: null,
      els: null
    };
    items.set(item.id, item);
    renderCard(item);
    queue.push(item.id);
    added += 1;
  }

  setStatus(rejected.length > 0 ? `Skipped: ${rejected.join('; ')}` : '');
  if (added > 0) runQueue();
  updateOverall();
  updateControls();
};

// --- Wire up the UI ---

qualitySlider.addEventListener('input', () => {
  qualityValue.textContent = qualitySlider.value;
});

fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
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
  addFiles(event.dataTransfer.files);
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

recompressButton.addEventListener('click', () => {
  let requeued = 0;
  items.forEach((item) => {
    if (item.kind !== 'jpeg' || (item.status !== 'done' && item.status !== 'error')) return;
    if (item.resultUrl) {
      URL.revokeObjectURL(item.resultUrl);
      item.resultUrl = null;
    }
    item.resultBlob = null;
    item.status = 'queued';
    item.els.thumbAfter.hidden = true;
    item.els.thumbAfter.removeAttribute('src');
    item.els.capAfter.textContent = 'After · —';
    item.els.download.hidden = true;
    setItemStatus(item, 'Queued…');
    queue.push(item.id);
    requeued += 1;
  });
  if (requeued > 0) {
    setStatus('');
    runQueue();
    updateOverall();
    updateControls();
  }
});

downloadAllButton.addEventListener('click', async () => {
  const done = [];
  items.forEach((item) => {
    if (item.status === 'done' && item.resultBlob) done.push(item);
  });
  if (done.length === 0) return;

  if (typeof JSZip === 'undefined') {
    setStatus('Could not load the JSZip library — check your network connection and reload the page.');
    return;
  }

  downloadAllButton.disabled = true;
  setStatus('Building zip…');
  try {
    const zip = new JSZip();
    const usedNames = new Set();
    for (const item of done) {
      let name = outputName(item.file.name || `image-${item.id}`);
      if (usedNames.has(name)) name = `${item.id}-${name}`;
      usedNames.add(name);
      zip.file(name, item.resultBlob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'compressed-images.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(`Zipped ${done.length} file(s).`);
  } catch (error) {
    setStatus(`Failed to build zip: ${error.message}`);
  } finally {
    downloadAllButton.disabled = false;
    updateControls();
  }
});

clearAllButton.addEventListener('click', () => {
  queue.length = 0;
  items.forEach((item) => {
    URL.revokeObjectURL(item.originalUrl);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
  });
  items.clear();
  resultsGrid.textContent = '';
  setStatus('');
  updateOverall();
  updateControls();
});

qualityValue.textContent = qualitySlider.value;
updateOverall();
updateControls();
