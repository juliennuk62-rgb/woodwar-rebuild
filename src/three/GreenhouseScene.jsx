import { Canvas } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import GreenhouseFloor from './GreenhouseFloor.jsx';
import PlantSlot from './PlantSlot.jsx';

// Vue isométrique (45° H, 30° V) — caméra orthographique fixe.
const ISO_POSITION = [12, 12, 12];

export default function GreenhouseScene() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const slots = useMemo(() => buildSlotPositions(greenhouse.slots), [greenhouse.slots]);

  return (
    <div className="scene-canvas">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        flat
        shadows={false}
      >
        <color attach="background" args={['#0d110e']} />
        <fog attach="fog" args={['#0d110e', 25, 60]} />

        <OrthographicCamera
          makeDefault
          position={ISO_POSITION}
          zoom={48}
          near={0.1}
          far={200}
        />

        <SceneLights accent={config.accentColor} />

        <Suspense fallback={null}>
          <GreenhouseFloor color={config.floorColor} accent={config.accentColor} />
          {slots.map((slot) => (
            <PlantSlot key={slot.id} slot={slot} />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}

function SceneLights({ accent }) {
  return (
    <>
      <ambientLight intensity={0.55} color="#e8eee6" />
      <directionalLight
        position={[10, 14, 6]}
        intensity={1.1}
        color="#fff5d8"
      />
      <directionalLight
        position={[-8, 6, -4]}
        intensity={0.35}
        color={accent}
      />
    </>
  );
}

// Layout en grille — 6 / 12 / 24 slots selon la taille de la serre.
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
