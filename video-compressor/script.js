// ffmpeg.js is loaded as a UMD script in index.html and exposes global `FFmpeg`
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();
let createFFmpeg;
let fetchFile;

if (typeof FFmpeg === 'undefined') {
  console.error(
    `FFmpeg UMD build is not available. Ensure the script loaded: ${expectedFfmpegScriptUrl}`,
  );
} else {
  ({ createFFmpeg, fetchFile } = FFmpeg);
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

const CORE_PATH = new URL('./vendor/ffmpeg-core.js', import.meta.url).toString();
const ffmpeg = createFFmpeg
  ? createFFmpeg({
    corePath: CORE_PATH,
  })
  : null;

if (!createFFmpeg) {
  progressLabel.textContent = 'Unable to load ffmpeg engine.';
  resultMessage.textContent = 'Compression engine failed to load. Please refresh the page.';
}
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

const ensureFFmpegLoaded = async () => {
  if (!ffmpeg) {
    console.error(
      `FFmpeg could not initialize because the UMD build is missing. Expected: ${expectedFfmpegScriptUrl}`,
    );
    progressLabel.textContent = 'Unable to load ffmpeg engine.';
    resultMessage.textContent = 'Compression engine failed to load. Please refresh the page.';
    return;
  }
  if (ffmpegLoaded) {
    return;
  }

  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading ffmpeg engine…';

  try {
    await ffmpeg.load();

    ffmpegLoaded = true;
  } catch (error) {
    console.error('Failed to load ffmpeg', error);
    progressLabel.textContent = 'Unable to load ffmpeg.wasm';
    resultMessage.textContent = 'ffmpeg.wasm could not be loaded. Please check your connection and refresh the page.';
    throw error;
  } finally {
    showEngineLoader(false);
  }
};

const resetDownloadState = () => {
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
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

ffmpeg.on('progress', ({ progress }) => {
  if (!Number.isFinite(progress)) {
    return;
  }
  progressBar.value = Math.min(1, Math.max(0, progress));
  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  progressLabel.textContent = `Compressing… ${percent}%`;
});

const runCompression = async () => {
  if (!currentFile || isProcessing) {
    resultMessage.textContent = currentFile ? 'Another compression is already running…' : 'Please choose a file first.';
    return;
  }
  if (!ffmpeg) {
    resultMessage.textContent = 'Compression engine failed to load. Please refresh the page.';
    progressLabel.textContent = 'Unable to load ffmpeg engine.';
    return;
  }

  try {
    isProcessing = true;
    startButton.disabled = true;
    resetDownloadState();
    progressBar.value = 0;
    progressLabel.textContent = 'Preparing…';

    await ensureFFmpegLoaded();
    progressLabel.textContent = 'Preparing…';

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    toggleUploadStatus(true, 'Copying file to encoder…');
    const fileBuffer = fetchFile
      ? await fetchFile(currentFile)
      : new Uint8Array(await currentFile.arrayBuffer());
    ffmpeg.FS('writeFile', inputName, fileBuffer);
    toggleUploadStatus(false);

    const command = preset === 'webm'
      ? ['-y', '-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-y', '-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    await ffmpeg.run(...command);

    const data = ffmpeg.FS('readFile', outputName);
    const mime = preset === 'webm' ? 'video/webm' : 'video/mp4';
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = preset === 'webm' ? 'compressed.webm' : 'compressed.mp4';
    downloadLink.hidden = false;
    resultMessage.textContent = 'Done! Click the button below to download the compressed video.';
    progressLabel.textContent = 'Complete ✅';
  } catch (error) {
    console.error(error);
    if (ffmpegLoaded) {
      resultMessage.textContent = 'Something went wrong while compressing the file. Please try again or refresh the page.';
    }
    progressLabel.textContent = 'Error';
    toggleUploadStatus(false);
  } finally {
    isProcessing = false;
    startButton.disabled = false;
    if (currentFile) {
      const cleanup = async (fileName) => {
        if (!fileName) return;
        try {
          if (typeof ffmpeg.FS === 'function') {
            ffmpeg.FS('unlink', fileName);
          }
        } catch (e) {
          // ignore
        }
      };
      await cleanup('input.mp4');
      await cleanup('output.mp4');
      await cleanup('output.webm');
    }
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

startButton.addEventListener('pointerdown', () => {
  if (!ffmpegLoaded) {
    ensureFFmpegLoaded().catch(() => {
      progressLabel.textContent = 'Unable to load ffmpeg. Check your connection and retry.';
    });
  }
});

updateSelectedFile();
