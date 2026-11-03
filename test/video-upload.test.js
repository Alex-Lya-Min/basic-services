'use strict';

// Video compressor: one card that changes state (empty → working → done /
// error), quality presets, cancel, "make it smaller" and engine download
// feedback (0.0.21D).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MockElement, createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const run = (context, code) => vm.runInContext(code, context);
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];
const MB = 1024 * 1024;

// A streamed response whose chunks are released by the test.
function streamedResponse(chunks) {
  const queue = chunks.slice();
  const waiting = [];
  let flowing = false;
  const next = () => {
    const chunk = queue.shift();
    return chunk ? { done: false, value: chunk } : { done: true, value: undefined };
  };
  return {
    response: {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          read: () => (flowing ? Promise.resolve(next()) : new Promise((resolve) => waiting.push(resolve))),
          cancel: async () => {}
        })
      }
    },
    release() {
      const resolve = waiting.shift();
      if (resolve) resolve(next());
    },
    // Reject pending reads, like a browser does after AbortController.abort().
    abort() {
      while (waiting.length) {
        waiting.shift()(Promise.reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
      }
    },
    finish() {
      flowing = true;
      while (waiting.length) this.release();
    }
  };
}

// exec: list of { code, logs, hang } answers for consecutive exec() calls.
function loadVideo({ wasmResponse, outputBytes = 4 * MB, exec = [], timers, storage } = {}) {
  const instances = [];
  const execArgs = [];
  class FakeFFmpeg {
    constructor() {
      this.handlers = {};
      this.terminated = false;
      instances.push(this);
    }
    on(type, handler) {
      this.handlers[type] = handler;
    }
    async load() {}
    async writeFile() {}
    exec(args) {
      execArgs.push(args);
      const step = exec.shift() || {};
      if (step.onStart) step.onStart();
      (step.logs || []).forEach((message) => this.handlers.log({ type: 'stderr', message }));
      if (step.hang) return new Promise(() => {});
      this.handlers.progress({ progress: 0.5 });
      return Promise.resolve(step.code === undefined ? 0 : step.code);
    }
    async readFile() {
      return new Uint8Array(outputBytes);
    }
    async deleteFile() {}
    terminate() {
      this.terminated = true;
    }
  }

  const fetch = async (url) => {
    if (String(url).endsWith('.wasm') && wasmResponse) return wasmResponse;
    return { ok: true, status: 200, body: null, arrayBuffer: async () => new ArrayBuffer(8) };
  };

  const browser = createBrowserContext({
    globals: {
      ...(timers ? timers.globals : {}),
      FFmpegWASM: { FFmpeg: FakeFFmpeg },
      fetch,
      URL: Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL() {} })
    }
  });
  if (storage) browser.context.localStorage = storage;
  browser.document.title = 'Video Compressor | LYMN Web Tools';
  browser.context.globalThis = browser.context;

  // Quality radios inside the fieldset.
  const options = {};
  const radios = ['small', 'balanced', 'better', 'custom'].map((value) => {
    const radio = new MockElement(`quality-${value}`);
    radio.name = 'quality';
    radio.value = value;
    radio.checked = value === 'balanced';
    options[value] = new MockElement(`option-${value}`);
    radio.closest = () => options[value];
    return radio;
  });
  browser.getElement('qualityGroup').queryAllResult = radios;

  vm.createContext(browser.context);
  const source = read('video-compressor/script.js')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'));
  vm.runInContext(source, browser.context, { filename: 'video-compressor/script.js' });
  return { ...browser, instances, execArgs, radios, options };
}

const video = (name, size = 10 * MB, type = 'video/mp4') => ({
  name,
  type,
  size,
  arrayBuffer: async () => new ArrayBuffer(16)
});

const crfOf = (args) => Number(args[args.indexOf('-crf') + 1]);

