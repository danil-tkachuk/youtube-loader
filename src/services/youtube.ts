interface UploadProgressEvent {
  loaded: number;
  total: number;
  speed: number; // bytes/sec
  remainingTime: number; // seconds
}

/**
 * Opens Google OAuth consent screen in a centered popup window.
 */
export function openGoogleOAuthPopup(clientId: string): Window | null {
  const redirectUri = window.location.origin;
  const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scope)}&prompt=consent`;

  const width = 600;
  const height = 650;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;

  return window.open(
    authUrl,
    'google-oauth',
    `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes,scrollbars=yes`
  );
}

/**
 * Uploads a video file to YouTube using the Google Resumable Upload API.
 * Returns a cancel function.
 */
export function uploadVideoToYouTube(
  file: File,
  videoName: string,
  accessToken: string,
  onProgress: (progress: UploadProgressEvent) => void,
  onSuccess: (videoId: string) => void,
  onError: (error: string) => void
): () => void {
  let isCancelled = false;
  let xhrMetadata: XMLHttpRequest | null = null;
  let xhrUpload: XMLHttpRequest | null = null;

  const cancel = () => {
    isCancelled = true;
    if (xhrMetadata) xhrMetadata.abort();
    if (xhrUpload) xhrUpload.abort();
  };

  // Step 1: Initiate Resumable Upload Session by sending metadata
  xhrMetadata = new XMLHttpRequest();
  const initUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  xhrMetadata.open('POST', initUrl, true);
  xhrMetadata.setRequestHeader('Authorization', `Bearer ${accessToken}`);
  xhrMetadata.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
  xhrMetadata.setRequestHeader('X-Upload-Content-Length', file.size.toString());
  xhrMetadata.setRequestHeader('X-Upload-Content-Type', file.type || 'video/mp4');

  const metadataBody = {
    snippet: {
      title: videoName,
      description: 'Uploaded via YouTube Loader client application.',
      categoryId: '22', // People & Blogs (general category)
      defaultLanguage: 'ru'
    },
    status: {
      privacyStatus: 'unlisted', // Unlisted as requested: доступно по ссылке
      selfDeclaredMadeForKids: false // Not for kids: не для детей
    }
  };

  xhrMetadata.onreadystatechange = () => {
    if (isCancelled) return;

    if (xhrMetadata.readyState === 4) {
      if (xhrMetadata.status === 200 || xhrMetadata.status === 201) {
        const locationUrl = xhrMetadata.getResponseHeader('Location');
        if (locationUrl) {
          // Step 2: Upload the actual video file bytes
          startByteUpload(locationUrl);
        } else {
          onError('Failed to parse upload Location header from YouTube API.');
        }
      } else {
        handleApiError(xhrMetadata, onError);
      }
    }
  };

  xhrMetadata.onerror = () => {
    if (!isCancelled) onError('Network error initializing YouTube upload session.');
  };

  xhrMetadata.send(JSON.stringify(metadataBody));

  function startByteUpload(locationUrl: string) {
    if (isCancelled) return;

    const uploadXhr = new XMLHttpRequest();
    xhrUpload = uploadXhr;
    uploadXhr.open('PUT', locationUrl, true);
    // Don't set authorization header on the session URL (Google handles session auth via the URL token itself)
    uploadXhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    let startTime = Date.now();
    let lastLoaded = 0;
    let lastTime = startTime;

    uploadXhr.upload.onprogress = (event) => {
      if (isCancelled) return;

      if (event.lengthComputable) {
        const now = Date.now();
        const loaded = event.loaded;
        const total = event.total;

        // Calculate short-term speed (moving average)
        const timeDiff = (now - lastTime) / 1000; // in seconds
        let speed = 0;
        if (timeDiff > 0.1) {
          const bytesDiff = loaded - lastLoaded;
          speed = bytesDiff / timeDiff; // bytes per second
          lastLoaded = loaded;
          lastTime = now;
        } else {
          // Fallback to overall speed if updates are too fast
          const totalElapsed = (now - startTime) / 1000;
          speed = totalElapsed > 0 ? loaded / totalElapsed : 0;
        }

        // Calculate remaining time
        const remainingBytes = total - loaded;
        const remainingTime = speed > 0 ? remainingBytes / speed : 0;

        onProgress({
          loaded,
          total,
          speed,
          remainingTime
        });
      }
    };

    uploadXhr.onreadystatechange = () => {
      if (isCancelled) return;

      if (uploadXhr.readyState === 4) {
        if (uploadXhr.status === 200 || uploadXhr.status === 201) {
          try {
            const response = JSON.parse(uploadXhr.responseText);
            const videoId = response.id;
            if (videoId) {
              onSuccess(videoId);
            } else {
              onError('Video upload succeeded but no video ID was returned.');
            }
          } catch (e) {
            onError('Failed to parse YouTube upload response.');
          }
        } else {
          handleApiError(uploadXhr, onError);
        }
      }
    };

    uploadXhr.onerror = () => {
      if (!isCancelled) onError('Network error occurred during video content transmission.');
    };

    uploadXhr.send(file);
  }

  return cancel;
}

function handleApiError(xhr: XMLHttpRequest, onError: (error: string) => void) {
  try {
    const errorResponse = JSON.parse(xhr.responseText);
    const apiError = errorResponse?.error;
    if (apiError) {
      const message = apiError.errors?.[0]?.message || apiError.message || `API Error (${xhr.status})`;
      // Check for quota errors specifically to provide user-friendly alerts
      if (message.includes('quotaExceeded') || xhr.status === 403) {
        onError(`YouTube API Quota Limit Exceeded. A standard API project can only upload ~6 videos per day. ${message}`);
      } else {
        onError(message);
      }
    } else {
      onError(`YouTube API returned HTTP status ${xhr.status}`);
    }
  } catch (e) {
    onError(`YouTube API returned HTTP status ${xhr.status}: ${xhr.responseText || 'No response details'}`);
  }
}
