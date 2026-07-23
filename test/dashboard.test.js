'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'script.js'), 'utf8');

function loadDashboard() {
  const browser = createBrowserContext();
  vm.createContext(browser.context);
  vm.runInContext(source, browser.context, { filename: 'script.js' });
  return browser;
}

test('detectOS identifies iOS before Mac compatibility tokens', () => {
  const { context, navigator } = loadDashboard();
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)';
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)';

  assert.equal(vm.runInContext(`detectOS(${JSON.stringify(iphone)})`, context), 'iOS');
  assert.equal(vm.runInContext(`detectOS(${JSON.stringify(ipad)})`, context), 'iOS');

  navigator.maxTouchPoints = 5;
  assert.equal(
    vm.runInContext(`detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')`, context),
    'iOS'
  );
});

test('getDeviceType distinguishes tablets from phones and desktops', () => {
  const { context, navigator } = loadDashboard();

  assert.equal(
    vm.runInContext(`getDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')`, context),
    'Mobile'
  );
  assert.equal(
    vm.runInContext(`getDeviceType('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)')`, context),
    'Tablet'
  );

  navigator.maxTouchPoints = 5;
  assert.equal(
    vm.runInContext(`getDeviceType('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')`, context),
    'Tablet'
  );
});

test('case conversion preserves word boundaries at punctuation', () => {
  const { context } = loadDashboard();

  assert.equal(vm.runInContext(`caseConverters.camel('hello-world test')`, context), 'helloWorldTest');
  assert.equal(vm.runInContext(`caseConverters.pascal('hello-world test')`, context), 'HelloWorldTest');
  assert.equal(vm.runInContext(`caseConverters.title('"hello-world"')`, context), '"Hello-World"');
  assert.equal(
    vm.runInContext(`caseConverters.sentence('hello! next? final.')`, context),
    'Hello! Next? Final.'
  );
});

test('character counter handles Unicode words, whitespace and paragraphs', () => {
  const { context, getElement } = loadDashboard();
  getElement('textInput').value = 'Hello, мир!\n\nSecond line';

  vm.runInContext('updateCharacterCount()', context);

  assert.equal(getElement('charCount').textContent, 24);
  assert.equal(getElement('charNoSpaceCount').textContent, 20);
  assert.equal(getElement('wordCount').textContent, 4);
  assert.equal(getElement('lineCount').textContent, 3);
  assert.equal(getElement('paragraphCount').textContent, 2);
});
