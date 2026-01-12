// ffmpeg.js is loaded as a UMD script in index.html and exposes globals.
const expectedFfmpegScriptUrl = new URL('./vendor/ffmpeg.js', import.meta.url).toString();
function getFFmpegUMD() {
  if (window.FFmpeg) return window.FFmpeg;
  if (window.FFmpegWASM?.FFmpeg) return window.FFmpegWASM.FFmpeg;
  if (window.FFmpegWasm?.FFmpeg) return window.FFmpegWasm.FFmpeg;
  return null;
}
let createFFmpeg;
let fetchFile;

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

const attachProgressHandler = () => {
  if (!ffmpeg || typeof ffmpeg.on !== 'function') {
    return;
  }
  if (progressHandlerAttached) {
    return;
  }
  progressHandlerAttached = true;
  ffmpeg.on('progress', ({ progress }) => {
    if (!Number.isFinite(progress)) {
      return;
    }
    progressBar.value = Math.min(1, Math.max(0, progress));
    const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
    progressLabel.textContent = `Compressing… ${percent}%`;
  });
};

const ensureFFmpegLoaded = async () => {
  const FF = getFFmpegUMD();
  if (!FF) {
    throw new Error(
      `FFmpeg could not initialize because the UMD build is missing. Expected: ${expectedFfmpegScriptUrl}`,
    );
  }
  ({ createFFmpeg, fetchFile } = FF);
  if (!ffmpeg && typeof createFFmpeg === 'function') {
    ffmpeg = createFFmpeg({
      corePath: CORE_PATH,
    });
    attachProgressHandler();
  }
  if (!ffmpeg) {
    throw new Error('Compression engine failed to initialize.');
  }
  if (ffmpegLoaded) {
    return;
  }

  showEngineLoader(true, 'Loading compression engine…');
  progressLabel.textContent = 'Loading ffmpeg engine…';

  try {
    if (ffmpeg) {
      await ffmpeg.load();
    }

    ffmpegLoaded = true;
  } catch (error) {
    console.error('Failed to load ffmpeg', error);
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

const runCompression = async () => {
  try {
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

    await ensureFFmpegLoaded();
    progressBar.value = 0;
    progressLabel.textContent = 'Preparing…';

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    toggleUploadStatus(true, 'Copying file to encoder…');
    const fileBuffer = fetchFile
      ? await fetchFile(currentFile)
      : new Uint8Array(await currentFile.arrayBuffer());
    if (ffmpeg) {
      ffmpeg.FS('writeFile', inputName, fileBuffer);
    }
    toggleUploadStatus(false);

    const command = preset === 'webm'
      ? ['-y', '-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-y', '-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    if (ffmpeg) {
      await ffmpeg.run(...command);
    }

    const data = ffmpeg ? ffmpeg.FS('readFile', outputName) : null;
    if (!data) {
      throw new Error('Compression failed to produce an output file.');
    }
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
    if (currentFile) {
      const cleanup = async (fileName) => {
        if (!fileName) return;
        try {
          if (ffmpeg && typeof ffmpeg.FS === 'function') {
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

updateSelectedFile();
