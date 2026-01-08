// Background service worker
console.log('Background service worker started');

// Store audio player state
let playerState = {
  currentUrl: '',
  isPlaying: false,
  currentTime: 0,
  allAudioItems: [],
  currentPlayingIndex: -1
};

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  console.log('Checking/creating offscreen document, URL:', offscreenUrl);
  
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      console.log('Offscreen document already exists');
      return true;
    }
  } catch (err) {
    console.log('Error checking existing offscreen documents:', err);
  }

  try {
    // Create offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Keep playing audio in background when side panel is closed'
    });
    console.log('Created offscreen document');
    return true;
  } catch (err) {
    if (err.message.includes('Document already exists')) {
      console.log('Offscreen document already exists (caught in error)');
      return true;
    }
    console.error('Failed to create offscreen document:', err);
    return false;
  }
}

// Helper function to send message to offscreen document
async function sendToOffscreen(message) {
  try {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    console.log('sendToOffscreen called with action:', message.action);
    
    // Ensure offscreen document exists first
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    
    console.log('Found offscreen contexts:', contexts.length);
    
    if (contexts.length === 0) {
      // Offscreen document doesn't exist, create it
      console.log('Creating offscreen document...');
      await ensureOffscreenDocument();
      // Wait a moment for it to be created
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Send message to offscreen document
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        console.log('Response from offscreen for action', message.action, ':', response);
        if (chrome.runtime.lastError) {
          console.error('lastError:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  } catch (err) {
    console.error('Error sending message to offscreen:', err);
    throw err;
  }
}

// Initialize offscreen document on startup
ensureOffscreenDocument().catch(err => {
  console.error('Failed to create offscreen document:', err);
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  if (request.action === 'crawlAudio') {
    crawlAudioContent(request.url)
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'playAudio') {
    console.log('Processing playAudio action with URL:', request.url);
    // Route play command to offscreen document
    (async () => {
      try {
        const response = await sendToOffscreen({
          action: 'playAudio',
          url: request.url
        });
        console.log('Sending response for playAudio:', response);
        sendResponse(response || { success: true });
      } catch (err) {
        console.error('Failed to send play command to offscreen:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'pauseAudio') {
    console.log('Processing pauseAudio action');
    // Route pause command to offscreen document
    (async () => {
      try {
        const response = await sendToOffscreen({ action: 'pauseAudio' });
        playerState.isPlaying = false;
        sendResponse(response || { success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'resumeAudio') {
    console.log('Processing resumeAudio action');
    // Route resume command to offscreen document
    (async () => {
      try {
        const response = await sendToOffscreen({ action: 'resumeAudio' });
        playerState.isPlaying = true;
        sendResponse(response || { success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'savePlayerState') {
    playerState = { ...playerState, ...request.state };
    chrome.storage.local.set({ playerState }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === 'getPlayerState') {
    chrome.storage.local.get(['playerState'], (result) => {
      sendResponse({ success: true, state: result.playerState || playerState });
    });
    return true;
  } else if (request.action === 'getAudioState') {
    console.log('Processing getAudioState action');
    // Route getAudioState to offscreen document
    (async () => {
      try {
        const response = await sendToOffscreen({ action: 'getAudioState' });
        sendResponse(response);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'audioEnded') {
    console.log('Processing audioEnded action');
    // Get player state and auto-play next
    chrome.storage.local.get(['playerState'], (result) => {
      const state = result.playerState || playerState;
      if (state.allAudioItems && state.currentPlayingIndex >= 0) {
        const nextIndex = state.currentPlayingIndex + 1;
        if (nextIndex < state.allAudioItems.length) {
          // Update the current index
          playerState.currentPlayingIndex = nextIndex;
          chrome.storage.local.set({ playerState });
          
          // Play next audio
          const nextItem = state.allAudioItems[nextIndex];
          sendToOffscreen({
            action: 'playAudio',
            url: nextItem.link
          }).catch(err => {
            console.error('Failed to auto-play next track:', err);
          });
        }
      }
    });
  }
});

async function crawlAudioContent(customUrl) {
  const url = customUrl;

  if (!url) {
    throw new Error('No URL provided. Please open a YouTube tab and click Refresh.');
  }
  
  try {
    console.log('[Crawl] Starting crawl from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    console.log('[Crawl] HTML length:', html.length);

    // Step 1: Find script tag containing "const plChannelId ="
    console.log('[Crawl] Step 1: Looking for script tag with "const plChannelId ="');
    
    // Find all script tags and look for one that contains "const plChannelId ="
    const scriptTagRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let scriptMatch;
    let scriptContent = null;
    
    while ((scriptMatch = scriptTagRegex.exec(html)) !== null) {
      if (scriptMatch[1] && scriptMatch[1].includes('const plChannelId =')) {
        scriptContent = scriptMatch[1];
        console.log('[Crawl] Found script tag with "const plChannelId ="');
        break;
      }
    }
    
    if (!scriptContent) {
      console.log('[Crawl] Script tag not found');
      throw new Error('Could not find script tag with "const plChannelId ="');
    }

    console.log('[Crawl] Script content length:', scriptContent.length);
    console.log('[Crawl] First 500 chars of script:', scriptContent.substring(0, 500));
    console.log('[Crawl] ========== FULL SCRIPT CONTENT START ==========');
    console.log(scriptContent);
    console.log('[Crawl] ========== FULL SCRIPT CONTENT END ==========');

    // Step 2: Extract title array (t variable) and ID array (f variable)
    console.log('[Crawl] Step 2: Extracting t (title) and f (ID) let arrays');
    
    // Extract t array (titles) - let t = [...]
    const tMatch = scriptContent.match(/let\s+t\s*=\s*\[([\s\S]*?)\];/);
    let titles = [];
    if (tMatch && tMatch[1]) {
      const tContent = tMatch[1];
      console.log('[Crawl] Found let t array, extracting titles...');
      const titleMatches = tContent.match(/"([^"]*?)"/g);
      if (titleMatches) {
        titles = titleMatches.map(m => m.replace(/"/g, ''));
      }
    } else {
      console.log('[Crawl] Could not find let t = [...] array');
    }
    console.log('[Crawl] Found titles count:', titles.length);
    console.log('[Crawl] First 5 titles:', titles.slice(0, 5));

    // Extract f array (IDs) - let f = [...]
    const fMatch = scriptContent.match(/let\s+f\s*=\s*\[([\s\S]*?)\];/);
    let ids = [];
    if (fMatch && fMatch[1]) {
      const fContent = fMatch[1];
      console.log('[Crawl] Found let f array, extracting IDs...');
      const idMatches = fContent.match(/"([^"]*?)"/g);
      if (idMatches) {
        ids = idMatches.map(m => m.replace(/"/g, ''));
      }
    } else {
      console.log('[Crawl] Could not find let f = [...] array');
    }
    console.log('[Crawl] Found IDs count:', ids.length);
    console.log('[Crawl] First 5 IDs:', ids.slice(0, 5));

    // Step 3: Create links array from ID array
    console.log('[Crawl] Step 3: Creating links from IDs');
    const links = ids.map(id => `https://ph.tinhtong.vn/Home/GetAudioYoutube/${id}`);
    console.log('[Crawl] Created links count:', links.length);
    console.log('[Crawl] First 5 links:', links.slice(0, 5));

    // Step 4: Match title and link by index
    console.log('[Crawl] Step 4: Matching titles with links by index');
    const maxLength = Math.max(titles.length, links.length);
    const results = [];
    
    for (let i = 0; i < maxLength; i++) {
      results.push({
        title: titles[i] || `Audio ${i + 1}`,
        link: links[i] || ''
      });
    }
    
    console.log('[Crawl] Final results count:', results.length);
    console.log('[Crawl] Final result:', results);

    return {
      free_media_links: links,
      playlist_items_titles: titles,
      paired_results: results
    };
  } catch (error) {
    console.error('[Crawl] Error:', error);
    throw new Error(`Failed to crawl: ${error.message}`);
  }
}
