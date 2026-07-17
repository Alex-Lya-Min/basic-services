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
- 🎬 Video Compressor (ffmpeg.wasm)

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

## Video compressor quick start

1. Open [`/video-compressor/`](./video-compressor/).
2. Drop an mp4 file (recommended up to ~150–200 MB).
3. Click **Compress video** and keep the tab in the foreground while ffmpeg.wasm works
   (the output is a smaller H.264 mp4, CRF 28, audio kept as-is).

Compression is performed entirely in your browser, so large videos can take several minutes on low-power devices.



