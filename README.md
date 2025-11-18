# Web Tools Dashboard

A collection of useful web tools including Display Resolution Tool, Character Counter, and Case Converter.

## Features

- 📱 Display Resolution Tool
- ✍️ Character Counter
- 🔤 Case Converter
- 🎬 Image / Video Compressor (ffmpeg.wasm presets)
- 🌓 Dark/Light Theme Support

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

## Versioning

- **v1.1.0** – Added the Image / Video Compressor located at [`/video-compressor/`](video-compressor/) with MP4→MP4 and MP4→WebM presets powered by `ffmpeg.wasm`.
- **v1.0.0** – Initial release of the dashboard utilities.



