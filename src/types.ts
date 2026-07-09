export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'success' | 'error';

export interface VideoUpload {
  id: string;
  file: File;
  name: string;
  progress: number; // 0 to 100
  status: UploadStatus;
  youtubeId?: string;
  speed: number; // bytes per second
  remainingTime?: number; // seconds
  uploadedBytes: number;
  totalBytes: number;
  errorMessage?: string;
}

export interface OAuthToken {
  accessToken: string;
  expiresAt: number; // timestamp in ms
}

export interface UploaderConfig {
  clientId: string;
  namePrefix: string;
}

// Google Identity Services types declaration
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: any) => void;
          }): TokenClient;
        };
      };
    };
  }
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}
