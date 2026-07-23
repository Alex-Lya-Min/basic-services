'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');

test('theme initializes and toggles when localStorage is unavailable', async () => {
  const source = fs.readFileSync(path.join(projectRoot, 'theme.js'), 'utf8');
  const browser = createBrowserContext();
  browser.context.localStorage.getItem = () => {
    throw new Error('storage disabled');
  };
  browser.context.localStorage.setItem = () => {
    throw new Error('storage disabled');
  };
  vm.createContext(browser.context);

  assert.doesNotThrow(() => vm.runInContext(source, browser.context, { filename: 'theme.js' }));
  assert.equal(browser.document.documentElement.getAttribute('data-theme'), 'light');

  await browser.getElement('theme-switcher').dispatch('click');
  assert.equal(browser.document.documentElement.getAttribute('data-theme'), 'dark');
});

test('all local HTML assets exist', () => {
  const htmlFiles = [
    'index.html',
    'time-frame/index.html',
    'image-compressor/index.html',
    'video-compressor/index.html'
  ];

  for (const relativeHtmlPath of htmlFiles) {
    const htmlPath = path.join(projectRoot, relativeHtmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);

    for (const reference of references) {
      if (/^(?:[a-z]+:|#)/i.test(reference)) continue;
      const cleanReference = reference.split(/[?#]/, 1)[0];
      const target = path.resolve(path.dirname(htmlPath), cleanReference);
      assert.ok(fs.existsSync(target), `${relativeHtmlPath} references missing asset ${reference}`);
    }
  }
});

test('ARIA element references point to existing ids', () => {
  const htmlFiles = [
    'index.html',
    'time-frame/index.html',
    'image-compressor/index.html',
    'video-compressor/index.html'
  ];

  for (const relativeHtmlPath of htmlFiles) {
    const html = fs.readFileSync(path.join(projectRoot, relativeHtmlPath), 'utf8');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const references = [
      ...html.matchAll(/\baria-(?:controls|describedby|labelledby)="([^"]+)"/g)
    ];

    for (const [, idList] of references) {
      for (const id of idList.split(/\s+/)) {
        assert.ok(ids.has(id), `${relativeHtmlPath} has an ARIA reference to missing id "${id}"`);
      }
    }
  }
});

test('tool URL hashes select panels without becoming browser scroll targets', () => {
  const dashboardHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const dashboardIds = new Set(
    [...dashboardHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  );
  const standaloneHtml = [
    'time-frame/index.html',
    'image-compressor/index.html',
    'video-compressor/index.html'
  ].map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8')).join('\n');
  const toolHashes = new Set(
    [...standaloneHtml.matchAll(/href="[^"]*#([^"]+)"/g)].map((match) => match[1])
  );

  for (const hash of toolHashes) {
    assert.ok(!dashboardIds.has(hash), `#${hash} must not match an element id and trigger scrolling`);
    assert.ok(dashboardIds.has(`${hash}-panel`), `#${hash} must resolve to a tool panel`);
    assert.ok(dashboardIds.has(`${hash}-tab`), `#${hash} must resolve to a labelled tab`);
  }
});

test('design version uses the D suffix and matches every page fallback', () => {
  const versionSource = fs.readFileSync(path.join(projectRoot, 'version.js'), 'utf8');
  const appVersion = versionSource.match(/APP_VERSION = '([^']+)'/)?.[1];
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  ).version;

  assert.ok(appVersion, 'version.js must define APP_VERSION');
  assert.match(appVersion, /D$/, 'design versions must end in D');
  assert.equal(appVersion, `${packageVersion}D`);

  for (const relativeHtmlPath of [
    'index.html',
    'time-frame/index.html',
    'image-compressor/index.html',
    'video-compressor/index.html'
  ]) {
    const html = fs.readFileSync(path.join(projectRoot, relativeHtmlPath), 'utf8');
    assert.ok(html.includes(appVersion), `${relativeHtmlPath} must use version ${appVersion}`);
  }
});

test('tool layouts reserve stable vertical space across page changes', () => {
  const sharedStyles = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');
  const imageStyles = fs.readFileSync(
    path.join(projectRoot, 'image-compressor/styles.css'),
    'utf8'
  );
  const videoStyles = fs.readFileSync(
    path.join(projectRoot, 'video-compressor/styles.css'),
    'utf8'
  );

  assert.match(sharedStyles, /html\s*\{[^}]*overflow-y:\s*scroll;/s);
  assert.match(sharedStyles, /\.tool-panel\s*\{[^}]*min-height:\s*520px;/s);
  assert.doesNotMatch(imageStyles, /\.ic-shell\s*\{[^}]*min-height:\s*auto;/s);
  assert.doesNotMatch(videoStyles, /\.vc-shell\s*\{[^}]*min-height:\s*auto;/s);
});

test('all project JavaScript files pass the Node syntax check', () => {
  const files = [
    'script.js',
    'theme.js',
    'version.js',
    'time-frame/script.js',
    'image-compressor/script.js',
    'image-compressor/worker.js',
    'video-compressor/script.js',
    'video-compressor/coi-serviceworker.js'
  ];

  for (const file of files) {
    execFileSync(process.execPath, ['--check', path.join(projectRoot, file)], {
      stdio: 'pipe'
    });
  }
});

test('COOP/COEP service worker leaves opaque cross-origin responses intact', async () => {
  const listeners = new Map();
  const opaqueResponse = {
    type: 'opaque',
    status: 0,
    headers: {
      get() {
        return null;
      }
    }
  };
  const context = {
    self: {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      skipWaiting() {},
      clients: {
        claim() {}
      }
    },
    fetch: async () => opaqueResponse,
    Headers,
    Response,
    console
  };
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(projectRoot, 'video-compressor/coi-serviceworker.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'video-compressor/coi-serviceworker.js' });

  let responsePromise;
  listeners.get('fetch')({
    request: { cache: 'default', mode: 'no-cors' },
    respondWith(promise) {
      responsePromise = promise;
    }
  });

  assert.equal(await responsePromise, opaqueResponse);
});
