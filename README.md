# Web Tools Dashboard

A collection of useful web tools including Display Resolution Tool, Character Counter, and Case Converter.

## Features

- 📱 Display Resolution Tool
- ✍️ Character Counter
- 🔤 Case Converter
- 🧹 Clean Text Editor
- 🖥️ Device Details
- ⏱️ Time Frame (ISO week, year progress, countdown timer)
- 🌓 Dark/Light Theme Support (follows system preference by default)
- 🎬 Video Compressor (ffmpeg.wasm; mp4 and mov, including iPhone videos)
- 🖼️ Image Compressor (MozJPEG / OxiPNG via jSquash)

## Usage

Simply host the files on any static web server or GitHub Pages.


## Local Development

To run locally, you can use any static file server. For example:

Using Python:
```bash
python -m http.server 8000
```

Using Node.js:
```bash
npx serve
```

Then open `http://localhost:8000` in your browser.

## Tests

The test suite uses the Node.js built-in test runner and has no external dependencies:

```bash
npm test
```

It covers the dashboard utilities, timer logic, compressor input handling, theme fallback,
service-worker behavior, JavaScript syntax, and local asset/ARIA references.
`test/bugfixes.test.js` holds regression tests for fixed bugs (word/character counting,
case conversion, copy feedback, hash navigation and tab keyboard support, Clean Text undo,
worker recovery, drag-and-drop outside the drop zone, engine-load retry, theme following the OS)
and checks that the theme switcher sits in the same row as the services on every page.
`test/review-fixes.test.js` covers the issues from the code review (codec-load timeout,
video engine timeout, history entries, live regions, visual lines on resize, and more).
`test/video-upload.test.js` covers the video compressor's feedback after a drop (auto-start,
status and progress under the drop zone, engine download progress and stalls, rejected files).
`test/video-mov.test.js` covers .mov input (8-bit output, PCM → AAC retry, readable ffmpeg errors,
time-left estimate).

## Video compressor quick start

1. Open [`/video-compressor/`](./video-compressor/).
2. Drop an mp4 or mov file (recommended up to ~150–200 MB) — compression starts automatically.
   iPhone videos (HEVC, HDR/10-bit, portrait) are supported; the result is always an 8-bit H.264 mp4
   that plays everywhere, and audio that mp4 cannot hold (e.g. PCM) is converted to AAC.
   Progress (engine download on first use, reading, compressing) is shown right under the drop zone.
3. Keep the tab in the foreground while ffmpeg.wasm works, then download `<name>.min.mp4`
   (a smaller H.264 mp4, CRF 28, audio kept as-is).

Compression is performed entirely in your browser, so large videos can take several minutes on low-power devices.

## Image compressor quick start

1. Open [`/image-compressor/`](./image-compressor/).
2. Drop JPEG or PNG files (up to 20 at once, ~50 MB each) — compression starts automatically.
3. Adjust the JPEG quality slider if needed (default 75); PNGs are optimised losslessly.
4. Download files one by one or grab everything as a zip.

Images are processed locally in a Web Worker using WebAssembly builds of MozJPEG and OxiPNG
(the [jSquash](https://github.com/jamsinclair/jSquash) project). Codec modules are loaded from
esm.sh on first use, so the first compression needs a network connection.


