import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { SEASON_INFO } from '../mechanics/weather.js';
import GreenhouseFloor from './GreenhouseFloor.jsx';
import PlantSlot from './PlantSlot.jsx';
import IsometricCamera from './IsometricCamera.jsx';
import SeasonalParticles from './SeasonalParticles.jsx';

const ISO_POSITION = [12, 12, 12];

export default function GreenhouseScene() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const season = useGameStore((s) => s.market.currentSeason);
  const config = GREENHOUSES[ghId];
  const slots = useMemo(() => buildSlotPositions(greenhouse.slots), [greenhouse.slots]);

  return (
    <div className="scene-canvas">
      <Canvas
        orthographic
        camera={{ position: ISO_POSITION, near: 0.1, far: 200, zoom: 40 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        flat
        shadows={false}
      >
        <IsometricCamera />

        <color attach="background" args={[seasonBackground(season)]} />
        <fog attach="fog" args={[seasonBackground(season), 30, 70]} />

        <SceneLights season={season} accent={config.accentColor} />

        <Suspense fallback={null}>
          <GreenhouseFloor color={config.floorColor} accent={config.accentColor} />
          {slots.map((slot) => (
            <PlantSlot key={slot.id} slot={slot} />
          ))}
          <SeasonalParticles />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Lumière qui suit la saison — couleurs et intensité du GDD §07.
function SceneLights({ season, accent }) {
  const cfg = LIGHTING_BY_SEASON[season] ?? LIGHTING_BY_SEASON.spring;
  return (
    <>
      <ambientLight intensity={cfg.ambient} color={cfg.ambientColor} />
      <directionalLight position={[10, 14, 6]} intensity={cfg.sun} color={cfg.sunColor} />
      <directionalLight position={[-8, 6, -4]} intensity={0.3} color={accent} />
    </>
  );
}

const LIGHTING_BY_SEASON = {
  spring: { ambient: 0.65, ambientColor: '#e8eee6', sun: 1.0, sunColor: '#fff5d8' },
  summer: { ambient: 0.85, ambientColor: '#fff5d8', sun: 1.3, sunColor: '#ffe8b0' },
  autumn: { ambient: 0.55, ambientColor: '#e0c0a0', sun: 0.85, sunColor: '#ffb070' },
  winter: { ambient: 0.55, ambientColor: '#c0d8e8', sun: 0.7, sunColor: '#cce0f0' },
};

function seasonBackground(season) {
  switch (season) {
    case 'summer': return '#0e120f';
    case 'autumn': return '#10100d';
    case 'winter': return '#0c1015';
    case 'spring':
    default:       return '#0d110e';
  }
}

function buildSlotPositions(count) {
  const cols = count <= 6 ? 3 : count <= 12 ? 4 : 6;
  const rows = Math.ceil(count / cols);
  const spacing = 1.6;
  const offsetX = ((cols - 1) * spacing) / 2;
  const offsetZ = ((rows - 1) * spacing) / 2;

  const slots = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    slots.push({
      id: i,
      position: [c * spacing - offsetX, 0, r * spacing - offsetZ],
    });
  }
  return slots;
}
