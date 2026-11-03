'use strict';

// Regression tests for the bugs fixed in 0.0.16D. Each test describes the
// broken behaviour it guards against.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MockElement, createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Timers that only run when the test asks them to.
function createManualTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    globals: {
      setTimeout(callback) {
        const id = nextId++;
        pending.set(id, callback);
        return id;
      },
      clearTimeout(id) {
        pending.delete(id);
      }
    },
    runAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    }
  };
}

function createDashboardTabs(browser) {
  const ids = ['display-tool', 'counter-tool', 'case-tool', 'clean-text', 'device-info'];
  const tabs = ids.map((id) => {
    const tab = browser.getElement(`${id}-tab`);
    tab.dataset.tab = id;
    tab.textContent = id;
    return tab;
  });
  const link = new MockElement('video-link');
  link.textContent = 'Video Compressor';
  const panels = ids.map((id) => browser.getElement(`${id}-panel`));
  browser.document.querySelectorAll = (selector) => {
    if (selector === '.tab-button') return [...tabs, link];
    if (selector === '.tool-panel') return panels;
    return [];
  };
  return { tabs, panels, link };
}

function loadDashboard(options = {}) {
  const browser = createBrowserContext(options);
  const dom = createDashboardTabs(browser);
  if (options.hash) browser.window.location.hash = options.hash;
  vm.createContext(browser.context);
  vm.runInContext(read('script.js'), browser.context, { filename: 'script.js' });
  return { ...browser, ...dom };
}

const run = (context, code) => vm.runInContext(code, context);

// --- Dashboard --------------------------------------------------------------

test('word counter keeps contractions and hyphenated words whole', () => {
  const { context } = loadDashboard();
  assert.equal(run(context, `countWords("don't stop — it’s well-known")`), 4);
  assert.equal(run(context, `countWords('Hello, мир! 2026 — ok')`), 4);
  assert.equal(run(context, `countWords('   ')`), 0);
});

test('character counter counts an emoji as one character', () => {
  const { context, getElement } = loadDashboard();
  getElement('textInput').value = '👍🏽 ok';
  run(context, 'updateCharacterCount()');
  assert.equal(getElement('charCount').textContent, 4);
  assert.equal(getElement('charNoSpaceCount').textContent, 3);
});

test('camelCase and PascalCase leave no spaces before words starting with a digit', () => {
  const { context } = loadDashboard();
  assert.equal(run(context, `caseConverters.camel('hello 2nd world')`), 'hello2ndWorld');
  assert.equal(run(context, `caseConverters.pascal('hello 2nd world')`), 'Hello2ndWorld');
  assert.equal(run(context, `caseConverters.camel('  Привет, мир! ')`), 'приветМир');
  assert.equal(run(context, `caseConverters.pascal('')`), '');
});

test('Title Case does not capitalise the letter after an apostrophe', () => {
  const { context } = loadDashboard();
  assert.equal(run(context, `caseConverters.title("don't stop it’s fine")`), "Don't Stop It’s Fine");
});

test('Sentence case handles leading whitespace and quotes', () => {
  const { context } = loadDashboard();
  assert.equal(
    run(context, `caseConverters.sentence('  hello. "world" here! (yes) ok')`),
    '  Hello. "World" here! (Yes) ok'
  );
});

test('copy feedback never becomes the permanent button label', async () => {
  const timers = createManualTimers();
  const { context, getElement } = loadDashboard({ globals: timers.globals });
  const button = getElement('copyCleanText');
  button.textContent = 'Copy Clean Text';
  getElement('cleanTextArea').value = 'some text';

  await button.dispatch('click');
  assert.equal(button.textContent, 'Copied!');
  await button.dispatch('click'); // second click while "Copied!" is shown
  timers.runAll();
  assert.equal(button.textContent, 'Copy Clean Text');

  // Clipboard failures show feedback and restore the label too.
  context.navigator.clipboard.writeText = async () => {
    throw new Error('denied');
  };
  await button.dispatch('click');
  assert.equal(button.textContent, 'Failed to copy');
  timers.runAll();
  assert.equal(button.textContent, 'Copy Clean Text');
});

