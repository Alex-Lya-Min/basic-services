const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();
const coreURL = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const wasmURL = new URL('./vendor/ffmpeg-core.wasm', import.meta.url).toString();

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

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoadPromise = null;
let progressHandlerAttached = false;
let currentFile = null;
let isProcessing = false;
let currentDownloadUrl = null;

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

const getFFmpegClass = () => {
  if (window.FFmpegWASM?.FFmpeg) return window.FFmpegWASM.FFmpeg;
  if (window.FFmpegWasm?.FFmpeg) return window.FFmpegWasm.FFmpeg;
  if (window.FFmpeg) return window.FFmpeg;
  return null;
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
  engineLoader.hidden = !show;
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
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }
};

const attachProgressHandler = () => {
  if (!ffmpeg || typeof ffmpeg.on !== 'function' || progressHandlerAttached) {
    return;
  }
  progressHandlerAttached = true;
  ffmpeg.on('progress', ({ progress }) => {
    if (!Number.isFinite(progress)) {
      return;
    }
    const clampedProgress = Math.min(1, Math.max(0, progress));
    progressBar.value = clampedProgress;
    const percent = Math.min(100, Math.max(0, Math.round(clampedProgress * 100)));
    progressLabel.textContent = `Compressing… ${percent}%`;
  });
};

const ensureFFmpegLoaded = async () => {
  if (ffmpegLoaded) {
    return;
  }

  if (!ffmpegLoadPromise) {
    const FFmpegClass = getFFmpegClass();
    if (!FFmpegClass) {
      throw new Error(
        `FFmpeg could not initialize because the UMD build is missing. Expected: ${expectedFfmpegScriptUrl}`,
      );
    }

    ffmpeg = new FFmpegClass();
    attachProgressHandler();

    ffmpegLoadPromise = (async () => {
      showEngineLoader(true, 'Loading compression engine…');
      progressLabel.textContent = 'Loading ffmpeg engine…';
      try {
        await ffmpeg.load({ coreURL, wasmURL });
        ffmpegLoaded = true;
      } catch (error) {
        ffmpegLoaded = false;
        throw error;
      } finally {
        showEngineLoader(false);
      }
    })();
  }

  await ffmpegLoadPromise;
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
  updateSelectedFile();
  resultMessage.textContent = 'Choose a preset and click "Compress video" to start.';
  toggleUploadStatus(false);
};

const getPreset = () => {
  const form = document.getElementById('presetForm');
  const formData = new FormData(form);
  return formData.get('preset');
};

const safeDelete = async (fileName) => {
  if (!ffmpeg || !fileName) return;
  try {
    await ffmpeg.deleteFile(fileName);
  } catch (error) {
    // ignore cleanup errors
  }
};

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

    progressBar.value = 0;
    progressLabel.textContent = 'Preparing…';

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    toggleUploadStatus(true, 'Copying file to encoder…');
    const fileBuffer = new Uint8Array(await currentFile.arrayBuffer());
    await ffmpeg.writeFile(inputName, fileBuffer);
    toggleUploadStatus(false, '');

    const command = preset === 'webm'
      ? ['-y', '-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-y', '-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    await ffmpeg.exec(command);

    const data = await ffmpeg.readFile(outputName);
    if (!data) {
      throw new Error('Compression failed to produce an output file.');
    }

    const mime = preset === 'webm' ? 'video/webm' : 'video/mp4';
    const blob = new Blob([data.buffer ?? data], { type: mime });
    const url = URL.createObjectURL(blob);

    currentDownloadUrl = url;
    downloadLink.href = url;
    downloadLink.download = preset === 'webm' ? 'compressed.webm' : 'compressed.mp4';
    downloadLink.hidden = false;
    resultMessage.textContent = 'Done! Click the button below to download the compressed video.';
    progressLabel.textContent = 'Complete ✅';
  } catch (error) {
    console.error(error);
    progressBar.value = 0;
    if (!ffmpegLoaded) {
      progressLabel.textContent = 'Unable to load ffmpeg.wasm';
      resultMessage.textContent = 'Compression engine failed to load. Please refresh the page.';
    } else {
      resultMessage.textContent = 'Something went wrong while compressing the file. Please try again or refresh the page.';
      progressLabel.textContent = 'Error';
    }
    toggleUploadStatus(false);
  } finally {
    isProcessing = false;
    startButton.disabled = false;
    showEngineLoader(false);
    toggleUploadStatus(false);
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
