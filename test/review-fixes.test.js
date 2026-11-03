'use strict';

// Regression tests for the issues found in the independent review (0.0.17D).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MockElement, createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
const run = (context, code) => vm.runInContext(code, context);

// Timers that only fire when the test asks; records the requested delays.
function createManualTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    delays: [],
    globals: null,
    init() {
      this.globals = {
        setTimeout: (callback, delay) => {
          const id = nextId++;
          pending.set(id, callback);
          this.delays.push(delay);
          return id;
        },
        clearTimeout: (id) => {
          pending.delete(id);
        }
      };
      return this;
    },
    pendingCount: () => pending.size,
    runAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    }
  }.init();
}

// --- Image compressor: stalled codec download -------------------------------

function loadImageCompressor(timers) {
  const workers = [];
  class FakeWorker {
    constructor() {
      this.listeners = new Map();
      this.messages = [];
      this.terminated = false;
      workers.push(this);
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    reply(data) {
      this.listeners.get('message')({ data });
    }
  }
  const browser = createBrowserContext({
    globals: {
      ...timers.globals,
      Worker: FakeWorker,
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
    }
  });
  vm.createContext(browser.context);
  vm.runInContext(read('image-compressor/script.js'), browser.context, {
    filename: 'image-compressor/script.js'
  });
  return { ...browser, workers };
}

const fakeImage = (name) => ({
  name,
  type: 'image/png',
  size: 1000,
  arrayBuffer: async () => new ArrayBuffer(8)
});

test('a codec download that never finishes fails the file and frees the queue', async () => {
  const timers = createManualTimers();
  const { context, workers } = loadImageCompressor(timers);
  context.__files = [fakeImage('a.png'), fakeImage('b.png')];
  run(context, 'addFiles(__files)');
  await flush();

  assert.equal(workers.length, 1);
  workers[0].reply({ id: 1, status: 'stage', stage: 'Loading OxiPNG codec…', phase: 'loading' });
  assert.ok(timers.delays.includes(60000), 'the codec load is time-limited');

  timers.runAll(); // the import() never resolved
  await flush();

  assert.equal(run(context, 'items.get(1).status'), 'error');
  const statusText = run(context, 'items.get(1).els.status.children.map((node) => node.textContent).join("")');
  assert.match(statusText, /did not load in time/);
  assert.equal(workers[0].terminated, true, 'the stuck worker is discarded');
  assert.equal(workers.length, 2, 'the next file gets a fresh worker');
  assert.equal(workers[1].messages[0].id, 2);
});

test('a long encode is not cut off once the codec has loaded', async () => {
  const timers = createManualTimers();
  const { context, workers } = loadImageCompressor(timers);
  context.__files = [fakeImage('huge.png')];
  run(context, 'addFiles(__files)');
  await flush();

  workers[0].reply({ id: 1, status: 'stage', stage: 'Loading OxiPNG codec…', phase: 'loading' });
  workers[0].reply({ id: 1, status: 'stage', stage: 'Optimising…', phase: 'working' });
  assert.equal(timers.pendingCount(), 0, 'the load time limit is lifted');

  timers.runAll();
  assert.equal(run(context, 'items.get(1).status'), 'processing');
  assert.equal(workers[0].terminated, false);

  workers[0].reply({ id: 1, status: 'done', buffer: new ArrayBuffer(4) });
  assert.equal(run(context, 'items.get(1).status'), 'done');
});

test('worker reports which stages are codec loading and which are encoding', () => {
  const source = read('image-compressor/worker.js');
  const stages = [...source.matchAll(/postStage\(id, '([^']+)', '(\w+)'\)/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(stages, [
    ['Loading MozJPEG codec…', 'loading'],
    ['Compressing…', 'working'],
    ['Loading OxiPNG codec…', 'loading'],
    ['Optimising…', 'working']
  ]);
});

// --- Video compressor --------------------------------------------------------

function loadVideoCompressor({ timers, load, consoleSpy, fetchImpl } = {}) {
  class FakeFFmpeg {
    on() {}
    load() {
      return load ? load() : Promise.resolve();
    }
    async writeFile() {}
    async exec() {}
    async readFile() {
      return new Uint8Array([1]);
    }
    async deleteFile() {}
    terminate() {
      this.terminated = true;
    }
  }
  const browser = createBrowserContext({
    console: consoleSpy,
    globals: {
      ...(timers ? timers.globals : {}),
      FFmpegWASM: { FFmpeg: FakeFFmpeg },
      fetch: fetchImpl || (async () => ({ ok: true, status: 200, body: null, arrayBuffer: async () => new ArrayBuffer(8) })),
      URL: Object.assign(URL, { createObjectURL: () => 'blob:test' })
    }
  });
  browser.context.globalThis = browser.context;
  vm.createContext(browser.context);
  const source = read('video-compressor/script.js')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'));
  vm.runInContext(source, browser.context, { filename: 'video-compressor/script.js' });
  return browser;
}

const fakeVideo = (name) => ({ name, type: 'video/mp4', size: 1000, arrayBuffer: async () => new ArrayBuffer(8) });

test('video engine gets 120 seconds to load before an error is shown', async () => {
  const timers = createManualTimers();
  const { context, getElement } = loadVideoCompressor({ timers, load: () => new Promise(() => {}) });
  context.__files = [fakeVideo('clip.mp4')];
  const done = run(context, 'handleFiles(__files)');
  await flush();
  assert.ok(timers.delays.includes(120000), `start timeout among ${timers.delays}`);

  timers.runAll();
  await done;
  assert.equal(getElement('tool').dataset.state, 'error');
  assert.match(getElement('errorMessage').textContent, /did not start within 120 seconds/);
});

