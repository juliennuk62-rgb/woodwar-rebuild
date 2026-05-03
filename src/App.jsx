import { useEffect } from 'react';
import GreenhouseScene from './three/GreenhouseScene.jsx';
import HUD from './ui/HUD.jsx';
import ShopPanel from './ui/ShopPanel.jsx';
import GardenersPanel from './ui/GardenersPanel.jsx';
import UpgradesPanel from './ui/UpgradesPanel.jsx';
import MarketPanel from './ui/MarketPanel.jsx';
import ExpeditionPanel from './ui/ExpeditionPanel.jsx';
import LabPanel from './ui/LabPanel.jsx';
import QuestsPanel from './ui/QuestsPanel.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import GreenhouseSelector from './ui/GreenhouseSelector.jsx';
import PrestigeModal from './ui/PrestigeModal.jsx';
import SaveErrorBanner from './ui/SaveErrorBanner.jsx';
import OfflineModal from './ui/OfflineModal.jsx';
import DiscoveryModal from './ui/DiscoveryModal.jsx';
import MilestoneOverlay from './ui/MilestoneOverlay.jsx';
import PanelLauncher from './ui/PanelLauncher.jsx';
import PlantsList from './ui/PlantsList.jsx';
import Onboarding from './ui/Onboarding.jsx';
import ContextualTips from './ui/ContextualTips.jsx';
import MilestoneTips from './ui/MilestoneTips.jsx';
import ConfettiBurst from './ui/ConfettiBurst.jsx';
import { useGameStore } from './store/gameStore.js';
import { startGameLoop, stopGameLoop } from './engine/tick.js';
import { setupAutosave } from './engine/save.js';
import { bootstrapAudioOnFirstInteraction, audioManager } from './audio/audioManager.js';
import { Events as Analytics } from './utils/analytics.js';

export default function App() {
  const ready = useGameStore((s) => s.ready);
  const activePanel = useGameStore((s) => s.activePanel);

  useEffect(() => {
    startGameLoop();
    const stopAutosave = setupAutosave();
    bootstrapAudioOnFirstInteraction();
    // Propage les volumes initiaux après chargement du save
    const settings = useGameStore.getState().settings;
    if (settings) audioManager.setSettings(settings);
    Analytics.sessionStart();
    const sessionStart = Date.now();
    const onUnload = () => Analytics.sessionEnd(Date.now() - sessionStart);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      stopGameLoop();
      stopAutosave();
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  if (!ready) return <Loader />;

  return (
    <>
      <GreenhouseScene />
      <HUD />
      <GreenhouseSelector />
      <PrestigeModal />
      <PlantsList />
      <PanelLauncher />
      <ShopPanel />
      {activePanel === 'gardeners' && <GardenersPanel />}
      {activePanel === 'upgrades' && <UpgradesPanel />}
      {activePanel === 'market' && <MarketPanel />}
      {activePanel === 'expeditions' && <ExpeditionPanel />}
      {activePanel === 'lab' && <LabPanel />}
      {activePanel === 'quests' && <QuestsPanel />}
      <SettingsModal />
      <Onboarding />
      <ContextualTips />
      <MilestoneTips />
      <DiscoveryModal />
      <MilestoneOverlay />
      <OfflineModal />
      <SaveErrorBanner />
      <ConfettiBurst />
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
