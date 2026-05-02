import { useState, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore.js';
import { PLANTS } from '../config/plants.js';
import { getPlantStage } from '../engine/economy.js';
import { getToonGradient } from './toon.js';
import { clickWasDrag } from './IsometricCamera.jsx';
import PlantMesh from './PlantMesh.jsx';
import PollenBurst from './PollenBurst.jsx';
import FloatingNumber3D from './FloatingNumber3D.jsx';

// Pot de plantation : pot en terre cuite + plante (si plantée) + halo
// d'interaction + particules à la floraison + floating numbers attachés.
export default function PlantSlot({ slot }) {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const plant = greenhouse.plants.find((p) => p.slotId === slot.id);
  const harvest = useGameStore((s) => s.harvestPlant);
  const slotFloats = useGameStore((s) =>
    s.floatingNumbers.filter((f) => f.slotId === slot.id)
  );

  const [hover, setHover] = useState(false);
  const [growth, setGrowth] = useState(0);
  const wasMatureRef = useRef(false);
  const [burstId, setBurstId] = useState(0);

  useFrame(() => {
    if (!plant) {
      if (growth !== 0) setGrowth(0);
      wasMatureRef.current = false;
      return;
    }
    const { ratio } = getPlantStage(plant, undefined, greenhouse);
    if (Math.abs(ratio - growth) > 0.005) setGrowth(ratio);

    // Détection de floraison → spawn particules de pollen une fois
    const isMature = ratio >= 1;
    if (isMature && !wasMatureRef.current) {
      setBurstId((id) => id + 1);
    }
    wasMatureRef.current = isMature;
  });

  const onClick = (e) => {
    if (clickWasDrag()) return;
    e?.stopPropagation?.();
    if (!plant) {
      window.dispatchEvent(new CustomEvent('jardin:open-shop', { detail: { slotId: slot.id } }));
      return;
    }
    if (growth >= 1) harvest(slot.id, { manual: true });
  };

  const ready = plant && growth >= 1;
  const accent = plant ? PLANTS[plant.speciesId].petalColor : '#7ec87a';

  return (
    <group
      position={slot.position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      onClick={onClick}
    >
      <Pot accentHover={hover || ready} ready={ready} accent={accent} />
      {plant && <PlantMesh species={PLANTS[plant.speciesId]} growth={growth} />}
      {plant && burstId > 0 && <PollenBurst key={burstId} color={accent} />}
      {slotFloats.map((f) => (
        <FloatingNumber3D
          key={f.id}
          id={f.id}
          amount={f.amount}
          kind={f.kind}
          createdAt={f.createdAt}
        />
      ))}
    </group>
  );
}

function Pot({ accentHover, ready, accent }) {
  const grad = useMemo(() => getToonGradient(), []);
  const ringColor = ready ? accent : (accentHover ? '#d4a84b' : '#3a3326');

  return (
    <group>
      {/* Pot en terre cuite */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.45, 0.4, 0.3, 14]} />
        <meshToonMaterial color="#a85a35" gradientMap={grad} />
      </mesh>
      {/* Liseré supérieur */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.05, 14]} />
        <meshToonMaterial color="#7a3f22" gradientMap={grad} />
      </mesh>
      {/* Terre */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 14]} />
        <meshToonMaterial color="#3a2410" gradientMap={grad} />
      </mesh>
      {/* Halo de sélection — anneau au sol */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 28]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={ready ? 0.85 : (accentHover ? 0.6 : 0.18)}
        />
      </mesh>
    </group>
  );
}
