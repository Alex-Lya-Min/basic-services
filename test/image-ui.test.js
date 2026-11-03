'use strict';

// Image compressor: the single-card layout shared with the video
// compressor — states, quality presets, cancel, totals, "make it smaller"
// and re-compressing with a new quality (0.0.21D).

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
const KB = 1024;

function loadImages({ storage, now } = {}) {
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
  const downloads = [];
  const globals = {
    Worker: FakeWorker,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
  };
  if (now) {
    globals.Date = class extends Date {
      static now() {
        return now.value;
      }
    };
  }
  const browser = createBrowserContext({ globals });
  if (storage) browser.context.localStorage = storage;
  browser.document.title = 'Image Compressor | LYMN Web Tools';
  const createElement = browser.document.createElement;
  browser.document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === 'a') element.click = () => downloads.push({ href: element.href, name: element.download });
    return element;
  };

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
  vm.runInContext(read('image-compressor/script.js'), browser.context, { filename: 'image-compressor/script.js' });
  return { ...browser, workers, radios, options, downloads };
}

const image = (name, size = 100 * KB, type = name.endsWith('.png') ? 'image/png' : 'image/jpeg') => ({
  name,
  type,
  size,
  arrayBuffer: async () => new ArrayBuffer(8)
});

// Let the worker answer the job it was just given.
async function answer(browser, bytes, { phase = true } = {}) {
  await flush();
  const worker = browser.workers[browser.workers.length - 1];
  const message = worker.messages[worker.messages.length - 1];
  if (phase) worker.reply({ id: message.id, status: 'stage', stage: 'Compressing…', phase: 'working' });
  worker.reply({ id: message.id, status: 'done', buffer: new ArrayBuffer(bytes) });
  await flush();
  return message;
}

test('the page starts with the drop card; the list and cards are hidden', () => {
  const { getElement } = loadImages();
  assert.equal(getElement('tool').dataset.state, 'empty');
  assert.equal(getElement('dropZone').hidden, false);
  assert.equal(getElement('listBlock').hidden, true);
  assert.equal(getElement('jobCard').hidden, true);
  assert.equal(getElement('resultCard').hidden, true);
  assert.equal(getElement('qualityGroup').disabled, false);
});

test('adding images shows progress, then the totals and a zip download', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  context.__files = [image('a.jpg', 400 * KB), image('b.png', 600 * KB)];
  run(context, 'addFiles(__files)');

  assert.equal(getElement('tool').dataset.state, 'working');
  assert.equal(getElement('dropZone').hidden, true);
  assert.equal(getElement('listBlock').hidden, false);
  assert.equal(getElement('jobCard').hidden, false);
  assert.equal(getElement('qualityGroup').disabled, true, 'quality is locked while working');
  assert.equal(getElement('jobMeta').textContent, '0 of 2 images done');

  await answer(browser, 100 * KB);
  assert.equal(getElement('jobMeta').textContent, '1 of 2 images done');
  assert.equal(getElement('progressValue').textContent, '50%');

  await answer(browser, 300 * KB);
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(getElement('resultCard').hidden, false);
  assert.equal(getElement('jobCard').hidden, true);
  assert.equal(getElement('resultTitle').textContent, 'Your images are ready');
  assert.equal(getElement('resultSub').textContent, '2 images');
  assert.equal(getElement('savingsValue').textContent, '60%');
  assert.equal(getElement('beforeSize').textContent, '1000 KB');
  assert.equal(getElement('afterSize').textContent, '400 KB');
  assert.equal(getElement('downloadWhat').textContent, 'Download all');
  assert.equal(getElement('downloadZip').hidden, false);
  assert.equal(getElement('downloadSize').textContent, '400 KB');
  assert.equal(getElement('resultStats').textContent, 'Saved 600 KB');
  assert.equal(getElement('qualityGroup').disabled, false);
});