test('the page starts with the drop card and the quality choice', () => {
  const { getElement, radios, options } = loadVideo();
  assert.equal(getElement('tool').dataset.state, 'empty');
  assert.equal(getElement('dropZone').hidden, false);
  assert.equal(getElement('qualityGroup').hidden, false);
  for (const id of ['jobCard', 'qualitySummary', 'resultCard', 'errorCard']) {
    assert.equal(getElement(id).hidden, true, `${id} hidden`);
  }
  assert.equal(radios[1].checked, true);
  assert.ok(options.balanced.classList.contains('is-selected'));
  assert.equal(getElement('qualityNote').textContent, 'Recommended for most videos');
});

test('adding an mp4 shows the progress card at once, then the result card', async () => {
  const { context, getElement } = loadVideo();
  context.__files = [video('trip.mp4')];

  const running = run(context, 'handleFiles(__files)');
  assert.equal(getElement('tool').dataset.state, 'working', 'working state is shown immediately');
  assert.equal(getElement('dropZone').hidden, true);
  assert.equal(getElement('jobCard').hidden, false);
  assert.equal(getElement('jobName').textContent, 'trip.mp4');
  assert.equal(getElement('jobMeta').textContent, '10 MB');
  assert.equal(getElement('qualitySummary').hidden, false);
  assert.equal(getElement('qualitySummaryName').textContent, 'Balanced');

  await running;
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(getElement('resultCard').hidden, false);
  assert.equal(getElement('jobCard').hidden, true);
  assert.equal(getElement('resultTitle').textContent, 'Your video is ready');
  assert.equal(getElement('savingsLabel').textContent, 'Smaller by');
  assert.equal(getElement('savingsValue').textContent, '60%');
  assert.equal(getElement('beforeSize').textContent, '10 MB');
  assert.equal(getElement('afterSize').textContent, '4.0 MB');
  assert.equal(getElement('afterFill').style.width, '40%');
  assert.equal(getElement('downloadSize').textContent, '4.0 MB');
  assert.equal(getElement('downloadLink').hidden, false);
  assert.equal(getElement('downloadLink').download, 'trip.min.mp4');
  assert.match(getElement('resultStats').textContent, /^Saved 6\.0 MB · took \d+ s$/);
  assert.equal(getElement('smallerHint').hidden, false);
  assert.match(getElement('liveStatus').textContent, /^Done\./);
});

test('steps move from engine to reading to compressing', async () => {
  let atExec = null;
  const browser = loadVideo({
    exec: [{
      onStart: () => {
        const el = (id) => browser.getElement(id);
        atExec = {
          engine: el('stepEngine').classList.contains('is-done'),
          read: el('stepRead').classList.contains('is-done'),
          compress: el('stepCompress').classList.contains('is-current'),
          aria: el('stepCompress').getAttribute('aria-current')
        };
      }
    }]
  });
  browser.context.__files = [video('a.mp4')];
  await run(browser.context, 'handleFiles(__files)');
  assert.deepEqual(atExec, { engine: true, read: true, compress: true, aria: 'step' });
});

test('resolution, HDR, duration and output size are read from ffmpeg', async () => {
  const logs = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input.mov':",
    '  Duration: 00:00:32.04, start: 0.000000, bitrate: 37000 kb/s',
    '  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 3840x2160, 36000 kb/s, 30 fps',
    '      displaymatrix: rotation of -90.00 degrees',
    "Output #0, mp4, to 'output.mp4':",
    '  Stream #0:0(und): Video: h264 (avc1 / 0x31637661), yuv420p(tv, bt2020nc/bt2020/arib-std-b67, progressive), 2160x3840, q=2-31, 30 fps'
  ];
  const { context, getElement } = loadVideo({ exec: [{ logs }] });
  context.__files = [video('IMG_4821.MOV', 148 * MB, 'video/quicktime')];
  await run(context, 'handleFiles(__files)');
  assert.equal(getElement('jobMeta').textContent, '148 MB · 4K HDR · 0:32');
  assert.equal(getElement('resultSub').textContent, 'IMG_4821.min.mp4 · H.264 MP4 · 2160 × 3840');
});

