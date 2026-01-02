# YouTube Audio Player - Chrome Extension

A Chrome extension that extracts audio links from YouTube channels using the ph.tinhtong.vn service and displays them in a convenient side panel.

## Features

- 🎵 Crawl YouTube channel audio files
- 🎯 Extract audio links and titles automatically
- 📋 Copy links with one click
- 🎨 Clean and modern UI with side panel

## Installation

### Step 1: Load the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `yt-audio-player` folder

### Step 2: Use the Extension
1. Open any webpage
2. Click the extension icon in the toolbar
3. The side panel will open on the right
4. Click "Crawl Audio" to extract audio links from the YouTube channel

## Files

- `manifest.json` - Extension configuration
- `side-panel.html` - Side panel UI
- `side-panel.js` - Side panel logic
- `styles.css` - UI styling
- `background.js` - Background service worker for crawling

## How It Works

1. **Step 1 (Crawling)**: When you click "Crawl Audio", the extension sends a message to the background script
2. **Step 2 (Extraction)**: The background script fetches the content from `https://ph.tinhtong.vn/Home/AudioYoutube?link=https://www.youtube.com/@PhapHanh&max=600`
3. **Step 3 (Parsing)**: It extracts:
   - `href` attributes from elements with class `mdtc-clnplra-free-media`
   - `title` attributes from elements with class `mdtc-clnplra-playlist-item`
4. **Step 4 (Display)**: Results are displayed as a list with titles and clickable links

## Usage

- Click any link to open it in a new tab
- Click the 📋 button to copy the link to your clipboard
- Results show the number of found items

## Requirements

- Chrome 120+
- Internet connection to crawl the website

## License

MIT
