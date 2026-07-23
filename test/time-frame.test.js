'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'time-frame/script.js'), 'utf8');

function loadTimeFrame() {
  const browser = createBrowserContext();
  vm.createContext(browser.context);
  vm.runInContext(source, browser.context, { filename: 'time-frame/script.js' });
  return browser;
}

test('formatTime formats countdowns and overdue durations', () => {
  const { context } = loadTimeFrame();
  assert.equal(vm.runInContext('formatTime(3661000)', context), '01:01:01');
  assert.equal(vm.runInContext('formatTime(-61000)', context), '-00:01:01');
});

test('getISOWeekNumber handles year boundaries', () => {
  const { context } = loadTimeFrame();
  assert.equal(vm.runInContext(`getISOWeekNumber(new Date('2021-01-01T12:00:00Z'))`, context), 53);
  assert.equal(vm.runInContext(`getISOWeekNumber(new Date('2021-01-04T12:00:00Z'))`, context), 1);
  assert.equal(vm.runInContext(`getISOWeekNumber(new Date('2026-12-31T12:00:00Z'))`, context), 53);
});

test('timer still works when persistent storage is unavailable', () => {
  const { context, getElement } = loadTimeFrame();
  context.localStorage.setItem = () => {
    throw new Error('storage disabled');
  };
  context.localStorage.removeItem = () => {
    throw new Error('storage disabled');
  };
  context.sessionStorage.removeItem = () => {
    throw new Error('storage disabled');
  };

  assert.doesNotThrow(() => vm.runInContext('setDuration(60000)', context));
  assert.equal(getElement('timerDisplay').textContent, '00:01:00');
  assert.doesNotThrow(() => vm.runInContext('clearTimer()', context));
  assert.equal(getElement('timerDisplay').textContent, '00:00:00');
});
