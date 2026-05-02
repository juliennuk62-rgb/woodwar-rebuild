import { useEffect } from 'react';
import GreenhouseScene from './three/GreenhouseScene.jsx';
import HUD from './ui/HUD.jsx';
import ShopPanel from './ui/ShopPanel.jsx';
import OfflineModal from './ui/OfflineModal.jsx';
import { useGameStore } from './store/gameStore.js';
import { startGameLoop, stopGameLoop } from './engine/tick.js';
import { setupAutosave } from './engine/save.js';

export default function App() {
  const ready = useGameStore((s) => s.ready);

  useEffect(() => {
    startGameLoop();
    const stopAutosave = setupAutosave();
    return () => {
      stopGameLoop();
      stopAutosave();
    };
  }, []);

  if (!ready) {
    return <Loader />;
  }

  return (
    <>
      <GreenhouseScene />
      <HUD />
      <ShopPanel />
      <OfflineModal />
    </>
  );
}

function Loader() {
  return (
    <div className="loader">
      <div className="loader-title">Le Jardin d'Agnès</div>
      <div className="loader-sub">Préparation de la serre…</div>
    </div>
  );
}
