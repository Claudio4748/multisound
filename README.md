# Multi Sound - Web Version

This is a standalone **HTML/JS/CSS** version of the Multi Sound application, converted from the Electron desktop version.

## What's Included

- **index.html** - Web page with audio device interface
- **renderer.js** - Main application logic (web-compatible)
- **styles.css** - Styling (identical to original)

## Key Features

✅ Multi-output audio device selection
✅ Local audio file playback
✅ YouTube URL embedding  
✅ HLS streaming support
✅ Volume control per device
✅ Device enumeration and audio routing

## What Changed from Electron Version

### Removed
- Electron IPC calls (`window.api.chooseFiles`, `window.api.chooseFolder`)
- Electron main process (no longer needed)
- `preload.js` (no longer needed)
- yt-dlp integration (command-line tool not available in browser)

### Added/Modified
- HTML5 file input elements (`<input type="file">`) for file selection
- WebKit directory picker for folder selection
- Enhanced CSP (Content Security Policy) for YouTube and HLS.js

## How to Use

### Option 1: Local Web Server (Recommended)
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (npx)
npx http-server . -p 8000 --cors

# Using Node.js (if http-server installed)
http-server . -p 8000 --cors
```

Then open: **http://localhost:8000**

### Option 2: Direct File Opening
Simply open `index.html` in your browser. However, file selection may be limited due to browser security restrictions.

## Browser Requirements

- **Modern Chromium browser** (Chrome, Edge, Brave, etc.)
- Audio device enumeration support
- Web Audio API with `setSinkId()` for multi-device output

### Known Limitations

- **Firefox**: Limited `setSinkId()` support (multi-device routing may not work)
- **Safari**: Limited audio output selection support
- **YouTube**: Routing YouTube audio to specific devices may not work (browser limitation)
- **No yt-dlp**: Cannot extract direct audio URLs from YouTube (use browser's built-in playback instead)

## Features That Work

✅ Local file selection and playback
✅ Folder browsing for audio files
✅ Per-device volume control
✅ Device permission requests
✅ YouTube embed (with fallback)
✅ HLS streaming (with Hls.js library)
✅ Audio file diagnostics (Debug button)

## Structure

```
web-version/
├── index.html      # Main HTML file with UI structure
├── renderer.js     # Application logic
├── styles.css      # Design and layout
└── README.md       # This file
```

## File Size

The entire web version is lightweight:
- HTML: ~5 KB
- JS: ~45 KB
- CSS: ~2 KB

## YouTube Integration

YouTube links can be embedded as iframes. The app attempts to load the YouTube IFrame API for better control, with graceful fallback to simple iframe embedding.

## Troubleshooting

### "getUserMedia" errors
- Grant microphone permission when prompted
- Some browsers require HTTPS for getUserMedia
- Check browser console for details

### Audio not playing
- Ensure files are in supported formats (MP3, WAV, OGG, M4A)
- Check the Debug button for CORS/network issues
- Verify device is not muted

### Device list empty
- Grant microphone permission
- Click "Abilita dispositivi" button
- Some browsers may need HTTPS

## Technical Notes

The web version uses:
- **Web Audio API** for audio context management
- **MediaDevices API** for device enumeration and routing
- **File API** for local file handling
- **Fetch API** for stream loading and debugging
- **YouTube IFrame API** for video embedding
- **Hls.js** for HLS stream support

## Original Electron Project

This web version is based on the Electron application. To use the desktop version, refer to the parent directory `package.json` and run:
```bash
npm install
npm start
```

---

**Last Updated**: 2026-02-17
