import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import GreenhouseFloor from './GreenhouseFloor.jsx';
import PlantSlot from './PlantSlot.jsx';

// Vue isométrique : caméra orthographique placée en (12, 12, 12) et qui
// regarde l'origine. Le zoom est adaptatif pour que la serre tienne dans
// l'écran sur tous les formats (mobile portrait, paysage, desktop).
const ISO_POSITION = [12, 12, 12];

// On veut voir au minimum cette zone (en world units) — la serre fait 12×10.
const MIN_FRAME_WIDTH = 15;
const MIN_FRAME_HEIGHT = 12;

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.position.set(ISO_POSITION[0], ISO_POSITION[1], ISO_POSITION[2]);
    camera.lookAt(0, 0, 0);
    const zoomFromW = size.width / MIN_FRAME_WIDTH;
    const zoomFromH = size.height / MIN_FRAME_HEIGHT;
    camera.zoom = Math.max(20, Math.min(zoomFromW, zoomFromH));
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export default function GreenhouseScene() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const slots = useMemo(() => buildSlotPositions(greenhouse.slots), [greenhouse.slots]);

  return (
    <div className="scene-canvas">
      <Canvas
        orthographic
        camera={{ position: ISO_POSITION, near: 0.1, far: 200, zoom: 40 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        flat
        shadows={false}
      >
        <CameraRig />
        <color attach="background" args={['#0d110e']} />
        <fog attach="fog" args={['#0d110e', 28, 60]} />

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
      <ambientLight intensity={0.65} color="#e8eee6" />
      <directionalLight position={[10, 14, 6]} intensity={1.1} color="#fff5d8" />
      <directionalLight position={[-8, 6, -4]} intensity={0.35} color={accent} />
    </>
  );
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