test('video compressor does not log debug output for every visitor', () => {
  const calls = [];
  const consoleSpy = {
    info: (...args) => calls.push(['info', ...args]),
    log: (...args) => calls.push(['log', ...args]),
    warn() {},
    error() {}
  };
  loadVideoCompressor({ consoleSpy });
  assert.deepEqual(calls, []);
  assert.doesNotMatch(read('video-compressor/script.js'), /console\.(info|log|debug)\(/);
});

test('video compressor says which file it took when several are dropped', () => {
  const { context, getElement } = loadVideoCompressor();
  context.__files = [fakeVideo('one.mp4'), fakeVideo('two.mp4'), fakeVideo('three.mp4')];
  run(context, 'handleFiles(__files)');
  assert.equal(run(context, 'currentFile.name'), 'one.mp4');
  assert.match(getElement('dropNotice').textContent, /using "one\.mp4".*2 file\(s\) were skipped/);
  assert.equal(getElement('dropNotice').hidden, false);
});

test('video compressor only uses the ffmpeg.wasm 0.12 class API it ships with', () => {
  const source = read('video-compressor/script.js');
  assert.doesNotMatch(source, /createFFmpeg|ffmpeg\.FS\(|fetchFile|setProgress/);
  assert.doesNotMatch(read('video-compressor/vendor/ffmpeg.js'), /createFFmpeg/);
});

// --- Dashboard ----------------------------------------------------------------

function loadDashboard(timers) {
  const browser = createBrowserContext({ globals: timers ? timers.globals : {} });
  const ids = ['display-tool', 'text-tool', 'device-info'];
  const tabs = ids.map((id) => {
    const tab = browser.getElement(`${id}-tab`);
    tab.dataset.tab = id;
    return tab;
  });
  const panels = ids.map((id) => browser.getElement(`${id}-panel`));
  browser.document.querySelectorAll = (selector) => {
    if (selector === '.tab-button') return tabs;
    if (selector === '.tool-panel') return panels;
    return [];
  };
  const pushes = [];
  browser.window.history.pushState = (_, __, url) => pushes.push(url);
  vm.createContext(browser.context);
  vm.runInContext(read('script.js'), browser.context, { filename: 'script.js' });
  return { ...browser, tabs, pushes };
}

test('re-selecting the open tool adds no browser history entry', async () => {
  const { tabs, pushes } = loadDashboard();
  await tabs[0].dispatch('click'); // already open on load
  assert.deepEqual(pushes, []);
  await tabs[1].dispatch('click');
  await tabs[1].dispatch('click');
  assert.deepEqual(pushes, ['#text-tool']);
  await tabs[1].dispatch('keydown', { key: 'ArrowRight' });
  assert.deepEqual(pushes, ['#text-tool', '#device-info']);
});

test('visual line count is recalculated after the window is resized', () => {
  const timers = createManualTimers();
  const { getElement, windowListeners } = loadDashboard(timers);
  const textarea = getElement('textInput');
  textarea.value = 'a'.repeat(60); // ~51 chars fit into 500px with the mock font
  textarea.dispatch('input');
  assert.equal(getElement('visualLineCount').textContent, 2);

  textarea.clientWidth = 1000;
  windowListeners.get('resize').forEach((listener) => listener());
  timers.runAll();
  assert.equal(getElement('visualLineCount').textContent, 1);
});

test('first render does not flash the display-scale highlight', () => {
  const { getElement } = loadDashboard();
  assert.equal(getElement('displayScale').parentElement.classList.contains('highlight'), false);
});

test('copy buttons give feedback when there is nothing to copy', async () => {
  const timers = createManualTimers();
  const { getElement } = loadDashboard(timers);
  const button = getElement('copyText');
  button.textContent = 'Copy';
  getElement('textInput').value = '   ';

  await button.dispatch('click');
  assert.equal(button.textContent, 'Nothing to copy');
  timers.runAll();
  assert.equal(button.textContent, 'Copy');
});

test('values that change on resize are not announced as live regions', () => {
  const html = read('index.html');
  const live = [...html.matchAll(/<[^>]*\baria-live="[^"]+"[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(live, [], 'no live regions on the home page tools');
});

// --- Theme, timer, version -------------------------------------------------------

test('theme switcher accessible name describes the action', async () => {
  const browser = createBrowserContext();
  vm.createContext(browser.context);
  vm.runInContext(read('theme.js'), browser.context, { filename: 'theme.js' });
  const switcher = browser.getElement('theme-switcher');

  assert.equal(switcher.getAttribute('aria-label'), 'Switch to dark theme');
  await switcher.dispatch('click');
  assert.equal(switcher.getAttribute('aria-label'), 'Switch to light theme');
  assert.equal(switcher.getAttribute('title'), 'Switch to light theme');
});

test('timer only touches the storage it writes to', () => {
  assert.doesNotMatch(read('time-frame/script.js'), /sessionStorage/);
});

test('full version label reads "Version <number> · <date>"', () => {
  const browser = createBrowserContext();
  const label = new MockElement('label');
  browser.document.querySelectorAll = (selector) => (selector === '[data-app-version]' ? [label] : []);
  vm.createContext(browser.context);
  vm.runInContext(read('version.js'), browser.context, { filename: 'version.js' });
  assert.match(label.textContent, /^Version \d+\.\d+\.\d+D · [A-Z][a-z]+ \d{4}$/);
});
