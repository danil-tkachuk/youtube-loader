import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Check if this is an OAuth popup callback redirecting back to our origin
if (window.opener && window.location.hash) {
  const params = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');
  const error = params.get('error_description') || params.get('error');

  if (accessToken || error) {
    window.opener.postMessage({
      type: 'GOOGLE_OAUTH_RESPONSE',
      accessToken,
      expiresIn: expiresIn ? parseInt(expiresIn) : 3600,
      error
    }, window.location.origin);

    // Render a simple styled callback status page that closes automatically
    document.body.innerHTML = `
      <div style="
        font-family: 'Inter', -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        height: 100vh;
        align-items: center;
        justify-content: center;
        background: #090d16;
        color: #f8fafc;
        text-align: center;
        gap: 16px;
      ">
        <h2 style="font-weight: 600; margin: 0;">${error ? 'Ошибка входа' : 'Вход выполнен!'}</h2>
        <p style="color: #94a3b8; margin: 0; font-size: 0.9rem;">
          ${error ? error : 'Это окно закроется автоматически.'}
        </p>
      </div>
    `;
    setTimeout(() => {
      window.close();
    }, 1000);
  }
} else {
  // Render main application only if we are not in the callback popup
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
