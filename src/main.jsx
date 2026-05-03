import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SandboxApp from './sandbox/SandboxApp.jsx';
import './styles/globals.css';

// Routing minimaliste par hash :
//   #sandbox → page autonome du tapis roulant (prototype isolé)
//   tout le reste → jeu principal (Le Jardin d'Agnès)
//
// Pas de react-router pour une simple bascule binaire — on écoute juste
// les changements de hash et on bascule le composant racine.
function Router() {
  const [route, setRoute] = useState(() =>
    typeof window !== 'undefined' && window.location.hash === '#sandbox' ? 'sandbox' : 'game'
  );
  useEffect(() => {
    const onHashChange = () => {
      setRoute(window.location.hash === '#sandbox' ? 'sandbox' : 'game');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route === 'sandbox' ? <SandboxApp /> : <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
