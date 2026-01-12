// ffmpeg.js is loaded as a UMD script in index.html and exposes globals.

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

const coreJsUrl = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const coreWasmUrl = new URL('./vendor/ffmpeg-core.wasm', import.meta.url).toString();
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegApiMode = null;
let progressHandlerAttached = false;

let currentFile = null;
let isProcessing = false;

console.info('[vc] script loaded');
console.info('[vc] ffmpeg globals', {
  FFmpeg: window.FFmpeg,
  FFmpegWASM: window.FFmpegWASM,
  FFmpegWasm: window.FFmpegWasm
});

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

const attachNamespaceProgressHandler = (instance) => {
  if (!instance || progressHandlerAttached) return;

  if (typeof instance.setProgress === 'function') {
    instance.setProgress(({ ratio }) => {
      if (!Number.isFinite(ratio)) return;
      const p = Math.min(1, Math.max(0, ratio));
      progressBar.value = p;
      progressLabel.textContent = `Compressing… ${Math.round(p * 100)}%`;
    });
    progressHandlerAttached = true;
    return;
  }

  if (typeof instance.on === 'function') {
    instance.on('progress', ({ ratio }) => {
      if (!Number.isFinite(ratio)) return;
      const p = Math.min(1, Math.max(0, ratio));
      progressBar.value = p;
      progressLabel.textContent = `Compressing… ${Math.round(p * 100)}%`;
    });
    progressHandlerAttached = true;
  }
};

const attachClassProgressHandler = (instance) => {
  if (!instance || typeof instance.on !== 'function' || progressHandlerAttached) return;
  progressHandlerAttached = true;

  instance.on('progress', ({ progress }) => {
    if (!Number.isFinite(progress)) return;
    const p = Math.min(1, Math.max(0, progress));
    progressBar.value = p;
    progressLabel.textContent = `Compressing… ${Math.round(p * 100)}%`;
  });
};

const fetchHead = async (url) => {
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  const buffer = await response.arrayBuffer();
  const prefix = new TextDecoder().decode(buffer.slice(0, 32)).trim().toLowerCase();
  if (prefix.startsWith('<!doctype') || prefix.startsWith('<html')) {
    throw new Error(`Unexpected HTML response for ${url}`);
  }
};

const resolveFfmpegNamespaceApi = () => {
  if (window.FFmpegWASM?.FFmpeg?.createFFmpeg) {
    return { namespace: window.FFmpegWASM.FFmpeg, mode: 'namespace' };
  }
  if (window.FFmpegWasm?.FFmpeg?.createFFmpeg) {
    return { namespace: window.FFmpegWasm.FFmpeg, mode: 'namespace' };
  }
  if (window.FFmpeg?.createFFmpeg) {
    return { namespace: window.FFmpeg, mode: 'namespace' };
  }
  return null;
};

const resolveFfmpegClassApi = () => {
  if (typeof window.FFmpegWASM?.FFmpeg === 'function' && window.FFmpegWASM.FFmpeg.prototype?.load) {
    return { ctor: window.FFmpegWASM.FFmpeg, mode: 'class' };
  }
  if (typeof window.FFmpeg === 'function') {
    return { ctor: window.FFmpeg, mode: 'class' };
  }
  return null;
};

const ensureFFmpegLoaded = async () => {
  if (ffmpegLoaded) return;

  const namespaceResult = resolveFfmpegNamespaceApi();
  const classResult = namespaceResult ? null : resolveFfmpegClassApi();

  if (!namespaceResult && !classResult) {
    throw new Error(
      `Compression engine failed to initialize. Expected ffmpeg UMD script at ${expectedFfmpegScriptUrl}`
    );
  }

  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading engine…';

  try {
    console.info('[vc] core urls', { coreJsUrl, coreWasmUrl });
    await fetchHead(coreJsUrl);
    await fetchHead(coreWasmUrl);

    if (namespaceResult) {
      const { createFFmpeg, fetchFile } = namespaceResult.namespace;
      ffmpeg = createFFmpeg({ corePath: coreJsUrl });
      ffmpegApiMode = 'namespace';
      attachNamespaceProgressHandler(ffmpeg);
      const loadPromise = ffmpeg.load();
      const loadTimeout = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `FFmpeg load timed out after 30 seconds. Check Network for ffmpeg-core.wasm at ${coreJsUrl} and ${coreWasmUrl}.`
            )
          );
        }, 30000);
        loadPromise.finally(() => clearTimeout(timer));
      });
      await Promise.race([loadPromise, loadTimeout]);
      ffmpeg.fetchFile = fetchFile;
    } else if (classResult) {
      ffmpeg = new classResult.ctor();
      ffmpegApiMode = 'class';
      attachClassProgressHandler(ffmpeg);
      const loadPromise = ffmpeg.load({ coreURL: coreJsUrl, wasmURL: coreWasmUrl });
      const loadTimeout = new Promise((_, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              `FFmpeg load timed out after 30 seconds. Check Network for ffmpeg-core.wasm at ${coreJsUrl} and ${coreWasmUrl}.`
            )
          );
        }, 30000);
        loadPromise.finally(() => clearTimeout(timer));
      });
      await Promise.race([loadPromise, loadTimeout]);
    }

    ffmpegLoaded = true;
  } finally {
    showEngineLoader(false);
  }
};

const handleFiles = (files) => {
  if (!files || files.length === 0) return;
  const [file] = files;

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
  if (ffmpegApiMode === 'class' && typeof ffmpeg.deleteFile === 'function') {
    try {
      await ffmpeg.deleteFile(name);
    } catch (_) {
      // ignore
    }
  }
}

const runCompression = async () => {
  console.info('[vc] runCompression clicked');

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

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    toggleUploadStatus(true, 'Copying file to encoder…');
    const fileBuffer = new Uint8Array(await currentFile.arrayBuffer());

    if (ffmpegApiMode === 'namespace') {
      if (!ffmpeg.fetchFile) {
        throw new Error('ffmpeg fetchFile helper is missing.');
      }
      ffmpeg.FS('writeFile', inputName, await ffmpeg.fetchFile(currentFile));
    } else {
      await ffmpeg.writeFile(inputName, fileBuffer);
    }

    toggleUploadStatus(false);

    const command = preset === 'webm'
      ? ['-y', '-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-y', '-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    progressBar.value = 0;
    progressLabel.textContent = 'Compressing… 0%';

    if (ffmpegApiMode === 'namespace') {
      await ffmpeg.run(...command);
    } else {
      await ffmpeg.exec(command);
    }

    const data = ffmpegApiMode === 'namespace'
      ? ffmpeg.FS('readFile', outputName)
      : await ffmpeg.readFile(outputName);

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

    if (ffmpegApiMode === 'namespace' && ffmpeg) {
      try {
        ffmpeg.FS('unlink', 'input.mp4');
      } catch (_) {
        // ignore
      }
      try {
        ffmpeg.FS('unlink', 'output.mp4');
      } catch (_) {
        // ignore
      }
      try {
        ffmpeg.FS('unlink', 'output.webm');
      } catch (_) {
        // ignore
      }
    }

    await safeDelete('input.mp4');
    await safeDelete('output.mp4');
    await safeDelete('output.webm');
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
