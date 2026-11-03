'use strict';

// Web tools in the new layout (0.0.23D): the Text tool that merges Word
// Counter, Case Converter and Clean Text; Time Frame; consistent naming,
// grouped navigation, Open Graph tags and the web app manifest.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { MockElement, createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(projectRoot, relativePath));
const run = (context, code) => vm.runInContext(code, context);
const PAGES = ['index.html', 'video-compressor/index.html', 'image-compressor/index.html', 'time-frame/index.html'];

function loadHome() {
  const browser = createBrowserContext();
  const caseButtons = ['upper', 'lower', 'title', 'sentence', 'camel', 'pascal'].map((value) => {
    const button = new MockElement(`case-${value}`);
    button.dataset.case = value;
    button.textContent = value;
    return button;
  });
  const cleanButtons = ['spaces', 'empty-lines', 'join'].map((value) => {
    const button = new MockElement(`clean-${value}`);
    button.dataset.clean = value;
    button.textContent = value;
    return button;
  });
  browser.document.querySelectorAll = (selector) => {
    if (selector === '.convert-btn') return caseButtons;
    if (selector === '.clean-btn') return cleanButtons;
    return [];
  };
  vm.createContext(browser.context);
  vm.runInContext(read('script.js'), browser.context, { filename: 'script.js' });
  const editor = browser.getElement('textInput');
  const type = (value, start = value.length, end = start) => {
    editor.value = value;
    editor.selectionStart = start;
    editor.selectionEnd = end;
  };
  return { ...browser, caseButtons, cleanButtons, editor, type };
}

// --- Text ---------------------------------------------------------------------

test('Text: clean-up actions tidy spaces, empty lines and line breaks', async () => {
  const { cleanButtons, editor, type } = loadHome();
  type('  Hello    big \t world  \n\n\n  next   line ');
  await cleanButtons[0].dispatch('click');
  assert.equal(editor.value, 'Hello big world\n\n\nnext line');

  await cleanButtons[1].dispatch('click');
  assert.equal(editor.value, 'Hello big world\nnext line');

  type('first line\nsecond line\n\nnew paragraph\ncontinues');
  await cleanButtons[2].dispatch('click');
  assert.equal(editor.value, 'first line second line\n\nnew paragraph continues');
});

test('Text: changing case applies to the selection only when there is one', async () => {
  const { caseButtons, editor, type } = loadHome();
  type('hello world', 6, 11);
  await caseButtons[0].dispatch('click');
  assert.equal(editor.value, 'hello WORLD');
  assert.equal(editor.selectionStart, 6);
  assert.equal(editor.selectionEnd, 11);

  type('hello world');
  await caseButtons[4].dispatch('click');
  assert.equal(editor.value, 'helloWorld');
});

test('Text: buttons explain why nothing happened', async () => {
  const { caseButtons, cleanButtons, type } = loadHome();
  type('');
  await caseButtons[0].dispatch('click');
  assert.equal(caseButtons[0].textContent, 'Add text first');

  type('ALREADY UPPER');
  await caseButtons[0].dispatch('click');
  assert.equal(caseButtons[0].textContent, 'No change');

  type('tidy text');
  await cleanButtons[0].dispatch('click');
  assert.equal(cleanButtons[0].textContent, 'Nothing to clean');
});

test('Text: counts update after every change, with a reading time', async () => {
  const { getElement, editor, type } = loadHome();
  type('one two three');
  await editor.dispatch('input');
  assert.equal(getElement('wordCount').textContent, 3);
  assert.equal(getElement('readingTime').textContent, 'Reading time: under a minute');

  type(Array(700).fill('word').join(' '));
  await editor.dispatch('input');
  assert.equal(getElement('readingTime').textContent, 'Reading time: about 3 min');

  await getElement('clearText').dispatch('click');
  assert.equal(editor.value, '');
  assert.equal(getElement('wordCount').textContent, 0);
  assert.equal(getElement('readingTime').textContent, 'Reading time: —');
});

test('Text: wrap and line-number toggles report their state', async () => {
  const { getElement, editor, type } = loadHome();
  const wrap = getElement('wrapToggle');
  const numbers = getElement('lineNumbersToggle');
  const gutter = getElement('lineNumbers');

  await numbers.dispatch('click');
  assert.equal(numbers.getAttribute('aria-pressed'), 'true');
  assert.equal(gutter.hidden, false);

  await wrap.dispatch('click');
  assert.equal(wrap.getAttribute('aria-pressed'), 'false');
  assert.ok(getElement('editor').classList.contains('no-wrap'));
  type('a\nb\nc');
  await editor.dispatch('input');
  assert.equal(gutter.textContent, '1\n2\n3');

  await numbers.dispatch('click');
  assert.equal(gutter.hidden, true);
});