test('each row shows its result and its own download button', async () => {
  const browser = loadImages();
  browser.context.__files = [image('photo.jpg', 400 * KB)];
  run(browser.context, 'addFiles(__files)');
  await answer(browser, 100 * KB);
  const item = run(browser.context, 'items.get(1)');
  assert.equal(item.els.badge.hidden, false);
  assert.equal(item.els.badge.textContent, '−75%');
  assert.equal(item.els.download.hidden, false);
  assert.equal(item.els.download.download, 'photo.min.jpg');
  assert.equal(item.els.download.getAttribute('aria-label'), 'Download photo.min.jpg');
  assert.equal(item.els.status.children.at(-1).textContent, '400 KB → 100 KB');
});

test('one image downloads directly instead of as a zip', async () => {
  const browser = loadImages();
  browser.context.__files = [image('photo.jpg', 400 * KB)];
  run(browser.context, 'addFiles(__files)');
  await answer(browser, 100 * KB);
  assert.equal(browser.getElement('resultTitle').textContent, 'Your image is ready');
  assert.equal(browser.getElement('downloadWhat').textContent, 'Download image');
  assert.equal(browser.getElement('downloadZip').hidden, true);
  assert.equal(browser.getElement('downloadSize').textContent, '100 KB');
  await browser.getElement('downloadAllButton').dispatch('click');
  assert.deepEqual(browser.downloads, [{ href: 'blob:test', name: 'photo.min.jpg' }]);
});

test('kept originals and failures are counted in the summary', async () => {
  const browser = loadImages();
  browser.context.__files = [image('a.jpg', 100 * KB), image('b.jpg', 100 * KB), image('c.jpg', 100 * KB)];
  run(browser.context, 'addFiles(__files)');
  await answer(browser, 50 * KB);
  await answer(browser, 200 * KB); // bigger than the original → original kept
  await flush();
  const worker = browser.workers[0];
  worker.reply({ id: 3, status: 'error', message: 'Codec produced an empty file.' });
  await flush();

  assert.equal(browser.getElement('resultSub').textContent, '2 images · 1 kept as original · 1 couldn’t be compressed');
  const kept = run(browser.context, 'items.get(2)');
  assert.equal(kept.els.badge.textContent, 'Kept original');
  assert.equal(kept.els.badge.className, 'image-badge zero');
});

test('the chosen quality is sent to MozJPEG and remembered', async () => {
  const browser = loadImages();
  await browser.getElement('qualityGroup').dispatch('change', { target: browser.radios[0] });
  assert.ok(browser.options.small.classList.contains('is-selected'));
  assert.equal(browser.context.localStorage.getItem('imageCompressorQuality'), 'small');
  browser.context.__files = [image('a.jpg')];
  run(browser.context, 'addFiles(__files)');
  await flush();
  assert.equal(browser.workers[0].messages[0].quality, 60);

  const again = loadImages({ storage: browser.context.localStorage });
  assert.equal(again.radios[0].checked, true);
});

test('Custom shows a JPEG quality slider that starts from the preset and is remembered', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  assert.equal(getElement('qualityCustom').hidden, true);

  await getElement('qualityGroup').dispatch('change', { target: browser.radios[3] });
  assert.equal(getElement('qualityCustom').hidden, false);
  assert.ok(browser.options.custom.classList.contains('is-selected'));
  assert.equal(getElement('customQuality').value, '75', 'starts from Balanced');
  assert.equal(getElement('customQualityValue').textContent, '75');

  getElement('customQuality').value = '40';
  await getElement('customQuality').dispatch('input');
  assert.equal(getElement('customQualityValue').textContent, '40');
  assert.match(getElement('qualityNote').textContent, /^JPEG quality 40: lower gives smaller files/);
  assert.equal(context.localStorage.getItem('imageCompressorQuality'), 'custom');
  assert.equal(context.localStorage.getItem('imageCompressorCustomQuality'), '40');

  context.__files = [image('a.jpg')];
  run(context, 'addFiles(__files)');
  await flush();
  assert.equal(browser.workers[0].messages[0].quality, 40);

  const again = loadImages({ storage: context.localStorage });
  assert.equal(again.radios[3].checked, true);
  assert.equal(again.getElement('qualityCustom').hidden, false);
  assert.equal(again.getElement('customQuality').value, '40');
});

