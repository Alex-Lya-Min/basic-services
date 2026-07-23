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
