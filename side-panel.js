// Side panel script
const submitUrlBtn = document.getElementById('submitUrlBtn');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const emptyEl = document.getElementById('empty');
const resultsList = document.getElementById('resultsList');
const clearPlaylistBtn = document.getElementById('clearPlaylistBtn');
const clearButtonContainer = document.getElementById('clearButtonContainer');

// Audio player elements
const playerContainer = document.getElementById('playerContainer');
const audioPlayer = document.getElementById('audioPlayer');
const audioSource = document.getElementById('audioSource');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const prevBtn = document.getElementById('prevBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const nextBtn = document.getElementById('nextBtn');

let allAudioItems = [];
let currentPlayingIndex = -1;
let hasLoadedInitialState = false;

submitUrlBtn.addEventListener('click', crawlAudioWithManualUrl);
youtubeUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    crawlAudioWithManualUrl();
  }
});
prevBtn.addEventListener('click', playPrevious);
playPauseBtn.addEventListener('click', togglePlayPause);
nextBtn.addEventListener('click', playNext);
clearPlaylistBtn.addEventListener('click', clearPlaylist);

// Handle when audio ends - remove this listener since offscreen handles it
// audioPlayer.addEventListener('ended', () => {
//   playNext();
// });

// Handle play/pause events to sync with background
audioPlayer.addEventListener('play', (e) => {
  console.log('audioPlayer play event');
  // Prevent default local playback
  e.preventDefault();
  // Send message to background to sync state
  if (currentPlayingIndex >= 0 && allAudioItems.length > 0) {
    chrome.runtime.sendMessage({
      action: 'resumeAudio'
    }, (response) => {
      console.log('Resume audio response:', response);
    });
    savePlayerState();
  }
});

audioPlayer.addEventListener('pause', (e) => {
  console.log('audioPlayer pause event');
  chrome.runtime.sendMessage({
    action: 'pauseAudio'
  }, (response) => {
    console.log('Pause audio response:', response);
  });
  savePlayerState();
});

// Load initial state when panel opens
window.addEventListener('load', () => {
  loadPlayerStateFromStorage();
});

// Sync when panel becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && hasLoadedInitialState) {
    console.log('Panel visible, syncing with offscreen audio');
    syncAudioWithOffscreen();
  }
});

// Listen for audio ended event from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'audioEnded') {
    console.log('Received audioEnded event, playing next track');
    playNext();
  }
});

async function crawlAudioWithManualUrl() {
  const manualUrl = youtubeUrlInput.value.trim();
  
  // If text box is empty, try to get URL from current tab
  if (!manualUrl) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (currentTab && currentTab.url && currentTab.url.includes('youtube.com')) {
        const youtubeUrl = currentTab.url;
        const crawlUrl = `https://ph.tinhtong.vn/Home/AudioYoutube?link=${youtubeUrl}&max=600`;
        await performCrawl(crawlUrl);
      } else {
        showError('Please enter a YouTube URL or open a YouTube tab');
      }
    } catch (error) {
      console.error('Error getting current tab:', error);
      showError('Please enter a YouTube URL');
    }
    return;
  }
  
  await performCrawl(manualUrl);
}

async function crawlAudio() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    let crawlUrl = null;

    // Check if current tab is YouTube
    if (currentTab && currentTab.url && currentTab.url.includes('youtube.com')) {
      console.log('Current tab is YouTube, extracting URL from address bar:', currentTab.url);
      const youtubeUrl = currentTab.url;
      crawlUrl = `https://ph.tinhtong.vn/Home/AudioYoutube?link=${youtubeUrl}&max=600`;
      console.log('Generated crawl URL:', crawlUrl);
      await performCrawl(crawlUrl);
    } else {
      showError('Please open a YouTube tab, use the manual URL input, or paste a YouTube URL below.');
    }
  } catch (error) {
    console.error('Crawl error:', error);
    showError(error.message);
  }
}