test('a tool hash is applied immediately and an empty hash restores the default tool', () => {
  const { tabs, panels, windowListeners, window, getElement } = loadDashboard({ hash: '#case-tool' });

  assert.ok(tabs[2].classList.contains('active'), 'hash tool is selected without waiting for load');
  assert.ok(panels[2].classList.contains('active'));
  assert.equal(tabs[2].getAttribute('tabindex'), '0');
  assert.equal(tabs[0].getAttribute('tabindex'), '-1');
  assert.equal(getElement('currentService').textContent, 'case-tool');

  window.location.hash = '';
  windowListeners.get('hashchange').forEach((listener) => listener());
  assert.ok(tabs[0].classList.contains('active'), 'Back to the bare URL shows the default tool');
  assert.ok(!panels[2].classList.contains('active'));
});

test('arrow keys, Home and End move between dashboard tabs', async () => {
  const { tabs, panels } = loadDashboard();

  const event = await tabs[0].dispatch('keydown', {
    key: 'ArrowRight',
    preventDefault() {
      this.prevented = true;
    }
  });
  assert.ok(event.prevented);
  assert.ok(tabs[1].classList.contains('active'));
  assert.ok(panels[1].classList.contains('active'));
  assert.ok(tabs[1].focused);

  await tabs[0].dispatch('keydown', { key: 'ArrowLeft' });
  assert.ok(tabs[4].classList.contains('active'), 'ArrowLeft wraps to the last tab');
  await tabs[4].dispatch('keydown', { key: 'Home' });
  assert.ok(tabs[0].classList.contains('active'));
  await tabs[0].dispatch('keydown', { key: 'End' });
  assert.ok(tabs[4].classList.contains('active'));
});

test('switching tabs leaves the standalone tool links untouched', () => {
  const { context, link } = loadDashboard();
  run(context, `switchTab('clean-text')`);
  assert.equal(link.getAttribute('aria-selected'), null);
  assert.equal(link.getAttribute('tabindex'), null);
});

