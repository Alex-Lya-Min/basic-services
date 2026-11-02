'use strict';

// Video compressor: visible feedback after a file is dropped (0.0.18D).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const run = (context, code) => vm.runInContext(code, context);
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

// A streamed response whose chunks are released by the test.
function streamedResponse(chunks, { contentLength = null } = {}) {
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
      headers: { get: (name) => (name === 'Content-Length' && contentLength !== null ? String(contentLength) : null) },
      body: {
        getReader: () => ({
          read: () => (flowing ? Promise.resolve(next()) : new Promise((resolve) => waiting.push(resolve))),
          cancel: async () => {}
        })
      }
    },
    release(count = 1) {
      for (let i = 0; i < count; i += 1) {
        const resolve = waiting.shift();
        if (!resolve) return;
        resolve(next());
      }
    },
    // Reject pending reads, like a browser does after AbortController.abort().
    abort() {
      while (waiting.length) {
        waiting.shift()(Promise.reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
      }
    },
    // Deliver everything that is left, including reads requested later.
    finish() {
      flowing = true;
      while (waiting.length) this.release();
    }
  };
}

function loadVideo({ wasmResponse, outputBytes = 3, timers } = {}) {
  const ffmpegCalls = [];
  class FakeFFmpeg {
    constructor() {
      this.handlers = {};
    }
    on(type, handler) {
      this.handlers[type] = handler;
    }
    async load(options) {
      ffmpegCalls.push(['load', options]);
    }
    async writeFile(name, data) {
      ffmpegCalls.push(['writeFile', name, data.length]);
    }
    async exec(args) {
      ffmpegCalls.push(['exec', args]);
      this.handlers.progress({ progress: 0.5 });
    }
    async readFile() {
      return new Uint8Array(outputBytes);
    }
    async deleteFile() {}
    terminate() {}
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
  browser.context.globalThis = browser.context;
  vm.createContext(browser.context);
  const source = read('video-compressor/script.js')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'));
  vm.runInContext(source, browser.context, { filename: 'video-compressor/script.js' });
  return { ...browser, ffmpegCalls };
}

const fakeVideo = (name, size = 10 * 1024 * 1024, type = 'video/mp4') => ({
  name,
  type,
  size,
  arrayBuffer: async () => new ArrayBuffer(16)
});

test('dropping an mp4 starts compression right away and shows progress under the drop zone', async () => {
  const { context, getElement, ffmpegCalls } = loadVideo({ outputBytes: 4 * 1024 * 1024 });
  const status = getElement('fileStatus');
  const dropZone = getElement('dropZone');
  context.__files = [fakeVideo('trip.mp4')];

  const running = run(context, 'handleFiles(__files)');
  assert.equal(status.dataset.state, 'busy', 'busy state is shown immediately');
  assert.ok(dropZone.classList.contains('busy'));
  assert.equal(getElement('dropTitle').textContent, 'Working… keep this tab open');
  assert.equal(getElement('selectedFile').textContent, 'trip.mp4 (10 MB)');

  await running;
  assert.deepEqual(ffmpegCalls.map((call) => call[0]), ['load', 'writeFile', 'exec']);
  assert.equal(status.dataset.state, 'done');
  assert.equal(getElement('statusText').textContent, 'Done!');
  assert.equal(getElement('statusDetail').textContent, '10 MB → 4.0 MB (−60%)');
  assert.equal(getElement('downloadLink').hidden, false);
  assert.equal(getElement('downloadLink').download, 'trip.min.mp4');
  assert.ok(!dropZone.classList.contains('busy'));
  assert.ok(dropZone.classList.contains('has-file'));
  assert.equal(getElement('dropTitle').textContent, 'Drop another video or click to replace');
});

test('compression progress is mirrored next to the drop zone', async () => {
  const { context, getElement } = loadVideo();
  const seen = [];
  const statusDetail = getElement('statusDetail');
  let detail = '';
  Object.defineProperty(statusDetail, 'textContent', {
    get: () => detail,
    set: (value) => {
      detail = value;
      seen.push(value);
    }
  });
  context.__files = [fakeVideo('a.mp4')];
  await run(context, 'handleFiles(__files)');
  assert.ok(seen.includes('50%'), `progress shown: ${seen.join(' | ')}`);
});

test('a non-mp4 file gets an error right under the drop zone and keeps the current file', async () => {
  const { context, getElement } = loadVideo();
  context.__files = [fakeVideo('first.mp4')];
  await run(context, 'handleFiles(__files)');

  context.__files = [fakeVideo('IMG_0001.MOV', 1000, 'video/quicktime')];
  const result = run(context, 'handleFiles(__files)');
  assert.equal(result, null, 'nothing is started');
  const notice = getElement('dropNotice');
  assert.equal(notice.hidden, false);
  assert.ok(notice.classList.contains('error'));
  assert.match(notice.textContent, /"IMG_0001\.MOV" is not an mp4 video.*Still using "first\.mp4"/);
  assert.equal(run(context, 'currentFile.name'), 'first.mp4');
});

test('a file dropped during compression is refused with a visible message', async () => {
  const { context, getElement } = loadVideo();
  context.__files = [fakeVideo('first.mp4')];
  const running = run(context, 'handleFiles(__files)');
  context.__files = [fakeVideo('second.mp4')];
  run(context, 'handleFiles(__files)');
  assert.match(getElement('dropNotice').textContent, /Please wait until the current video is finished/);
  await running;
  assert.equal(getElement('downloadLink').download, 'first.min.mp4');
  assert.equal(getElement('dropNotice').hidden, true, 'the "please wait" notice goes away when done');
});

test('the file dialog stays closed while a video is being compressed', async () => {
  const { context, getElement } = loadVideo();
  context.__files = [fakeVideo('first.mp4')];
  const running = run(context, 'handleFiles(__files)');
  let prevented = false;
  await getElement('videoInput').dispatch('click', { preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  await running;
  prevented = false;
  await getElement('videoInput').dispatch('click', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false, 'the dialog opens again once finished');
});

test('engine download shows real progress in megabytes', async () => {
  const chunk = (size, first = false) => {
    const bytes = new Uint8Array(size);
    if (first) bytes.set(WASM_MAGIC);
    return bytes;
  };
  const MB = 1024 * 1024;
  const stream = streamedResponse([chunk(8 * MB, true), chunk(8 * MB)]);
  const { context, getElement, ffmpegCalls } = loadVideo({ wasmResponse: stream.response });
  context.__files = [fakeVideo('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();

  assert.equal(getElement('statusText').textContent, 'Loading compression engine…');
  stream.release();
  await flush();
  assert.equal(getElement('statusDetail').textContent, '8.0 MB of 30 MB');
  assert.equal(getElement('statusFill').style.width, '26%');
  assert.equal(getElement('progressLabel').textContent, 'Loading engine… 26%');

  stream.finish();
  await running;
  const loadOptions = ffmpegCalls.find((call) => call[0] === 'load')[1];
  assert.equal(loadOptions.wasmURL, 'blob:test', 'the downloaded copy is used, not a second download');
  assert.equal(getElement('fileStatus').dataset.state, 'done');
});

test('an HTML error page instead of the engine is reported clearly', async () => {
  const html = new TextEncoder().encode('<!DOCTYPE html><title>404</title>');
  const stream = streamedResponse([html]);
  const { context, getElement } = loadVideo({ wasmResponse: stream.response });
  context.__files = [fakeVideo('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();
  stream.finish();
  await running;
  assert.equal(getElement('fileStatus').dataset.state, 'error');
  assert.match(getElement('statusText').textContent, /not a WebAssembly file/);
});

test('a stalled engine download fails with a message instead of hanging', async () => {
  let nextId = 1;
  const pending = new Map();
  const delays = [];
  const timers = {
    globals: {
      setTimeout: (callback, delay) => {
        const id = nextId++;
        pending.set(id, { callback, delay });
        delays.push(delay);
        return id;
      },
      clearTimeout: (id) => pending.delete(id)
    }
  };
  const stream = streamedResponse([]);
  const { context, getElement } = loadVideo({ wasmResponse: stream.response, timers });
  context.__files = [fakeVideo('a.mp4')];
  const running = run(context, 'handleFiles(__files)');
  await flush();

  const stall = [...pending.values()].find((timer) => timer.delay === 30000);
  assert.ok(stall, `stall timer armed (delays: ${delays})`);
  stall.callback(); // no data for 30 s
  stream.abort(); // the browser rejects the pending read
  await running;

  assert.equal(getElement('fileStatus').dataset.state, 'error');
  assert.match(getElement('statusText').textContent, /stopped downloading/);
  assert.equal(run(context, 'isProcessing'), false, 'a retry is possible');
});

test('hidden controls stay hidden even when a component sets display', () => {
  assert.match(read('styles.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(read('video-compressor/index.html'), /<a id="downloadLink"[^>]*\bhidden\b/);
});

test('the drop zone tells users compression starts automatically', () => {
  const html = read('video-compressor/index.html');
  assert.match(html, /id="dropHint">Compression starts automatically/);
  assert.match(html, /id="dropNotice" role="alert" hidden/);
  assert.match(html, /<div class="file-status" id="fileStatus" data-state="idle">/);
});
