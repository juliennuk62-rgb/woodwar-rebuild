import { useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore.js';
import { PLANTS } from '../config/plants.js';
import { getPlantStage } from '../engine/economy.js';
import PlantMesh from './PlantMesh.jsx';

// Une case de plantation — gère son propre état d'animation pour ne pas
// re-render tout l'arbre React à chaque tick.
export default function PlantSlot({ slot }) {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const plant = useGameStore((s) =>
    s.greenhouses[ghId].plants.find((p) => p.slotId === slot.id)
  );
  const harvest = useGameStore((s) => s.harvestPlant);
  const openShop = useGameStore.getState; // setter défini dans HUD via context simple
  const [hover, setHover] = useState(false);
  const [growth, setGrowth] = useState(0);

  useFrame(() => {
    if (!plant) {
      setGrowth(0);
      return;
    }
    const { ratio } = getPlantStage(plant);
    if (Math.abs(ratio - growth) > 0.005) setGrowth(ratio);
  });

  const onClick = () => {
    if (!plant) {
      // Demande au HUD d'ouvrir le shop pour ce slot.
      window.dispatchEvent(new CustomEvent('jardin:open-shop', { detail: { slotId: slot.id } }));
      return;
    }
    if (growth >= 1) {
      harvest(slot.id, { manual: true });
    }
  };

  const accentColor = plant ? PLANTS[plant.speciesId].color : '#243026';
  const ready = plant && growth >= 1;

  return (
    <group
      position={slot.position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      onClick={onClick}
    >
      <Pot color={accentColor} hovered={hover || ready} />
      {plant && <PlantMesh species={PLANTS[plant.speciesId]} growth={growth} />}
    </group>
  );
}

function Pot({ color, hovered }) {
  const ringColor = hovered ? color : '#2a3326';
  return (
    <group>
      {/* Pot en terre cuite */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.45, 0.4, 0.3, 12]} />
        <meshLambertMaterial color="#5a3a22" />
      </mesh>
      {/* Liseré du pot */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.05, 12]} />
        <meshLambertMaterial color="#3a2410" />
      </mesh>
      {/* Halo de sélection */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.65, 24]} />
        <meshBasicMaterial color={ringColor} transparent opacity={hovered ? 0.7 : 0.25} />
      </mesh>
      {/* Terre dans le pot */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 12]} />
        <meshLambertMaterial color="#1a1208" />
      </mesh>
    </group>
  );
}
