import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { auth0Configured, auth0Domain, auth0ClientId } from './lib/auth0'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {auth0Configured ? (
      <Auth0Provider
        domain={auth0Domain!}
        clientId={auth0ClientId!}
        authorizationParams={{ redirect_uri: window.location.origin, scope: 'openid profile email' }}
        onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}
      >
        <App />
      </Auth0Provider>
    ) : <App />}
  </StrictMode>,
)
