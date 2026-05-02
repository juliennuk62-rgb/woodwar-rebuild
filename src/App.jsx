import { useEffect } from 'react';
import GreenhouseScene from './three/GreenhouseScene.jsx';
import HUD from './ui/HUD.jsx';
import ShopPanel from './ui/ShopPanel.jsx';
import GardenersPanel from './ui/GardenersPanel.jsx';
import UpgradesPanel from './ui/UpgradesPanel.jsx';
import MarketPanel from './ui/MarketPanel.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import OfflineModal from './ui/OfflineModal.jsx';
import PanelLauncher from './ui/PanelLauncher.jsx';
import PlantsList from './ui/PlantsList.jsx';
import Onboarding from './ui/Onboarding.jsx';
import { useGameStore } from './store/gameStore.js';
import { startGameLoop, stopGameLoop } from './engine/tick.js';
import { setupAutosave } from './engine/save.js';

export default function App() {
  const ready = useGameStore((s) => s.ready);
  const activePanel = useGameStore((s) => s.activePanel);

  useEffect(() => {
    startGameLoop();
    const stopAutosave = setupAutosave();
    return () => {
      stopGameLoop();
      stopAutosave();
    };
  }, []);

  if (!ready) return <Loader />;

  return (
    <>
      <GreenhouseScene />
      <HUD />
      <PlantsList />
      <PanelLauncher />
      <ShopPanel />
      {activePanel === 'gardeners' && <GardenersPanel />}
      {activePanel === 'upgrades' && <UpgradesPanel />}
      {activePanel === 'market' && <MarketPanel />}
      <SettingsModal />
      <Onboarding />
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
