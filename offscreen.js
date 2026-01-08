// Offscreen document for persistent audio playback
console.log('Offscreen document loaded');

const audio = document.getElementById('backgroundAudio');
console.log('Audio element:', audio);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Offscreen received message:', request.action);
  try {
    if (request.action === 'playAudio') {
      console.log('Setting audio src to:', request.url);
      
      // Set source and wait for it to be ready before playing
      audio.src = request.url;
      
      // Wait for audio to be ready to play
      const playWhenReady = () => {
        audio.play()
          .then(() => {
            console.log('Audio playing successfully in offscreen document');
            sendResponse({ success: true });
          })
          .catch(err => {
            console.error('Failed to play audio in offscreen:', err);
            sendResponse({ success: false, error: err.message });
          });
      };
      
      // If audio is already ready, play immediately
      if (audio.readyState >= 2) {
        playWhenReady();
      } else {
        // Otherwise wait for canplay event
        const canPlayHandler = () => {
          audio.removeEventListener('canplay', canPlayHandler);
          playWhenReady();
        };
        audio.addEventListener('canplay', canPlayHandler);
        audio.load();
      }
      
      return true; // Keep channel open for async response
    } else if (request.action === 'pauseAudio') {
      console.log('Pausing audio');
      audio.pause();
      sendResponse({ success: true });
    } else if (request.action === 'resumeAudio') {
      console.log('Resuming audio');
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Audio resumed successfully in offscreen document');
            sendResponse({ success: true });
          })
          .catch(err => {
            console.error('Failed to resume audio in offscreen:', err);
            sendResponse({ success: false, error: err.message });
          });
      } else {
        sendResponse({ success: true });
      }
      return true; // Keep channel open for async response
    } else if (request.action === 'setAudioTime') {
      audio.currentTime = request.time;
      sendResponse({ success: true });
    } else if (request.action === 'getAudioState') {
      sendResponse({
        success: true,
        state: {
          currentTime: audio.currentTime,
          duration: audio.duration,
          isPlaying: !audio.paused,
          src: audio.src
        }
      });
    }
  } catch (err) {
    console.error('Error in offscreen document:', err);
    sendResponse({ success: false, error: err.message });
  }
});

// Notify background when audio ends
audio.addEventListener('ended', () => {
  console.log('Audio ended in offscreen document');
  try {
    chrome.runtime.sendMessage({
      action: 'audioEnded'
    }).catch(() => {
      console.log('Background not available for audio ended event');
    });
  } catch (err) {
    console.error('Error sending audio ended event:', err);
  }
});

audio.addEventListener('play', () => {
  console.log('Audio play event in offscreen document');
});

audio.addEventListener('pause', () => {
  console.log('Audio pause event in offscreen document');
});

audio.addEventListener('error', (e) => {
  console.error('Audio error in offscreen document:', e, audio.error);
});