test('the chosen quality sets the CRF and is remembered', async () => {
  const { context, getElement, execArgs, radios, options } = loadVideo();
  await getElement('qualityGroup').dispatch('change', { target: radios[2] });
  assert.ok(options.better.classList.contains('is-selected'));
  assert.ok(!options.balanced.classList.contains('is-selected'));
  assert.equal(getElement('qualityNote').textContent, 'Sharper detail, bigger file');
  assert.equal(context.localStorage.getItem('videoCompressorQuality'), 'better');

  context.__files = [video('a.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.equal(crfOf(execArgs[0]), 23);

  // A new visit starts with the remembered choice.
  const again = loadVideo({ storage: context.localStorage });
  assert.equal(again.radios[2].checked, true);
  again.context.__files = [video('b.mp4')];
  await run(again.context, 'handleFiles(__files)');
  assert.equal(crfOf(again.execArgs[0]), 23);
});

test('Custom level maps 1–100 onto CRF 40–18', () => {
  const { context } = loadVideo();
  assert.equal(run(context, 'levelToCrf(1)'), 40);
  assert.equal(run(context, 'levelToCrf(100)'), 18);
  assert.equal(run(context, 'levelToCrf(55)'), 28);
  assert.equal(run(context, 'crfToLevel(28)'), 55);
});

test('Custom shows a level slider that drives the CRF and is remembered', async () => {
  const browser = loadVideo();
  const { context, getElement, execArgs } = browser;
  assert.equal(getElement('qualityCustom').hidden, true);

  await getElement('qualityGroup').dispatch('change', { target: browser.radios[3] });
  assert.equal(getElement('qualityCustom').hidden, false);
  assert.equal(getElement('customQuality').value, '55', 'starts from Balanced (CRF 28)');
  assert.match(getElement('qualityNote').textContent, /^Your own level/);

  getElement('customQuality').value = '100';
  await getElement('customQuality').dispatch('input');
  assert.equal(getElement('customQualityValue').textContent, '100');
  assert.equal(context.localStorage.getItem('videoCompressorCustomLevel'), '100');

  context.__files = [video('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  assert.equal(getElement('qualitySummaryName').textContent, 'Custom · 100');
  await running;
  assert.equal(crfOf(execArgs[0]), 18);

  // "Make it smaller" from a custom level goes to the next smaller preset.
  assert.equal(getElement('smallerHint').hidden, false);
  await getElement('smallerButton').dispatch('click');
  await flush();
  assert.equal(crfOf(execArgs[1]), 23, 'Better quality');

  const again = loadVideo({ storage: context.localStorage });
  assert.equal(again.getElement('customQuality').value, '100');
});

test('"Make it smaller" compresses again one step smaller, then disappears', async () => {
  const { context, getElement, execArgs } = loadVideo();
  context.__files = [video('a.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.equal(crfOf(execArgs[0]), 28);

  await getElement('smallerButton').dispatch('click');
  await flush();
  assert.equal(execArgs.length, 2);
  assert.equal(crfOf(execArgs[1]), 32);
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(getElement('smallerHint').hidden, true, 'already the smallest preset');
  assert.equal(context.localStorage.getItem('videoCompressorQuality'), 'small');
});

test('Cancel stops the encoder and returns to the start', async () => {
  const { context, getElement, instances } = loadVideo({ exec: [{ hang: true }] });
  context.__files = [video('long.mov', 200 * MB, 'video/quicktime')];
  const running = run(context, 'handleFiles(__files)');
  await flush();
  assert.equal(getElement('tool').dataset.state, 'working');

  await getElement('cancelButton').dispatch('click');
  await running;
  assert.equal(instances[0].terminated, true, 'the encoder is stopped');
  assert.equal(getElement('tool').dataset.state, 'empty');
  assert.equal(getElement('dropNotice').textContent, 'Compression cancelled.');
  assert.equal(run(context, 'isProcessing'), false);

  // The next video loads a fresh engine.
  context.__files = [video('short.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.equal(instances.length, 2);
  assert.equal(getElement('tool').dataset.state, 'done');
});

test('a result that is not smaller says so honestly', async () => {
  const { context, getElement } = loadVideo({ outputBytes: 12 * MB });
  context.__files = [video('tiny.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.equal(getElement('resultTitle').textContent, 'Done, but it didn’t get smaller');
  assert.equal(getElement('savingsLabel').textContent, 'Size change');
  assert.equal(getElement('savingsValue').textContent, '+20%');
  assert.match(getElement('resultStats').textContent, /you can keep the original file/);
});

test('an unsupported file gets a notice and keeps the current video', async () => {
  const { context, getElement } = loadVideo();
  context.__files = [video('first.mp4')];
  await run(context, 'handleFiles(__files)');

  context.__files = [video('clip.avi', 1000, 'video/x-msvideo')];
  assert.equal(run(context, 'handleFiles(__files)'), null);
  const notice = getElement('dropNotice');
  assert.equal(notice.hidden, false);
  assert.ok(notice.classList.contains('error'));
  assert.match(notice.textContent, /"clip\.avi" is not a supported video\. Use mp4 or mov.*Still using "first\.mp4"/);
  assert.equal(getElement('tool').dataset.state, 'done', 'the finished result stays on screen');
});

test('files added during compression are refused until it finishes', async () => {
  const { context, getElement, fileInput } = Object.assign(loadVideo(), {});
  context.__files = [video('first.mp4')];
  const running = run(context, 'handleFiles(__files)');
  context.__files = [video('second.mp4')];
  run(context, 'handleFiles(__files)');
  assert.match(getElement('dropNotice').textContent, /Please wait until the current video is finished/);

  await getElement('chooseButton').dispatch('click');
  assert.equal(getElement('videoInput').clickCalls, 0, 'no file dialog while busy');

  await running;
  assert.equal(getElement('downloadLink').download, 'first.min.mp4');
  assert.equal(getElement('dropNotice').hidden, true, 'the "please wait" notice goes away when done');
  await getElement('anotherButton').dispatch('click');
  assert.equal(getElement('videoInput').clickCalls, 1, '"Compress another video" opens the file dialog');
  void fileInput;
});

test('engine download shows real progress in megabytes', async () => {
  const chunk = (size, first = false) => {
    const bytes = new Uint8Array(size);
    if (first) bytes.set(WASM_MAGIC);
    return bytes;
  };
  const stream = streamedResponse([chunk(8 * MB, true), chunk(8 * MB)]);
  const { context, getElement } = loadVideo({ wasmResponse: stream.response });
  context.__files = [video('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();

  assert.ok(getElement('stepEngine').classList.contains('is-current'));
  stream.release();
  await flush();
  assert.equal(getElement('progressNote').textContent, 'Loading the engine · 8.0 MB of 30 MB');
  assert.equal(getElement('progressValue').textContent, '26%');
  assert.equal(getElement('progressFill').style.width, '26%');

  stream.finish();
  await running;
  assert.equal(getElement('tool').dataset.state, 'done');
});

test('an HTML error page instead of the engine is reported clearly', async () => {
  const html = new TextEncoder().encode('<!DOCTYPE html><title>404</title>');
  const stream = streamedResponse([html]);
  const { context, getElement } = loadVideo({ wasmResponse: stream.response });
  context.__files = [video('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();
  stream.finish();
  await running;
  assert.equal(getElement('tool').dataset.state, 'error');
  assert.equal(getElement('errorTitle').textContent, 'The compression engine didn’t load');
  assert.match(getElement('errorMessage').textContent, /not a WebAssembly file/);
});

test('a stalled engine download fails with a message instead of hanging', async () => {
  let nextId = 1;
  const pending = new Map();
  const timers = {
    globals: {
      setTimeout: (callback, delay) => {
        const id = nextId++;
        pending.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => pending.delete(id)
    }
  };
  const stream = streamedResponse([]);
  const browser = loadVideo({ wasmResponse: stream.response, timers });
  const { context, getElement } = browser;
  context.__files = [video('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();

  const stall = [...pending.values()].find((timer) => timer.delay === 30000);
  assert.ok(stall, 'stall timer armed');
  stall.callback();
  stream.abort();
  await running;

  assert.equal(getElement('tool').dataset.state, 'error');
  assert.equal(getElement('errorTitle').textContent, 'The compression engine didn’t load');
  assert.match(getElement('errorMessage').textContent, /stopped downloading/);
  assert.equal(run(context, 'isProcessing'), false);
});

test('Try again runs the same video again after an error', async () => {
  const { context, getElement, execArgs } = loadVideo({
    exec: [{ code: 1, logs: ['Error while decoding stream #0:0', 'Conversion failed!'] }, {}]
  });
  context.__files = [video('clip.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.equal(getElement('tool').dataset.state, 'error');
  assert.equal(getElement('errorTitle').textContent, 'Something went wrong');
  assert.match(getElement('errorLog').textContent, /Conversion failed!/);

  await getElement('retryButton').dispatch('click');
  await flush();
  assert.equal(execArgs.length, 2);
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(getElement('downloadLink').download, 'clip.min.mp4');
});

test('the tab title shows progress while compressing', async () => {
  const titles = [];
  const browser = loadVideo({ exec: [{ onStart: () => titles.push('exec') }] });
  let title = browser.document.title;
  Object.defineProperty(browser.document, 'title', {
    get: () => title,
    set: (value) => {
      title = value;
      titles.push(value);
    }
  });
  browser.context.__files = [video('a.mp4')];
  await run(browser.context, 'handleFiles(__files)');
  assert.ok(titles.includes('50% · Compressing… · Video Compressor | LYMN Web Tools'), titles.join(' | '));
  assert.equal(title, 'Done · Video Compressor | LYMN Web Tools');
});

test('leaving the page during compression asks for confirmation', async () => {
  const { context, windowListeners } = loadVideo({ exec: [{ hang: true }] });
  const beforeUnload = windowListeners.get('beforeunload')[0];
  const idle = { preventDefault() { this.prevented = true; } };
  beforeUnload(idle);
  assert.equal(idle.prevented, undefined);

  context.__files = [video('a.mp4')];
  run(context, 'handleFiles(__files)');
  await flush();
  const busy = { preventDefault() { this.prevented = true; } };
  beforeUnload(busy);
  assert.equal(busy.prevented, true);
});

test('page markup: one tool with cards instead of numbered steps', () => {
  const html = read('video-compressor/index.html');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/tool\.css">/);
  assert.match(html, /<main class="tool" id="tool" data-state="empty">/);
  assert.match(html, /<section class="drop-card" id="dropZone"/);
  assert.match(html, /<button type="button" class="btn btn-primary" id="chooseButton">Choose video<\/button>/);
  for (const id of ['jobCard', 'resultCard', 'errorCard']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*hidden`), `${id} starts hidden`);
  }
  assert.match(html, /<a class="btn btn-primary btn-lg" id="downloadLink"[^>]*\bhidden\b/);
  assert.equal((html.match(/name="quality"/g) || []).length, 4, 'three presets and Custom');
  assert.match(html, /value="custom"><span>Custom<\/span>/);
  assert.match(html, /<div class="quality-custom" id="qualityCustom" hidden>/);
  assert.match(html, /<input type="range" id="customQuality" min="1" max="100"/);
  assert.equal((html.match(/<li><svg class="icon"/g) || []).length, 3, 'three short chips');
  assert.doesNotMatch(html, /class="drop-or"/);
  assert.doesNotMatch(html, /step-number|Preset that will be used|Practical limits/);
  assert.match(read('styles.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});