async function performCrawl(crawlUrl) {
  try {
    // Show loading on button
    submitUrlBtn.disabled = true;
    youtubeUrlInput.disabled = true;
    submitUrlBtn.textContent = 'Loading...';

    console.log('Sending crawl request with URL:', crawlUrl);

    // Build the final crawl URL if it's just a YouTube URL
    let finalCrawlUrl = crawlUrl;
    if (!crawlUrl.includes('ph.tinhtong.vn')) {
      finalCrawlUrl = `https://ph.tinhtong.vn/Home/AudioYoutube?link=${crawlUrl}&max=600`;
    }

    // Send message to background script to crawl
    const response = await chrome.runtime.sendMessage({
      action: 'crawlAudio',
      url: finalCrawlUrl
    });

    console.log('Crawl response:', response);

    if (response.success) {
      displayResults(response.data);
      // Auto-play first link only if nothing is currently playing
      if (response.data.paired_results && response.data.paired_results.length > 0 && currentPlayingIndex === -1) {
        setTimeout(() => {
          playAudio(0);
        }, 500);
      }
    } else {
      showError(response.error || 'Failed to crawl content');
    }
  } catch (error) {
    console.error('Crawl error:', error);
    showError(error.message);
  } finally {
    // Restore button state
    submitUrlBtn.disabled = false;
    youtubeUrlInput.disabled = false;
    submitUrlBtn.textContent = 'Load';
  }
}

function displayResults(data) {
  const { paired_results } = data;

  if (!paired_results || paired_results.length === 0) {
    showError('No audio found. Try a different URL.');
    return;
  }

  // Filter out duplicates based on link URL
  const existingLinks = new Set(allAudioItems.map(item => item.link));
  const newItems = paired_results.filter(item => !existingLinks.has(item.link));
  
  if (newItems.length === 0) {
    // All items are duplicates, show message or current playlist
    if (allAudioItems.length > 0) {
      // Show existing playlist
      resultsEl.classList.remove('hidden');
      errorEl.classList.add('hidden');
      emptyEl.classList.add('hidden');
    } else {
      // No items at all
      showError('All items already in playlist');
    }
    return;
  }

  // Append new items to existing playlist instead of replacing
  const startIndex = allAudioItems.length;
  allAudioItems = allAudioItems.concat(newItems);
  
  // Save playlist to storage
  savePlayerState();

  // Append new items to the list
  newItems.forEach((item, index) => {
    const actualIndex = startIndex + index;
    const li = document.createElement('li');
    li.className = 'result-item';
    li.dataset.index = actualIndex;
    li.innerHTML = `
      <div class="result-item-content">
        <div class="result-item-title">${escapeHtml(decodeTitle(item.title))}</div>
        <button class="btn-delete" data-index="${actualIndex}" title="Remove from playlist">×</button>
      </div>
    `;
    
    // Add click handler to play audio (only on title area)
    li.querySelector('.result-item-title').addEventListener('click', (e) => {
      playAudio(actualIndex);
    });
    
    // Add click handler for delete button
    li.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(actualIndex);
    });
    
    resultsList.appendChild(li);
  });

  clearPlaylistBtn.textContent = `Clear Playlist (${allAudioItems.length})`;
  emptyEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');
  clearButtonContainer.classList.remove('hidden');
  
  // Don't hide player if it's currently playing
  // playerContainer state is managed by playback, not by adding items
}

