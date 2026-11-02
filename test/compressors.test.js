'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');

function loadScript(relativePath, transform = (value) => value) {
  const browser = createBrowserContext();
  const source = transform(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
  vm.createContext(browser.context);
  vm.runInContext(source, browser.context, { filename: relativePath });
  return browser;
}

test('image compressor detects supported formats and generates output names', () => {
  const { context } = loadScript('image-compressor/script.js');

  assert.equal(
    vm.runInContext(`detectKind({ name: 'photo.JPG', type: 'application/octet-stream' })`, context),
    'jpeg'
  );
  assert.equal(vm.runInContext(`detectKind({ name: 'image.png', type: '' })`, context), 'png');
  assert.equal(vm.runInContext(`detectKind({ name: 'image.gif', type: 'image/gif' })`, context), null);
  assert.equal(vm.runInContext(`outputName('photo.jpg')`, context), 'photo.min.jpg');
  assert.equal(vm.runInContext(`outputName('README')`, context), 'README.min');
});

test('video compressor accepts mp4 and mov, using the extension for generic MIME types', () => {
  const { context } = loadScript(
    'video-compressor/script.js',
    (value) => value.replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'))
  );

  assert.equal(
    vm.runInContext(`isSupportedVideo({ name: 'clip.MP4', type: 'application/octet-stream' })`, context),
    true
  );
  assert.equal(
    vm.runInContext(`isSupportedVideo({ name: 'clip.exe', type: 'application/octet-stream' })`, context),
    false
  );
  assert.equal(vm.runInContext(`isSupportedVideo({ name: 'IMG_0001.MOV', type: 'video/quicktime' })`, context), true);
  assert.equal(vm.runInContext(`isSupportedVideo({ name: 'IMG_0001.MOV', type: '' })`, context), true);
  assert.equal(vm.runInContext(`isSupportedVideo({ name: 'clip.avi', type: 'video/x-msvideo' })`, context), false);
  assert.equal(vm.runInContext(`isSupportedVideo({ name: 'clip.webm', type: 'video/webm' })`, context), false);
});

test('clicking the nested video file input does not trigger a second click', async () => {
  const { getElement } = loadScript(
    'video-compressor/script.js',
    (value) => value.replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'))
  );
  const dropZone = getElement('dropZone');
  const fileInput = getElement('videoInput');

  await dropZone.dispatch('click', { target: fileInput });
  assert.equal(fileInput.clickCalls, 0);

  await dropZone.dispatch('click', { target: dropZone });
  assert.equal(fileInput.clickCalls, 1);
});
