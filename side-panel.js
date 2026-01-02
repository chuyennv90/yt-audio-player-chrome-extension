// Side panel script
const crawlBtn = document.getElementById('crawlBtn');
const submitUrlBtn = document.getElementById('submitUrlBtn');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsEl = document.getElementById('results');
const emptyEl = document.getElementById('empty');
const resultsList = document.getElementById('resultsList');
const resultCount = document.getElementById('resultCount');

// Audio player elements
const playerContainer = document.getElementById('playerContainer');
const audioPlayer = document.getElementById('audioPlayer');
const audioSource = document.getElementById('audioSource');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let allAudioItems = [];
let currentPlayingIndex = -1;

crawlBtn.addEventListener('click', crawlAudio);
submitUrlBtn.addEventListener('click', crawlAudioWithManualUrl);
youtubeUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    crawlAudioWithManualUrl();
  }
});
prevBtn.addEventListener('click', playPrevious);
nextBtn.addEventListener('click', playNext);

// Handle when audio ends
audioPlayer.addEventListener('ended', () => {
  playNext();
});

async function crawlAudioWithManualUrl() {
  const manualUrl = youtubeUrlInput.value.trim();
  if (!manualUrl) {
    showError('Please enter a YouTube URL');
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
    // Show loading state
    emptyEl.classList.add('hidden');
    resultsEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');
    crawlBtn.disabled = true;
    submitUrlBtn.disabled = true;
    youtubeUrlInput.disabled = true;
    crawlBtn.textContent = 'Refreshing...';

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
      // Auto-play first link after successful crawl
      if (response.data.paired_results && response.data.paired_results.length > 0) {
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
    loadingEl.classList.add('hidden');
    crawlBtn.disabled = false;
    submitUrlBtn.disabled = false;
    youtubeUrlInput.disabled = false;
    crawlBtn.textContent = 'Refresh';
  }
}

function displayResults(data) {
  const { paired_results } = data;

  if (!paired_results || paired_results.length === 0) {
    showError('No audio found. Try a different URL.');
    return;
  }

  allAudioItems = paired_results;
  currentPlayingIndex = -1;

  // Display results
  resultsList.innerHTML = '';
  paired_results.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.dataset.index = index;
    li.innerHTML = `
      <div class="result-item-title">${escapeHtml(decodeTitle(item.title))}</div>
    `;
    
    // Add click handler to play audio
    li.addEventListener('click', (e) => {
      playAudio(index);
    });
    
    resultsList.appendChild(li);
  });

  resultCount.textContent = `${paired_results.length} items`;
  emptyEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');
  playerContainer.classList.add('hidden');
}

function playAudio(index) {
  if (index < 0 || index >= allAudioItems.length) {
    return;
  }

  const item = allAudioItems[index];
  currentPlayingIndex = index;

  // Update audio source
  audioSource.src = item.link;
  audioPlayer.load();
  audioPlayer.play();

  // Update now playing title
  nowPlayingTitle.textContent = item.title;

  // Show player
  playerContainer.classList.remove('hidden');

  // Highlight current playing item
  updateHighlight();

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
