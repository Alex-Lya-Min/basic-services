# Web Tools Dashboard

A collection of useful web tools including Display Resolution Tool, Character Counter, and Case Converter.

## Features

- 📱 Display Resolution Tool
- ✍️ Character Counter
- 🔤 Case Converter
- 🌓 Dark/Light Theme Support
- 🎬 Image / Video Compressor (ffmpeg.wasm)

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
2. Drop an mp4 file (recommended up to ~500 MB).
3. Pick one of the ready-made presets (smaller mp4 or mp4 → webm).
4. Click **Compress video** and keep the tab in the foreground while ffmpeg.wasm works.

Compression is performed entirely in your browser, so large videos can take several minutes on low-power devices.