test('moving the slider after compressing offers to re-compress at that quality', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  await getElement('qualityGroup').dispatch('change', { target: browser.radios[3] });
  context.__files = [image('a.jpg', 400 * KB)];
  run(context, 'addFiles(__files)');
  await answer(browser, 200 * KB);
  assert.equal(getElement('qualityApply').hidden, true);
  assert.equal(getElement('smallerHint').hidden, false, 'quality 75 can still go to Smaller (60)');

  getElement('customQuality').value = '50';
  await getElement('customQuality').dispatch('input');
  assert.equal(getElement('qualityApply').hidden, false);
  assert.equal(getElement('qualityApplyText').textContent, 'Re-compress 1 JPEG at quality 50');
  await getElement('recompressButton').dispatch('click');
  await flush();
  assert.equal(browser.workers[0].messages.at(-1).quality, 50);
  await answer(browser, 150 * KB);
  assert.equal(getElement('smallerHint').hidden, true, 'no preset is smaller than quality 50');
});

test('changing the quality afterwards offers to re-compress the JPEGs', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  context.__files = [image('a.jpg', 400 * KB), image('b.png', 400 * KB)];
  run(context, 'addFiles(__files)');
  await answer(browser, 200 * KB);
  await answer(browser, 300 * KB);
  assert.equal(getElement('qualityApply').hidden, true);

  await getElement('qualityGroup').dispatch('change', { target: browser.radios[2] });
  assert.equal(getElement('qualityApply').hidden, false);
  assert.equal(getElement('qualityApplyText').textContent, 'Re-compress 1 JPEG as “Better quality”');

  await getElement('recompressButton').dispatch('click');
  await flush();
  const last = browser.workers[0].messages.at(-1);
  assert.equal(last.id, 1, 'only the JPEG is compressed again');
  assert.equal(last.quality, 88);
  await answer(browser, 250 * KB);
  assert.equal(getElement('qualityApply').hidden, true);
  assert.equal(getElement('tool').dataset.state, 'done');
});

test('"Make JPEGs smaller" re-compresses with the next smaller preset', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  context.__files = [image('a.jpg', 400 * KB)];
  run(context, 'addFiles(__files)');
  await answer(browser, 200 * KB);
  assert.equal(getElement('smallerHint').hidden, false);

  await getElement('smallerButton').dispatch('click');
  await flush();
  assert.equal(browser.workers[0].messages.at(-1).quality, 60);
  await answer(browser, 120 * KB);
  assert.equal(getElement('smallerHint').hidden, true, 'already the smallest preset');
  assert.equal(getElement('afterSize').textContent, '120 KB');
});

test('"Make JPEGs smaller" is not offered for PNG-only results', async () => {
  const browser = loadImages();
  browser.context.__files = [image('a.png', 400 * KB)];
  run(browser.context, 'addFiles(__files)');
  await answer(browser, 200 * KB);
  assert.equal(browser.getElement('smallerHint').hidden, true);
});

test('Cancel stops the worker and removes the images that were not done', async () => {
  const browser = loadImages();
  const { context, getElement } = browser;
  context.__files = [image('a.jpg'), image('b.jpg'), image('c.jpg')];
  run(context, 'addFiles(__files)');
  await answer(browser, 10 * KB);
  await flush();

  await getElement('cancelButton').dispatch('click');
  await flush();
  assert.equal(browser.workers[0].terminated, true);
  assert.equal(run(context, 'items.size'), 1);
  assert.equal(getElement('dropNotice').textContent, 'Stopped. 2 images were not compressed.');
  assert.equal(getElement('tool').dataset.state, 'done');
  assert.equal(run(context, 'queueRunning'), false);
});