function playAudio(index) {
  if (index < 0 || index >= allAudioItems.length) {
    console.error('Invalid index:', index);
    return;
  }

  const item = allAudioItems[index];
  currentPlayingIndex = index;

  console.log('Playing audio at index:', index, 'URL:', item.link);

  // Update UI elements
  nowPlayingTitle.textContent = item.title;
  playerContainer.classList.remove('hidden');
  updateHighlight();

  // Update local audio player for UI controls (time, progress)
  audioSource.src = item.link;
  audioPlayer.load();

  // Send play command to background (which will route to offscreen document)
  chrome.runtime.sendMessage({
    action: 'playAudio',
    url: item.link
  }, (response) => {
    if (response && response.success) {
      console.log('Audio play command sent successfully');
      // Update play/pause button
      playPauseBtn.textContent = '⏸';
      // Sync the local audio player with offscreen
      syncAudioWithOffscreen();
    } else {
      console.error('Failed to play audio:', response?.error || 'Unknown error');
    }
  });

  // Save player state
  savePlayerState();

  // Scroll to the playing item
  const playingElement = document.querySelector(`[data-index="${index}"]`);
  if (playingElement) {
    playingElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function playNext() {
  if (currentPlayingIndex < allAudioItems.length - 1) {
    playAudio(currentPlayingIndex + 1);
  }
}

function playPrevious() {
  if (currentPlayingIndex > 0) {
    playAudio(currentPlayingIndex - 1);
  }
}

function togglePlayPause() {
  chrome.runtime.sendMessage({ action: 'getAudioState' }, (response) => {
    if (response && response.success && response.state) {
      const isPlaying = response.state.isPlaying;
      
      if (isPlaying) {
        // Pause the audio
        chrome.runtime.sendMessage({ action: 'pauseAudio' }, () => {
          playPauseBtn.textContent = '▶';
        });
      } else {
        // Resume the audio
        chrome.runtime.sendMessage({ action: 'resumeAudio' }, () => {
          playPauseBtn.textContent = '⏸';
        });
      }
    }
  });
}

function deleteItem(index) {
  // Remove item from array
  allAudioItems.splice(index, 1);
  
  // Adjust current playing index
  if (index < currentPlayingIndex) {
    currentPlayingIndex--;
  } else if (index === currentPlayingIndex) {
    // If we deleted the currently playing item, stop playback
    chrome.runtime.sendMessage({ action: 'pauseAudio' });
    currentPlayingIndex = -1;
    playerContainer.classList.add('hidden');
  }
  
  // Refresh the display
  refreshPlaylist();
  
  // Save updated state
  savePlayerState();
}

function clearPlaylist() {
  if (!confirm('Are you sure you want to clear the entire playlist?')) {
    return;
  }
  
  // Stop playback
  chrome.runtime.sendMessage({ action: 'pauseAudio' });
  
  // Clear data
  allAudioItems = [];
  currentPlayingIndex = -1;
  
  // Hide player
  playerContainer.classList.add('hidden');
  
  // Clear UI
  resultsList.innerHTML = '';
  resultsEl.classList.add('hidden');
  clearButtonContainer.classList.add('hidden');
  emptyEl.classList.remove('hidden');
  
  // Save cleared state
  savePlayerState();
}

function refreshPlaylist() {
  if (allAudioItems.length === 0) {
    clearPlaylist();
    return;
  }
  
  // Re-render the list
  resultsList.innerHTML = '';
  allAudioItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.dataset.index = index;
    li.innerHTML = `
      <div class="result-item-content">
        <div class="result-item-title">${escapeHtml(decodeTitle(item.title))}</div>
        <button class="btn-delete" data-index="${index}" title="Remove from playlist">×</button>
      </div>
    `;
    
    // Add click handler to play audio
    li.querySelector('.result-item-title').addEventListener('click', (e) => {
      playAudio(index);
    });
    
    // Add click handler for delete button
    li.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(index);
    });
    
    resultsList.appendChild(li);
  });
  
  clearPlaylistBtn.textContent = `Clear Playlist (${allAudioItems.length})`;
  updateHighlight();
}

