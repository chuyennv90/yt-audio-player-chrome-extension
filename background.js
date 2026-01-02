// Background service worker

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'crawlAudio') {
    crawlAudioContent(request.url)
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
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
