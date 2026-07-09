import { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Play, 
  X, 
  ExternalLink, 
  Copy, 
  FileVideo, 
  Info, 
  Lock, 
  User,
  Check
} from 'lucide-react';
import type { VideoUpload } from './types';
import { openGoogleOAuthPopup, uploadVideoToYouTube } from './services/youtube';

// Custom Youtube icon component since brand icons were removed in Lucide 1.0
const Youtube = ({ size = 24, fill = "none", className, style }: { size?: number; fill?: string; className?: string; style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" fill="currentColor" />
  </svg>
);


export default function App() {
  // Config & Auth State
  const [clientId, setClientId] = useState<string>(() => {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem('yt_loader_client_id') || '';
  });
  const [namePrefix, setNamePrefix] = useState<string>(() => {
    return localStorage.getItem('yt_loader_name_prefix') || 'Мое видео';
  });
  
  const [accessToken, setAccessToken] = useState<string>('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number>(0);
  const [channelInfo, setChannelInfo] = useState<{ name: string; avatar: string } | null>(null);
  
  // UI State
  const [showSettings, setShowSettings] = useState<boolean>(!clientId);
  const [tempClientId, setTempClientId] = useState<string>(clientId);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Upload Queue State
  const [uploads, setUploads] = useState<VideoUpload[]>([]);
  const [isUploadingBatch, setIsUploadingBatch] = useState<boolean>(false);
  
  // Ref to hold active uploads and cancel functions
  const cancelTokens = useRef<{ [key: string]: () => void }>({});
  const isUploadingBatchRef = useRef<boolean>(false);
  isUploadingBatchRef.current = isUploadingBatch;

  // Listen for Google OAuth callback message from the popup window
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Check message origin to prevent CSRF
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_OAUTH_RESPONSE') {
        setIsAuthLoading(false);
        const { accessToken: token, expiresIn, error } = event.data;
        if (error) {
          setAuthError(error);
        } else if (token) {
          setAccessToken(token);
          const expiresAt = Date.now() + expiresIn * 1000;
          setTokenExpiresAt(expiresAt);
          setAuthError('');
          // Fetch channel info
          fetchChannelInfo(token);
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Fetch YouTube channel details for premium profile display
  const fetchChannelInfo = async (token: string) => {
    try {
      const response = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const snippet = data?.items?.[0]?.snippet;
        if (snippet) {
          setChannelInfo({
            name: snippet.title,
            avatar: snippet.thumbnails?.default?.url || '',
          });
        }
      }
    } catch (e) {
      console.error('Failed to fetch channel info', e);
    }
  };

  // Handle Sign In trigger
  const handleSignIn = () => {
    if (!clientId) {
      setShowSettings(true);
      return;
    }
    
    setIsAuthLoading(true);
    setAuthError('');
    
    const popup = openGoogleOAuthPopup(clientId);
    
    if (!popup) {
      setIsAuthLoading(false);
      setAuthError('Не удалось открыть окно авторизации. Пожалуйста, разрешите всплывающие окна в браузере.');
      return;
    }

    // Monitor if user closed popup without completing auth
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        setIsAuthLoading(prevLoading => {
          if (prevLoading) {
            return false;
          }
          return prevLoading;
        });
      }
    }, 500);
  };

  // Handle Sign Out
  const handleSignOut = () => {
    setAccessToken('');
    setTokenExpiresAt(0);
    setChannelInfo(null);
  };

  // Save Settings Modal
  const handleSaveSettings = () => {
    const trimmedId = tempClientId.trim();
    setClientId(trimmedId);
    localStorage.setItem('yt_loader_client_id', trimmedId);
    setShowSettings(false);
  };

  // Drag & Drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  // Smart naming logic for file selection
  const addFilesToQueue = (files: File[]) => {
    const videoFiles = files.filter(file => file.type.startsWith('video/'));
    
    if (videoFiles.length === 0) {
      alert('Пожалуйста, выберите видео файлы (MP4, WebM, MOV и т.д.)');
      return;
    }

    const newUploads: VideoUpload[] = videoFiles.map((file, index) => {
      const id = Math.random().toString(36).substring(2, 11);
      
      // Calculate title
      let calculatedName = namePrefix;
      
      if (videoFiles.length > 1) {
        // If user input contains placeholder '{}' or '#', replace it
        if (namePrefix.includes('{}')) {
          calculatedName = namePrefix.replace('{}', (uploads.length + index + 1).toString());
        } else if (namePrefix.includes('#')) {
          calculatedName = namePrefix.replace('#', `#${uploads.length + index + 1}`);
        } else {
          // Otherwise, append part index
          calculatedName = `${namePrefix} — Часть ${uploads.length + index + 1}`;
        }
      } else {
        // Single file, if prefix has placeholder replace with 1, else use as-is
        if (namePrefix.includes('{}')) {
          calculatedName = namePrefix.replace('{}', '1');
        } else {
          calculatedName = namePrefix;
        }
      }

      return {
        id,
        file,
        name: calculatedName,
        progress: 0,
        status: 'queued',
        speed: 0,
        uploadedBytes: 0,
        totalBytes: file.size,
      };
    });

    setUploads(prev => [...prev, ...newUploads]);
  };

  // Remove file from queue (and cancel if uploading)
  const handleRemoveUpload = (id: string) => {
    if (cancelTokens.current[id]) {
      cancelTokens.current[id]();
      delete cancelTokens.current[id];
    }
    setUploads(prev => prev.filter(item => item.id !== id));
  };

  // Check if token is expired (or expiring in 30 seconds)
  const isTokenExpired = () => {
    return !accessToken || Date.now() > tokenExpiresAt - 30 * 1000;
  };

  // Batch Sequential Uploader
  const handleStartUploads = async () => {
    if (isTokenExpired()) {
      alert('Срок действия сессии Google истек. Пожалуйста, авторизуйтесь снова.');
      handleSignIn();
      return;
    }

    setIsUploadingBatch(true);
    
    // Process one video at a time
    while (true) {
      // Get the list of current uploads from state ref / query latest state
      let nextToUpload: VideoUpload | undefined;
      
      // We need to fetch the fresh state of uploads
      setUploads(currentUploads => {
        nextToUpload = currentUploads.find(item => item.status === 'queued');
        return currentUploads;
      });

      if (!nextToUpload) {
        break;
      }

      const activeId = nextToUpload.id;
      
      try {
        await executeSingleUpload(activeId);
      } catch (error) {
        console.error(`Upload error for ID ${activeId}:`, error);
      }
    }

    setIsUploadingBatch(false);
  };

  // Promise wrapper to execute a single video upload and track status
  const executeSingleUpload = (id: string): Promise<void> => {
    return new Promise((resolve) => {
      setUploads(current => 
        current.map(item => item.id === id ? { ...item, status: 'uploading' } : item)
      );

      // Extract details
      let activeItem: VideoUpload | undefined;
      setUploads(current => {
        activeItem = current.find(item => item.id === id);
        return current;
      });

      if (!activeItem) {
        resolve();
        return;
      }

      const cancelFn = uploadVideoToYouTube(
        activeItem.file,
        activeItem.name,
        accessToken,
        (progress) => {
          setUploads(current =>
            current.map(item =>
              item.id === id
                ? {
                    ...item,
                    progress: Math.round((progress.loaded / progress.total) * 100),
                    uploadedBytes: progress.loaded,
                    speed: progress.speed,
                    remainingTime: progress.remainingTime,
                  }
                : item
            )
          );
        },
        (videoId) => {
          setUploads(current =>
            current.map(item =>
              item.id === id
                ? {
                    ...item,
                    progress: 100,
                    status: 'success',
                    youtubeId: videoId,
                  }
                : item
            )
          );
          delete cancelTokens.current[id];
          resolve();
        },
        (errorMsg) => {
          setUploads(current =>
            current.map(item =>
              item.id === id
                ? {
                    ...item,
                    status: 'error',
                    errorMessage: errorMsg,
                  }
                : item
            )
          );
          delete cancelTokens.current[id];
          resolve(); // Resolve to let the queue process the next item
        }
      );

      cancelTokens.current[id] = cancelFn;
    });
  };

  // Helper formatting functions
  const formatSpeed = (bytesPerSec: number): string => {
    if (bytesPerSec === 0) return '0 Б/с';
    const k = 1024;
    const sizes = ['Б/с', 'КБ/с', 'МБ/с', 'ГБ/с'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number | undefined): string => {
    if (seconds === undefined || isNaN(seconds) || seconds === Infinity) return '--:--';
    if (seconds < 60) return `${Math.round(seconds)}с`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins < 60) return `${mins}м ${secs}с`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}ч ${remainingMins}м`;
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Copy to clipboard utility
  const copyLink = (videoId: string, itemId: string) => {
    const url = `https://youtu.be/${videoId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(itemId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Clear completed uploads
  const handleClearCompleted = () => {
    setUploads(prev => prev.filter(item => item.status !== 'success' && item.status !== 'error'));
  };

  // Update name prefix settings
  const handleNamePrefixChange = (val: string) => {
    setNamePrefix(val);
    localStorage.setItem('yt_loader_name_prefix', val);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-title-section">
          <Youtube className="header-icon" size={32} />
          <div>
            <h1>YouTube Loader</h1>
            <p>Пакетная автоматическая загрузка видео на YouTube по ссылке</p>
          </div>
        </div>
        <div className="header-actions">
          {(!import.meta.env.VITE_GOOGLE_CLIENT_ID || new URLSearchParams(window.location.search).get('debug') === 'true') && (
            <button 
              className="btn-icon-only" 
              title="Настройки Google API" 
              onClick={() => {
                setTempClientId(clientId);
                setShowSettings(true);
              }}
            >
              <Settings size={20} />
            </button>
          )}
          
          {accessToken ? (
            <button className="btn-icon-only" title="Выйти" onClick={handleSignOut}>
              <LogOut size={20} />
            </button>
          ) : null}
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>
                <Settings size={20} className="header-icon" />
                Настройки интеграции Google
              </h3>
              <button className="btn-icon-only" style={{border: 'none', background: 'transparent'}} onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.4 }}>
                Для работы сайта необходимо создать <strong>OAuth Client ID</strong> в Google Cloud Console и включить YouTube Data API v3. 
                Не забудьте добавить текущий URL в <em>Authorized JavaScript Origins</em>.
              </p>
              <div className="form-group">
                <label>Google OAuth Client ID</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    className="input-text"
                    placeholder="xxxxxx-xxxxxxxx.apps.googleusercontent.com"
                    value={tempClientId}
                    onChange={(e) => setTempClientId(e.target.value)}
                  />
                  <Lock className="input-icon" size={16} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSettings(false)} style={{width: 'auto'}}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={!tempClientId.trim()} style={{width: 'auto'}}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Dashboard Layout */}
      <div className="dashboard-grid">
        
        {/* Left Side: Settings & Auth */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Authorization Panel */}
          <div className="glass-card">
            <h3 className="card-title">
              <User size={18} />
              Авторизация Google
            </h3>
            <div className="auth-panel">
              {accessToken ? (
                <>
                  <div className="user-profile">
                    {channelInfo?.avatar ? (
                      <img src={channelInfo.avatar} alt="Avatar" className="user-avatar" />
                    ) : (
                      <div className="user-avatar" style={{ background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyItems: 'center' }}>
                        <User size={20} style={{margin: 'auto'}} />
                      </div>
                    )}
                    <div className="user-info">
                      <div className="user-name">{channelInfo?.name || 'YouTube канал'}</div>
                      <div className="user-status">
                        <span className="status-dot"></span>
                        Подключено
                      </div>
                    </div>
                  </div>
                  <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center'}}>
                    Токен активен. Вы можете загружать видео.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Войдите через Google, чтобы предоставить приложению доступ к загрузке видео на ваш YouTube канал.
                  </p>
                  {authError && (
                    <div className="error-alert">
                      <AlertCircle size={16} />
                      <span>{authError}</span>
                    </div>
                  )}
                  <button 
                    className="btn btn-primary" 
                    onClick={handleSignIn}
                    disabled={isAuthLoading}
                  >
                    <Youtube size={18} />
                    {isAuthLoading ? 'Инициализация...' : 'Войти через Google'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Upload Configuration Panel */}
          <div className="glass-card">
            <h3 className="card-title">
              <Info size={18} />
              Параметры видео
            </h3>
            
            <div className="form-group">
              <label>
                Название видео
                <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>Шаблон: {} или #</span>
              </label>
              <div className="input-wrapper">
                <input
                  type="text"
                  className="input-text"
                  placeholder="Пример: Vlog {}"
                  value={namePrefix}
                  onChange={(e) => handleNamePrefixChange(e.target.value)}
                />
                <FileVideo className="input-icon" size={16} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                При загрузке нескольких файлов, скобки <code>{}</code> или <code>#</code> автоматически заменятся на порядковый номер.
              </p>
            </div>

            <div className="locked-params-info">
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', fontSize: '0.85rem' }}>
                Автоматические настройки:
              </div>
              <div className="locked-param-item">
                <CheckCircle2 size={14} />
                <span>Доступ по ссылке (Unlisted)</span>
              </div>
              <div className="locked-param-item">
                <CheckCircle2 size={14} />
                <span>Параметр: Не для детей (Not for Kids)</span>
              </div>
            </div>
          </div>

          {/* Helper Guide */}
          {(!import.meta.env.VITE_GOOGLE_CLIENT_ID || new URLSearchParams(window.location.search).get('debug') === 'true') ? (
            <div className="helper-box">
              <h4>Как начать работу:</h4>
              <ol>
                <li>Нажмите шестеренку сверху справа и введите ваш <code>OAuth Client ID</code>.</li>
                <li>Нажмите кнопку <strong>Войти через Google</strong> и разрешите доступ.</li>
                <li>Перетащите видео в зону загрузки справа.</li>
                <li>Задайте нужное имя.</li>
                <li>Нажмите кнопку <strong>Запустить загрузку</strong>.</li>
              </ol>
            </div>
          ) : (
            <div className="helper-box">
              <h4>Как начать работу:</h4>
              <ol>
                <li>Нажмите кнопку <strong>Войти через Google</strong> и авторизуйтесь.</li>
                <li>Перетащите видео в зону загрузки справа.</li>
                <li>Задайте нужное имя в панели «Параметры видео».</li>
                <li>Нажмите кнопку <strong>Запустить загрузку файлов</strong>.</li>
              </ol>
            </div>
          )}

        </div>

        {/* Right Side: Upload queue & Dropzone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Dropzone */}
          <div 
            className={`dropzone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-picker')?.click()}
          >
            <Upload className="dropzone-icon" size={48} />
            <div className="dropzone-title">Перетащите видео сюда или кликните для выбора</div>
            <div className="dropzone-subtitle">Поддерживаются любые популярные видео-форматы</div>
            <input 
              id="file-picker" 
              type="file" 
              className="file-input" 
              multiple 
              accept="video/*" 
              onChange={handleFileSelect} 
            />
          </div>

          {/* Queue List Area */}
          <div className="glass-card" style={{ flexGrow: 1 }}>
            <div className="queue-header">
              <h3 className="queue-title" style={{ marginBottom: 0 }}>
                Очередь загрузки
                {uploads.length > 0 && (
                  <span className="queue-badge">{uploads.length}</span>
                )}
              </h3>
              {uploads.some(item => item.status === 'success' || item.status === 'error') && !isUploadingBatch && (
                <button className="btn btn-secondary" onClick={handleClearCompleted} style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}>
                  Очистить завершенные
                </button>
              )}
            </div>

            <div className="queue-list">
              {uploads.length === 0 ? (
                <div className="empty-queue">
                  <FileVideo size={48} strokeWidth={1} />
                  <div>Очередь пуста</div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Добавьте файлы, перетащив их выше, чтобы начать
                  </p>
                </div>
              ) : (
                uploads.map((item) => (
                  <div key={item.id} className={`queue-item status-${item.status}`}>
                    
                    {/* Item Top Row */}
                    <div className="item-top">
                      <div className="item-meta">
                        <div className="item-name">{item.name}</div>
                        <div className="item-filename">
                          {item.file.name} • {formatSize(item.totalBytes)}
                        </div>
                      </div>
                      
                      <div className="item-right">
                        <span className={`status-badge ${item.status}`}>
                          {item.status === 'queued' && 'В очереди'}
                          {item.status === 'uploading' && 'Загрузка'}
                          {item.status === 'processing' && 'Обработка'}
                          {item.status === 'success' && 'Завершено'}
                          {item.status === 'error' && 'Ошибка'}
                        </span>
                        
                        {!isUploadingBatch && (
                          <button 
                            className="item-action-btn"
                            title="Удалить"
                            onClick={() => handleRemoveUpload(item.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {isUploadingBatch && item.status === 'uploading' && (
                          <button 
                            className="item-action-btn"
                            title="Отмена"
                            onClick={() => handleRemoveUpload(item.id)}
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar (Visible when uploading/processing or success) */}
                    {(item.status === 'uploading' || item.status === 'success' || item.progress > 0) && (
                      <div className="item-progress-section">
                        <div className="progress-bar-container">
                          <div 
                            className="progress-bar-fill"
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        </div>
                        <div className="progress-stats">
                          <span>{item.progress}%</span>
                          {item.status === 'uploading' && item.speed > 0 && (
                            <div className="progress-speed-eta">
                              <span>{formatSpeed(item.speed)}</span>
                              <span>Осталось: {formatTime(item.remainingTime)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Error Box */}
                    {item.status === 'error' && item.errorMessage && (
                      <div className="error-alert">
                        <AlertCircle size={14} />
                        <span>{item.errorMessage}</span>
                      </div>
                    )}

                    {/* Success YouTube Link Box */}
                    {item.status === 'success' && item.youtubeId && (
                      <div className="success-link-box">
                        <a 
                          href={`https://youtu.be/${item.youtubeId}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="success-link-text"
                        >
                          <Youtube size={14} style={{ color: 'var(--color-error)' }} />
                          youtu.be/{item.youtubeId}
                          <ExternalLink size={12} />
                        </a>
                        <button 
                          className="copy-btn" 
                          title="Скопировать ссылку"
                          onClick={() => copyLink(item.youtubeId!, item.id)}
                        >
                          {copiedId === item.id ? <Check size={14} style={{color: 'var(--color-success)'}} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}

                  </div>
                ))
              )}
            </div>

            {/* Action Trigger Footer */}
            {uploads.length > 0 && (
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleStartUploads}
                  disabled={isUploadingBatch || !accessToken || uploads.every(item => item.status === 'success')}
                  style={{ gap: '10px' }}
                >
                  <Play size={18} fill="currentColor" />
                  {isUploadingBatch 
                    ? 'Выполняется загрузка...' 
                    : !accessToken 
                      ? 'Авторизуйтесь для загрузки' 
                      : 'Запустить загрузку файлов'
                  }
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
