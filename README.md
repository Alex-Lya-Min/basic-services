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
`test/video-upload.test.js` covers the video compressor's single card: empty / working / done / error
states, quality presets, cancel, "make it smaller", engine download progress and stalls, rejected files.
`test/image-ui.test.js` covers the image compressor's cards, quality presets, cancel and totals.
`test/video-mov.test.js` covers .mov input (8-bit output, PCM → AAC retry, readable ffmpeg errors,
time-left estimate).

## Video compressor quick start

1. Open [`/video-compressor/`](./video-compressor/).
2. Pick a quality — **Smaller file**, **Balanced** (default) or **Better quality** (x264 CRF 32 / 28 / 23,
   "veryfast" preset). The choice is remembered.
3. Drop an mp4 or mov file (recommended up to ~150–200 MB) or press **Choose video** — compression starts
   automatically. iPhone videos (HEVC, HDR/10-bit, portrait) are supported; the result is always an 8-bit
   H.264 mp4 that plays everywhere, and audio that mp4 cannot hold (e.g. PCM) is converted to AAC.
4. The card shows the file (size, resolution, HDR, duration), the steps (engine → reading → compressing),
   the percentage and the time left. **Cancel** stops it.
5. When it is done, the card shows how much smaller the video got and a **Download** button for
   `<name>.min.mp4`. **Make it smaller** compresses it again one step smaller; errors explain what to do
   and offer **Try again**.

Compression is performed entirely in your browser, so large videos can take several minutes on low-power devices.

## Image compressor quick start

1. Open [`/image-compressor/`](./image-compressor/).
2. Pick a quality — **Smaller files**, **Balanced** (default) or **Better quality** (MozJPEG quality
   60 / 75 / 88). It applies to JPEGs; PNGs are always optimised losslessly. The choice is remembered.
3. Drop JPEG or PNG files (up to 20 at once, ~50 MB each) or press **Choose images** — compression starts
   automatically, with overall progress, time left and **Cancel**.
4. The result card shows the total savings; download everything as a zip (or the single image), or each
   image from its row. **Make JPEGs smaller**, or picking another quality and pressing **Apply**,
   compresses the JPEGs again.

Images are processed locally in a Web Worker using WebAssembly builds of MozJPEG and OxiPNG
(the [jSquash](https://github.com/jamsinclair/jSquash) project). Codec modules are loaded from
esm.sh on first use, so the first compression needs a network connection.