// --- Time Frame -------------------------------------------------------------------

function loadTimeFrame() {
  const browser = createBrowserContext();
  const presets = [1800000, 2700000, 3600000].map((ms) => {
    const button = new MockElement(`preset-${ms}`);
    button.dataset.duration = String(ms);
    return button;
  });
  browser.document.querySelectorAll = (selector) => (selector === '[data-duration]' ? presets : []);
  vm.createContext(browser.context);
  vm.runInContext(read('time-frame/script.js'), browser.context, { filename: 'time-frame/script.js' });
  return { ...browser, presets };
}

test('Time Frame: the week shows its Monday–Sunday dates', () => {
  const { context, getElement } = loadTimeFrame();
  assert.equal(run(context, `getWeekRange(new Date(2026, 10, 3))`), 'Nov 2 – Nov 8');
  assert.equal(run(context, `getWeekRange(new Date(2026, 10, 8))`), 'Nov 2 – Nov 8', 'Sunday belongs to the same week');
  assert.match(getElement('weekRange').textContent, /^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2} · ISO-8601$/);
  assert.match(getElement('yearProgressPercent').textContent, /^\d{1,3}\.\d%$/);
  assert.match(getElement('yearProgressText').textContent, /passed · \d+ days left$/);
});

test('Time Frame: the chosen duration preset is highlighted', async () => {
  const { presets, context } = loadTimeFrame();
  assert.deepEqual(presets.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false']);
  await presets[2].dispatch('click');
  assert.deepEqual(presets.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true']);
  run(context, 'setDuration(600000)');
  assert.deepEqual(presets.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'false'], 'custom time');
});

// --- Naming, navigation, Open Graph, manifest -----------------------------------------

test('every page uses the LYMN Tools name consistently', () => {
  const titles = {
    'index.html': 'LYMN Tools — private media tools and web utilities',
    'video-compressor/index.html': 'Video Compressor · LYMN Tools',
    'image-compressor/index.html': 'Image Compressor · LYMN Tools',
    'time-frame/index.html': 'Time Frame · LYMN Tools'
  };
  for (const page of PAGES) {
    const html = read(page);
    assert.equal(html.match(/<title>([^<]+)<\/title>/)[1], titles[page]);
    assert.match(html, /aria-label="LYMN Tools home">LYMN Tools<\/a>/);
    assert.doesNotMatch(html, /Web Tools Dashboard|LYMN Web Tools|current-service/);
  }
  assert.match(read('README.md'), /^# LYMN Tools/);
});

test('every page has Open Graph tags whose image exists', () => {
  for (const page of PAGES) {
    const html = read(page);
    const meta = (property) => {
      const match = html.match(new RegExp(`<meta property="${property}"\\s+content="([^"]+)">`));
      return match && match[1];
    };
    assert.equal(meta('og:site_name'), 'LYMN Tools', page);
    assert.ok(meta('og:title') && meta('og:description'), page);
    const url = meta('og:url');
    assert.ok(url.startsWith('https://alex-lya-min.github.io/basic-services/'), page);
    const image = meta('og:image');
    const local = image.replace('https://alex-lya-min.github.io/basic-services/', '');
    assert.ok(exists(local), `${page}: ${local} exists`);
    const png = fs.readFileSync(path.join(projectRoot, local));
    assert.equal(png.readUInt32BE(16), 1200, 'og image width');
    assert.equal(png.readUInt32BE(20), 630, 'og image height');
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  }
});

test('the web app manifest is valid and every page links it with icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'LYMN Tools');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.ok(exists(icon.src), icon.src);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  assert.deepEqual(manifest.shortcuts.map((s) => s.name), ['Video Compressor', 'Image Compressor', 'Text']);

  for (const page of PAGES) {
    const html = read(page);
    const prefix = page === 'index.html' ? '' : '../';
    assert.ok(html.includes(`<link rel="manifest" href="${prefix}manifest.webmanifest">`), page);
    assert.ok(html.includes(`<link rel="icon" type="image/svg+xml" href="${prefix}icons/icon.svg">`), page);
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="${prefix}icons/apple-touch-icon.png">`), page);
    assert.doesNotMatch(html, /href="data:image\/svg\+xml/, `${page}: no emoji favicon`);
  }
});

test('Word Counter, Case Converter and Clean Text are one Text tool', () => {
  const html = read('index.html');
  assert.match(html, /id="text-tool-panel"/);
  assert.doesNotMatch(html, /counter-tool|case-tool|clean-text|cleanTextArea|caseInput/);
  assert.equal((html.match(/<textarea/g) || []).length, 1, 'one shared text field');
  assert.equal((html.match(/class="chip-button convert-btn"/g) || []).length, 6);
  assert.equal((html.match(/class="chip-button clean-btn"/g) || []).length, 3);
});
