// Compression worker: runs MozJPEG and OxiPNG (jSquash builds) off the main
// thread. Codec modules are imported lazily from esm.sh on first use, so the
// page itself loads without touching the CDN.

const JPEG_MODULE_URL = 'https://esm.sh/@jsquash/jpeg@1.6.0';
const OXIPNG_MODULE_URL = 'https://esm.sh/@jsquash/oxipng@2.3.0';

// Lossless PNG effort level (1–6); 3 is a good speed/size balance.
const PNG_OPTIMISATION_LEVEL = 3;

let jpegModulePromise = null;
let oxipngModulePromise = null;

const loadJpegModule = () => {
  if (!jpegModulePromise) {
    jpegModulePromise = import(JPEG_MODULE_URL);
    // A failed CDN fetch should not poison later retries.
    jpegModulePromise.catch(() => {
      jpegModulePromise = null;
    });
  }
  return jpegModulePromise;
};

const loadOxipngModule = () => {
  if (!oxipngModulePromise) {
    oxipngModulePromise = import(OXIPNG_MODULE_URL);
    oxipngModulePromise.catch(() => {
      oxipngModulePromise = null;
    });
  }
  return oxipngModulePromise;
};

// phase 'loading' = downloading the codec (can hang on a bad network, so the
// page puts a time limit on it); 'working' = the codec is encoding, which may
// legitimately take long for big images and has no time limit.
const postStage = (id, stage, phase) => {
  self.postMessage({ id, status: 'stage', stage, phase });
};

self.addEventListener('message', async (event) => {
  const { id, kind, buffer, quality } = event.data;

  try {
    let output;

    if (kind === 'jpeg') {
      postStage(id, 'Loading MozJPEG codec…', 'loading');
      const { decode, encode } = await loadJpegModule();
      postStage(id, 'Compressing…', 'working');
      const imageData = await decode(buffer);
      output = await encode(imageData, { quality });
    } else if (kind === 'png') {
      postStage(id, 'Loading OxiPNG codec…', 'loading');
      const { optimise } = await loadOxipngModule();
      postStage(id, 'Optimising…', 'working');
      output = await optimise(buffer, { level: PNG_OPTIMISATION_LEVEL });
    } else {
      throw new Error(`Unsupported image kind: ${kind}`);
    }

    if (!output || output.byteLength === 0) {
      throw new Error('Codec produced an empty file.');
    }

    self.postMessage({ id, status: 'done', buffer: output }, [output]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ id, status: 'error', message });
  }
});
