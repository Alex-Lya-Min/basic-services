'use strict';

// Video compressor: .mov (iPhone, cameras, screen recordings) support (0.0.19D).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-mocks');

const projectRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
const run = (context, code) => vm.runInContext(code, context);

// `script` is a list of { code, logs, progress } answers for consecutive exec() calls.
function loadVideo({ script = [{ code: 0 }], now } = {}) {
  const calls = [];
  class FakeFFmpeg {
    constructor() {
      this.handlers = {};
    }
    on(type, handler) {
      this.handlers[type] = handler;
    }
    async load() {}
    async writeFile(name) {
      calls.push(['writeFile', name]);
    }
    async exec(args) {
      calls.push(['exec', args]);
      const step = script.shift() || { code: 0 };
      (step.logs || []).forEach((message) => this.handlers.log({ type: 'stderr', message }));
      (step.progress || []).forEach(({ at, progress }) => {
        if (now) now.value = at;
        this.handlers.progress({ progress });
      });
      return step.code;
    }
    async readFile() {
      return new Uint8Array(10);
    }
    async deleteFile(name) {
      calls.push(['deleteFile', name]);
    }
    terminate() {}
  }

  const globals = {
    FFmpegWASM: { FFmpeg: FakeFFmpeg },
    fetch: async () => ({ ok: true, status: 200, body: null, arrayBuffer: async () => new ArrayBuffer(8) }),
    URL: Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL() {} })
  };
  if (now) {
    globals.Date = class extends Date {
      static now() {
        return now.value;
      }
    };
  }
  const browser = createBrowserContext({ globals });
  browser.context.globalThis = browser.context;
  vm.createContext(browser.context);
  const source = read('video-compressor/script.js')
    .replaceAll('import.meta.url', JSON.stringify('https://example.test/video-compressor/script.js'));
  vm.runInContext(source, browser.context, { filename: 'video-compressor/script.js' });
  return { ...browser, calls };
}

const video = (name, type = 'video/quicktime') => ({
  name,
  type,
  size: 20 * 1024 * 1024,
  arrayBuffer: async () => new ArrayBuffer(16)
});

const execCalls = (calls) => calls.filter((call) => call[0] === 'exec').map((call) => call[1]);

test('an iPhone .mov is compressed into an mp4 named after it', async () => {
  const { context, getElement, calls } = loadVideo();
  context.__files = [video('IMG_4821.MOV')];
  await run(context, 'handleFiles(__files)');

  assert.deepEqual(calls.find((call) => call[0] === 'writeFile'), ['writeFile', 'input.mov']);
  const [args] = execCalls(calls);
  assert.equal(args[args.indexOf('-i') + 1], 'input.mov');
  assert.equal(getElement('fileStatus').dataset.state, 'done');
  assert.equal(getElement('downloadLink').download, 'IMG_4821.min.mp4');
  assert.ok(calls.some((call) => call[0] === 'deleteFile' && call[1] === 'input.mov'), 'temporary input is removed');
});

test('output is always 8-bit 4:2:0 H.264 so HDR / 10-bit sources play everywhere', async () => {
  const { context, calls } = loadVideo();
  context.__files = [video('hdr.mov')];
  await run(context, 'handleFiles(__files)');
  const [args] = execCalls(calls);
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-preset') + 1], 'veryfast', 'fast preset: wasm encoding is slow');
  assert.equal(args[args.indexOf('-crf') + 1], '28');
  assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
  assert.equal(args[args.indexOf('-c:a') + 1], 'copy', 'compatible audio is kept as-is');
  assert.equal(args[args.length - 1], 'output.mp4');
});

test('audio that mp4 cannot hold (PCM) is converted to AAC automatically', async () => {
  const { context, getElement, calls } = loadVideo({
    script: [
      {
        code: 1,
        logs: ['[mp4 @ 0x1] Could not find tag for codec pcm_s16le in stream #1, codec not currently supported in container']
      },
      { code: 0 }
    ]
  });
  context.__files = [video('camera.mov')];
  await run(context, 'handleFiles(__files)');

  const runs = execCalls(calls);
  assert.equal(runs.length, 2);
  assert.equal(runs[0][runs[0].indexOf('-c:a') + 1], 'copy');
  assert.deepEqual(Array.from(runs[1].slice(runs[1].indexOf('-c:a'), runs[1].indexOf('-c:a') + 4)), ['-c:a', 'aac', '-b:a', '192k']);
  assert.equal(getElement('fileStatus').dataset.state, 'done');
});

test('a failing ffmpeg run shows a clear error instead of a file-system error', async () => {
  const cases = [
    [['input.mov: Invalid data found when processing input'], /could not be read.*damaged/],
    [['Decoder (codec prores_raw) not found for input stream #0:0'], /codec the compressor cannot decode/],
    [['some other failure', 'Conversion failed!'], /exit code 1\): Conversion failed!/]
  ];
  for (const [logs, expected] of cases) {
    const { context, getElement, calls } = loadVideo({ script: [{ code: 1, logs }] });
    context.__files = [video('broken.mov')];
    await run(context, 'handleFiles(__files)');
    assert.equal(execCalls(calls).length, 1, 'no pointless retry');
    assert.equal(getElement('fileStatus').dataset.state, 'error');
    assert.match(getElement('statusText').textContent, expected);
    assert.equal(getElement('downloadLink').hidden, true);
  }
});

test('long compressions show the estimated time left', async () => {
  const now = { value: 1_000_000 };
  const { context, getElement } = loadVideo({
    now,
    script: [{
      code: 0,
      progress: [
        { at: 1_001_000, progress: 0.01 }, // too early to estimate
        { at: 1_060_000, progress: 0.25 } // 60 s for 25% → 3 min left
      ]
    }]
  });
  const details = [];
  const detail = getElement('statusDetail');
  let value = '';
  Object.defineProperty(detail, 'textContent', {
    get: () => value,
    set: (next) => {
      value = next;
      details.push(next);
    }
  });
  context.__files = [video('IMG_4K.MOV')];
  await run(context, 'handleFiles(__files)');

  assert.ok(details.includes('1%'), details.join(' | '));
  assert.ok(details.includes('25% · about 3 min left'), details.join(' | '));
  assert.match(getElement('progressLabel').textContent, /Complete/);
});

test('duration formatting for the estimate', () => {
  const { context } = loadVideo();
  assert.equal(run(context, 'formatDuration(800)'), '1 s');
  assert.equal(run(context, 'formatDuration(45000)'), '45 s');
  assert.equal(run(context, 'formatDuration(150000)'), '3 min');
  assert.equal(run(context, 'formatDuration(3 * 3600000 + 5 * 60000)'), '3 h 5 min');
});

test('the page offers and describes mov support', () => {
  const html = read('video-compressor/index.html');
  assert.match(html, /accept="video\/mp4,video\/quicktime,\.mp4,\.m4v,\.mov"/);
  assert.match(html, /Supported input: mp4 and mov/);
  assert.doesNotMatch(html, /Upload your mp4 file/);
});