test('the time left is estimated from the images already done', async () => {
  const now = { value: 0 };
  const browser = loadImages({ now });
  browser.context.__files = [image('a.jpg'), image('b.jpg'), image('c.jpg')];
  run(browser.context, 'addFiles(__files)');
  await flush();
  now.value = 4000; // the first image took 4 s
  await answer(browser, 10 * KB);
  assert.equal(browser.getElement('progressNote').textContent, 'About 8 s left');
});

test('stage messages show while the first image is working', async () => {
  const browser = loadImages();
  browser.context.__files = [image('a.jpg')];
  run(browser.context, 'addFiles(__files)');
  await flush();
  browser.workers[0].reply({ id: 1, status: 'stage', stage: 'Loading MozJPEG codec…', phase: 'loading' });
  assert.equal(browser.getElement('progressNote').textContent, 'Loading MozJPEG codec…');
});

test('Clear all empties the list and returns to the drop card', async () => {
  const browser = loadImages();
  browser.context.__files = [image('a.jpg')];
  run(browser.context, 'addFiles(__files)');
  await answer(browser, 10 * KB);
  await browser.getElement('clearAllButton').dispatch('click');
  assert.equal(run(browser.context, 'items.size'), 0);
  assert.equal(browser.getElement('tool').dataset.state, 'empty');
  assert.equal(browser.getElement('dropZone').hidden, false);
});

test('rejected files are listed in a notice next to the drop card', () => {
  const browser = loadImages();
  browser.context.__files = [image('anim.gif', 10, 'image/gif')];
  run(browser.context, 'addFiles(__files)');
  const notice = browser.getElement('dropNotice');
  assert.equal(notice.hidden, false);
  assert.ok(notice.classList.contains('error'));
  assert.match(notice.textContent, /anim\.gif: only JPEG and PNG are supported/);
  assert.equal(browser.getElement('tool').dataset.state, 'empty');
});

test('leaving the page while images are compressing asks for confirmation', async () => {
  const browser = loadImages();
  const beforeUnload = browser.windowListeners.get('beforeunload')[0];
  browser.context.__files = [image('a.jpg')];
  run(browser.context, 'addFiles(__files)');
  const busy = { preventDefault() { this.prevented = true; } };
  beforeUnload(busy);
  assert.equal(busy.prevented, true);
  await answer(browser, 10 * KB);
  const idle = { preventDefault() { this.prevented = true; } };
  beforeUnload(idle);
  assert.equal(idle.prevented, undefined);
});

test('page markup matches the video compressor layout', () => {
  const html = read('image-compressor/index.html');
  assert.match(html, /<link rel="stylesheet" href="\.\.\/tool\.css">/);
  assert.match(html, /<main class="tool" id="tool" data-state="empty">/);
  assert.match(html, /<h2 class="tool-title">Compress images<\/h2>/);
  assert.match(html, /id="chooseButton">Choose images<\/button>/);
  for (const id of ['jobCard', 'resultCard', 'listBlock', 'qualityApply']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*hidden`), `${id} starts hidden`);
  }
  assert.equal((html.match(/name="quality"/g) || []).length, 4, 'three presets and Custom');
  assert.match(html, /value="custom"><span>Custom<\/span>/);
  assert.match(html, /<div class="quality-custom" id="qualityCustom" hidden>/);
  assert.match(html, /<input type="range" id="customQuality" min="1" max="100"/);
  assert.equal((html.match(/<li><svg class="icon"/g) || []).length, 3, 'three short chips');
  assert.doesNotMatch(html, /class="drop-or"/);
  assert.doesNotMatch(html, /qualitySlider|step-number|Practical limits/);
});
