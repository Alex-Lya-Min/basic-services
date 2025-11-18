import { createFFmpeg, fetchFile } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.4/dist/ffmpeg.min.js';

const startButton = document.getElementById('startButton');
const fileInput = document.getElementById('videoInput');
const dropZone = document.getElementById('dropZone');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const selectedFileLabel = document.getElementById('selectedFile');
const engineLoader = document.getElementById('engineLoader');
const downloadLink = document.getElementById('downloadLink');
const resultMessage = document.getElementById('resultMessage');

const ffmpeg = createFFmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js'
});
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

const showEngineLoader = (show) => {
  engineLoader.hidden = !show;
};

const ensureFFmpegLoaded = async () => {
  if (!ffmpeg.isLoaded()) {
    showEngineLoader(true);
    progressLabel.textContent = 'Loading ffmpeg engine…';
    await ffmpeg.load();
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
};

const getPreset = () => {
  const form = document.getElementById('presetForm');
  const formData = new FormData(form);
  return formData.get('preset');
};

const runCompression = async () => {
  if (!currentFile || isProcessing) {
    resultMessage.textContent = currentFile ? 'Another compression is already running…' : 'Please choose a file first.';
    return;
  }

  try {
    isProcessing = true;
    startButton.disabled = true;
    resetDownloadState();
    progressBar.value = 0;
    progressLabel.textContent = 'Preparing…';

    await ensureFFmpegLoaded();

    ffmpeg.setProgress(({ ratio }) => {
      if (Number.isFinite(ratio)) {
        progressBar.value = ratio;
        const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
        progressLabel.textContent = `Compressing… ${percent}%`;
      }
    });

    const inputName = 'input.mp4';
    const preset = getPreset();
    const outputName = preset === 'webm' ? 'output.webm' : 'output.mp4';

    ffmpeg.FS('writeFile', inputName, await fetchFile(currentFile));

    const command = preset === 'webm'
      ? ['-i', inputName, '-c:v', 'libvpx-vp9', '-b:v', '1.2M', '-crf', '32', '-deadline', 'good', '-c:a', 'libopus', outputName]
      : ['-i', inputName, '-c:v', 'libx264', '-preset', 'faster', '-crf', '28', '-c:a', 'copy', outputName];

    await ffmpeg.run(...command);

    const data = ffmpeg.FS('readFile', outputName);
    const mime = preset === 'webm' ? 'video/webm' : 'video/mp4';
    const blob = new Blob([data.buffer], { type: mime });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = preset === 'webm' ? 'compressed.webm' : 'compressed.mp4';
    downloadLink.hidden = false;
    resultMessage.textContent = 'Done! Click the button below to download the compressed video.';
    progressLabel.textContent = 'Complete ✅';
  } catch (error) {
    console.error(error);
    resultMessage.textContent = 'Something went wrong while compressing the file. Please try again or refresh the page.';
    progressLabel.textContent = 'Error';
  } finally {
    isProcessing = false;
    startButton.disabled = false;
    if (currentFile) {
      ffmpeg.FS('unlink', 'input.mp4');
      try {
        ffmpeg.FS('unlink', 'output.mp4');
      } catch (e) {}
      try {
        ffmpeg.FS('unlink', 'output.webm');
      } catch (e) {}
    }
  }
};

startButton.addEventListener('click', runCompression);

fileInput.addEventListener('change', (event) => handleFiles(event.target.files));

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

// Provide a button to kick off loading even before selecting a file
startButton.addEventListener('pointerdown', () => {
  if (!ffmpeg.isLoaded()) {
    ensureFFmpegLoaded().catch(() => {
      progressLabel.textContent = 'Unable to load ffmpeg. Check your connection and retry.';
    });
  }
});

updateSelectedFile();