function updateHighlight() {
  // Remove playing class from all items
  document.querySelectorAll('.result-item').forEach(item => {
    item.classList.remove('playing');
  });

  // Add playing class to current item
  const playingElement = document.querySelector(`[data-index="${currentPlayingIndex}"]`);
  if (playingElement) {
    playingElement.classList.add('playing');
  }

  // Update button states
  prevBtn.disabled = currentPlayingIndex <= 0;
  nextBtn.disabled = currentPlayingIndex >= allAudioItems.length - 1;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');
  resultsEl.classList.add('hidden');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function decodeTitle(title) {
  try {
    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = title;
    return textarea.value;
  } catch (e) {
    return title;
  }
}

// Save player state to chrome storage
function savePlayerState() {
  const state = {
    allAudioItems: allAudioItems,
    currentPlayingIndex: currentPlayingIndex,
    nowPlayingTitle: nowPlayingTitle.textContent,
    isPlaying: !audioPlayer.paused,
    currentTime: audioPlayer.currentTime
  };
  
  chrome.runtime.sendMessage({
    action: 'savePlayerState',
    state: state
  }, (response) => {
    if (response && response.success) {
      console.log('Player state saved');
    }
  });
}

// Load player state from chrome storage
function loadPlayerStateFromStorage() {
  chrome.runtime.sendMessage(
    { action: 'getPlayerState' },
    (response) => {
      if (response && response.success && response.state) {
        const savedState = response.state;
        
        // Restore playlist
        if (savedState.allAudioItems && savedState.allAudioItems.length > 0) {
          allAudioItems = savedState.allAudioItems;
          currentPlayingIndex = savedState.currentPlayingIndex || 0;
          
          // Restore UI with the saved playlist
          resultsList.innerHTML = '';
          allAudioItems.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'result-item';
            li.dataset.index = index;
            li.innerHTML = `
              <div class="result-item-content">
                <div class="result-item-title">${escapeHtml(decodeTitle(item.title))}</div>
                <button class="btn-delete" data-index="${index}" title="Remove from playlist">×</button>
              </div>
            `;
            
            li.querySelector('.result-item-title').addEventListener('click', (e) => {
              playAudio(index);
            });
            
            li.querySelector('.btn-delete').addEventListener('click', (e) => {
              e.stopPropagation();
              deleteItem(index);
            });
            
            resultsList.appendChild(li);
          });
          
          clearPlaylistBtn.textContent = `Clear Playlist (${allAudioItems.length})`;
          emptyEl.classList.add('hidden');
          errorEl.classList.add('hidden');
          resultsEl.classList.remove('hidden');
          clearButtonContainer.classList.remove('hidden');
          
          // Restore player state
          if (currentPlayingIndex >= 0 && allAudioItems[currentPlayingIndex]) {
            const item = allAudioItems[currentPlayingIndex];
            audioSource.src = item.link;
            nowPlayingTitle.textContent = item.title;
            playerContainer.classList.remove('hidden');
            updateHighlight();
            
            // Sync with offscreen audio state after a short delay to ensure offscreen is ready
            setTimeout(() => {
              syncAudioWithOffscreen();
            }, 500);
          }
          
          hasLoadedInitialState = true;
        }
      }
    }
  );
}

// Sync local audio player with offscreen audio state
function syncAudioWithOffscreen() {
  chrome.runtime.sendMessage({ action: 'getAudioState' }, (response) => {
    if (response && response.success && response.state) {
      const offscreenState = response.state;
      
      console.log('Syncing with offscreen state:', offscreenState);
      
      // Update play/pause button
      if (offscreenState.isPlaying) {
        playPauseBtn.textContent = '⏸';
      } else {
        playPauseBtn.textContent = '▶';
      }
      
      // Update local audio player to match offscreen state
      if (offscreenState.src) {
        // Set the source if it's different
        if (audioSource.src !== offscreenState.src) {
          audioSource.src = offscreenState.src;
          audioPlayer.load();
        }
        
        // Sync the time - always update to match offscreen
        if (offscreenState.currentTime !== undefined) {
          const timeDiff = Math.abs(audioPlayer.currentTime - offscreenState.currentTime);
          // Only update if difference is more than 1 second to avoid constant adjustments
          if (timeDiff > 1) {
            audioPlayer.currentTime = offscreenState.currentTime;
          }
        }
        
        // Sync play/pause state
        if (offscreenState.isPlaying && audioPlayer.paused) {
          audioPlayer.play().catch(() => {
            console.log('Local player play failed, but offscreen is playing');
          });
        } else if (!offscreenState.isPlaying && !audioPlayer.paused) {
          audioPlayer.pause();
        }
        
        // Continue syncing periodically while playing
        if (offscreenState.isPlaying) {
          setTimeout(() => syncAudioWithOffscreen(), 1000);
        }
      }
    }
  });
}