test('Clean Text: Tab inserts spaces, Shift+Tab still moves focus out', async () => {
  const { getElement } = loadDashboard();
  const editor = getElement('cleanTextArea');
  editor.value = 'ab';
  editor.selectionStart = editor.selectionEnd = 1;

  let prevented = false;
  await editor.dispatch('keydown', { key: 'Tab', preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.equal(editor.value, 'a    b');
  assert.equal(editor.selectionStart, 5);

  prevented = false;
  await editor.dispatch('keydown', { key: 'Tab', shiftKey: true, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false, 'Shift+Tab must not be swallowed (keyboard trap)');
  assert.equal(editor.value, 'a    b');
});

test('Clean Text keeps the native paste so undo history survives', () => {
  const { getElement } = loadDashboard();
  assert.equal(getElement('cleanTextArea').listeners.has('paste'), false);
});

test('visual line count does not subtract the scrollbar twice', () => {
  const { context, getElement } = loadDashboard();
  const textarea = getElement('textInput');
  textarea.clientWidth = 500;
  textarea.offsetWidth = 520; // 20px scrollbar, already excluded from clientWidth
  // Mock font: 360px / 37 sample chars ≈ 9.73px per char → 51 chars fit in 500px.
  textarea.value = 'a'.repeat(51);
  assert.equal(run(context, 'countLinesByChars(textInput)'), 1);
  textarea.value = 'a'.repeat(52);
  assert.equal(run(context, 'countLinesByChars(textInput)'), 2);
});

test('device details recognise Chromium-based browsers and frozen macOS versions', () => {
  const { context } = loadDashboard();
  const browser = (ua) => run(context, `detectBrowser(${JSON.stringify(ua)})`);
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  assert.equal(browser(`${chrome} YaBrowser/24.10.1.123 Yowser/2.5`).name, 'Yandex Browser');
  assert.equal(browser(`${chrome} YaBrowser/24.10.1.123 Yowser/2.5`).version, '24.10.1.123');
  assert.equal(
    browser('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36').name,
    'Samsung Internet'
  );
  assert.equal(
    browser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0').name,
    'Microsoft Edge'
  );
  assert.equal(
    browser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/130.0.0.0 Version/17.0 Mobile/15E148 Safari/604.1').name,
    'Microsoft Edge'
  );
  assert.equal(browser(chrome).name, 'Chrome');

  const os = (ua) => run(context, `detectOS(${JSON.stringify(ua)})`);
  assert.equal(os('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'), 'macOS 10.15 or later');
  assert.equal(os('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0'), 'macOS 10.15 or later');
  assert.equal(os('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15'), 'macOS 10.14.6');
});

// --- Image compressor -------------------------------------------------------

function loadImageCompressor() {
  const workers = [];
  class FakeWorker {
    constructor(url, options) {
      this.url = url;
      this.options = options;
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
  }
  const browser = createBrowserContext({
    globals: {
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
  type: 'image/jpeg',
  size: 1000,
  arrayBuffer: async () => new ArrayBuffer(8)
});

test('image compressor adds an extension to extensionless output names', () => {
  const { context } = loadImageCompressor();
  assert.equal(run(context, `outputName('IMG_0001', 'jpeg')`), 'IMG_0001.min.jpg');
  assert.equal(run(context, `outputName('scan', 'png')`), 'scan.min.png');
  assert.equal(run(context, `outputName('photo.jpeg', 'jpeg')`), 'photo.min.jpeg');
});

test('a crashed compression worker is replaced instead of hanging the queue', async () => {
  const { context, workers } = loadImageCompressor();
  context.__files = [fakeImage('a.jpg')];
  run(context, 'addFiles(__files)');
  await flush();

  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages.length, 1, 'first file was sent to the worker');

  workers[0].listeners.get('error')({ preventDefault() {} });
  assert.equal(workers[0].terminated, true);
  assert.equal(run(context, 'items.get(1).status'), 'error');

  context.__files = [fakeImage('b.jpg')];
  run(context, 'addFiles(__files)');
  await flush();
  await flush();
  assert.equal(workers.length, 2, 'a fresh worker is created for the next file');
  assert.equal(workers[1].messages.length, 1);
  assert.equal(workers[1].messages[0].id, 2);
});

test('compressors stop files dropped outside the drop zone from replacing the page', () => {
  const checks = [
    ['image-compressor/script.js', (s) => s],
    [
      'video-compressor/script.js',
      (s) => s.replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'))
    ]
  ];

  for (const [file, transform] of checks) {
    const browser = createBrowserContext({
      globals: { URL: Object.assign(URL, { createObjectURL: () => 'blob:test' }) }
    });
    vm.createContext(browser.context);
    vm.runInContext(transform(read(file)), browser.context, { filename: file });

    let prevented = false;
    const outside = new MockElement('outside');
    const fileDrag = {
      dataTransfer: { types: ['Files'] },
      target: outside,
      preventDefault: () => { prevented = true; }
    };
    browser.windowListeners.get('dragover').forEach((listener) => listener(fileDrag));
    assert.ok(prevented, `${file}: dragover outside the zone must be allowed to drop`);

    prevented = false;
    browser.windowListeners.get('drop').forEach((listener) => listener(fileDrag));
    assert.ok(prevented, `${file}: a drop outside the zone must not open the file`);

    prevented = false;
    browser.windowListeners.get('drop').forEach((listener) => listener({
      ...fileDrag,
      dataTransfer: { types: ['text/plain'] }
    }));
    assert.equal(prevented, false, `${file}: text drags keep their default behaviour`);
  }
});

test('drop highlight survives moving over the tool’s own children', async () => {
  const { getElement } = loadImageCompressor();
  const dropZone = getElement('tool'); // the whole tool accepts dropped files
  const child = new MockElement('child');
  dropZone.appendChild(child);
  dropZone.classList.add('dragover');

  await dropZone.dispatch('dragleave', { relatedTarget: child });
  assert.ok(dropZone.classList.contains('dragover'));
  await dropZone.dispatch('dragleave', { relatedTarget: null });
  assert.ok(!dropZone.classList.contains('dragover'));
});

// --- Video compressor -------------------------------------------------------

function loadVideoCompressor() {
  const instances = [];
  let loadAttempts = 0;
  class FakeFFmpeg {
    constructor() {
      this.progressListeners = 0;
      this.terminated = false;
      instances.push(this);
    }
    on(type) {
      if (type === 'progress') this.progressListeners += 1;
    }
    async load() {
      loadAttempts += 1;
      if (loadAttempts === 1) throw new Error('network down');
    }
    async writeFile() {}
    async exec() {}
    async readFile() {
      return new Uint8Array([1, 2, 3]);
    }
    async deleteFile() {}
    terminate() {
      this.terminated = true;
    }
  }

  const browser = createBrowserContext({
    globals: {
      FFmpegWASM: { FFmpeg: FakeFFmpeg },
      fetch: async () => ({ ok: true, status: 200, body: null, arrayBuffer: async () => new ArrayBuffer(8) }),
      URL: Object.assign(URL, { createObjectURL: () => 'blob:test' })
    }
  });
  browser.context.globalThis = browser.context;
  vm.createContext(browser.context);
  const source = read('video-compressor/script.js')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'));
  vm.runInContext(source, browser.context, { filename: 'video-compressor/script.js' });
  return { ...browser, instances };
}

const fakeVideo = (name) => ({
  name,
  type: 'video/mp4',
  size: 1000,
  arrayBuffer: async () => new ArrayBuffer(8)
});

test('retrying after a failed engine load still reports progress and names the output', async () => {
  const { context, instances, getElement } = loadVideoCompressor();
  context.__files = [fakeVideo('Holiday clip.mp4')];
  await run(context, 'handleFiles(__files)'); // starts compression automatically
  assert.equal(getElement('tool').dataset.state, 'error');
  assert.equal(instances[0].terminated, true, 'the broken instance is discarded');

  await run(context, 'runCompression()');
  assert.equal(instances.length, 2);
  assert.equal(instances[1].progressListeners, 1, 'the retry instance gets a progress handler');
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(getElement('downloadLink').download, 'Holiday clip.min.mp4');
});

test('the video file cannot be swapped while a compression is running', () => {
  const { context } = loadVideoCompressor();
  context.__files = [fakeVideo('first.mp4')];
  run(context, 'handleFiles(__files)');
  run(context, 'isProcessing = true');
  context.__files = [fakeVideo('second.mp4')];
  run(context, 'handleFiles(__files)');
  assert.equal(run(context, 'currentFile.name'), 'first.mp4');
});

// --- Time Frame -------------------------------------------------------------

test('timer Reset is disabled until the timer has started, whatever the duration', () => {
  const browser = createBrowserContext();
  vm.createContext(browser.context);
  vm.runInContext(read('time-frame/script.js'), browser.context, { filename: 'time-frame/script.js' });
  const reset = browser.getElement('resetTimer');

  run(browser.context, 'setDuration(60000)');
  assert.equal(reset.disabled, true, 'nothing to reset before the start');
  run(browser.context, 'startTimer()');
  assert.equal(reset.disabled, false);
  run(browser.context, 'resetTimer()');
  assert.equal(reset.disabled, true);
});

// --- Theme ------------------------------------------------------------------

function loadTheme(savedTheme = null) {
  const mediaListeners = [];
  const media = {
    matches: false,
    addEventListener(type, listener) {
      if (type === 'change') mediaListeners.push(listener);
    }
  };
  const browser = createBrowserContext();
  browser.window.matchMedia = () => media;
  if (savedTheme) browser.context.localStorage.setItem('theme', savedTheme);
  vm.createContext(browser.context);
  vm.runInContext(read('theme.js'), browser.context, { filename: 'theme.js' });
  const emitChange = (matches) => mediaListeners.forEach((listener) => listener({ matches }));
  return { ...browser, emitChange };
}

test('theme follows OS changes until the user picks a theme', async () => {
  const { document, emitChange, getElement } = loadTheme();
  const theme = () => document.documentElement.getAttribute('data-theme');

  assert.equal(theme(), 'light');
  emitChange(true);
  assert.equal(theme(), 'dark', 'OS switched to dark');
  emitChange(false);
  assert.equal(theme(), 'light');

  await getElement('theme-switcher').dispatch('click');
  assert.equal(theme(), 'dark');
  emitChange(false);
  assert.equal(theme(), 'dark', 'an explicit choice wins over the OS');
});

test('a saved theme is not overridden by OS changes', () => {
  const { document, emitChange } = loadTheme('light');
  emitChange(true);
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
});

// --- Header layout ----------------------------------------------------------

const PAGES = ['index.html', 'time-frame/index.html', 'image-compressor/index.html', 'video-compressor/index.html'];

function extractBlock(html, openTagPattern) {
  const start = html.search(openTagPattern);
  if (start === -1) return null;
  const tagName = html.slice(start + 1).match(/^[a-z]+/)[0];
  const tagPattern = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'g');
  tagPattern.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tagPattern.lastIndex);
  }
  return null;
}

test('the theme switcher sits in the same row as the services on every page', () => {
  for (const page of PAGES) {
    const html = read(page);
    const headerTop = extractBlock(html, /<div class="header-top">/);
    const bar = extractBlock(html, /<div class="service-bar">/);

    assert.ok(headerTop, `${page}: header-top exists`);
    assert.ok(!headerTop.includes('theme-switcher'), `${page}: switcher is no longer beside the title`);
    assert.ok(bar, `${page}: services row exists`);

    const nav = extractBlock(bar, /<nav class="tab-navigation"/);
    assert.ok(nav, `${page}: services are inside the row`);
    const afterNav = bar.slice(bar.indexOf(nav) + nav.length);
    assert.match(afterNav, /^\s*<button id="theme-switcher" class="theme-switcher" type="button"/,
      `${page}: the switcher directly follows the services`);
    assert.equal((html.match(/id="theme-switcher"/g) || []).length, 1, `${page}: exactly one switcher`);
    assert.ok(html.includes('nav.js"'), `${page}: loads nav.js`);
  }
});

test('services navigation uses valid ARIA roles', () => {
  for (const page of PAGES) {
    const nav = extractBlock(read(page), /<nav class="tab-navigation"/);
    assert.match(nav, /^<nav class="tab-navigation" aria-label="Services">/, `${page}: nav landmark`);
    const tablist = extractBlock(nav, /<div class="tab-group" role="tablist"/);

    if (page === 'index.html') {
      assert.ok(tablist, 'dashboard groups its in-page tools in a tablist');
      const children = [...tablist.matchAll(/<(button|a)\b[^>]*>/g)].map((m) => m[0]);
      assert.equal(children.length, 5);
      children.forEach((tag) => assert.match(tag, /role="tab"/, 'a tablist may contain only tabs'));
      assert.doesNotMatch(nav.replace(tablist, ''), /role="tab"/);
    } else {
      assert.equal(tablist, null, `${page}: plain links are not a tablist`);
      assert.doesNotMatch(nav, /role="tab/);
    }
  }
});

test('mobile services scroller starts at the left edge so every service is reachable', () => {
  const css = read('styles.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 768px)'));
  const block = mobile.slice(0, mobile.indexOf('\n}\n'));
  assert.match(block, /\.tab-navigation,\s*\.tab-group\s*\{[^}]*justify-content:\s*flex-start;/s);
  assert.match(block, /\.tab-navigation\s*\{[^}]*overflow-x:\s*auto;/s);
  assert.match(css, /\.theme-switcher\s*\{[^}]*height:\s*var\(--tab-height\);/s,
    'switcher matches the service tab height');
  assert.match(css, /\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark;/s);
});
