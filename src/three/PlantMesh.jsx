import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Modèle low-poly procédural pour Prompt 1.
// Prompt 2 du GDD remplacera ces primitives par de vrais .glb.
// growth: 0 (graine) → 1 (mature/floraison)
export default function PlantMesh({ species, growth }) {
  const group = useRef();
  const flowerRef = useRef();

  useFrame((state) => {
    if (!group.current) return;
    // Petite oscillation organique
    const t = state.clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.8 + species.height * 5) * 0.04 * growth;
    if (flowerRef.current && growth >= 0.95) {
      flowerRef.current.rotation.y = t * 0.4;
    }
  });

  if (growth < 0.05) {
    // Graine : juste un petit dôme dans la terre
    return (
      <group position={[0, 0.36, 0]}>
        <mesh>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshLambertMaterial color="#3a2410" />
        </mesh>
      </group>
    );
  }

  const stemHeight = species.height * Math.min(1, growth);
  const matureBoost = growth >= 1 ? 1.05 : 1;
  const showFlower = growth >= 0.7;
  const flowerScale = growth < 1 ? (growth - 0.7) / 0.3 : 1;

  return (
    <group ref={group} position={[0, 0.36, 0]} scale={matureBoost}>
      {/* Tige */}
      <mesh position={[0, stemHeight / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.05, stemHeight, 6]} />
        <meshLambertMaterial color="#4a8a3a" />
      </mesh>

      {/* Feuilles (apparaissent à 30% de croissance) */}
      {growth >= 0.3 && (
        <Leaves height={stemHeight} scale={Math.min(1, (growth - 0.3) / 0.4)} />
      )}

      {/* Fleur */}
      {showFlower && (
        <group ref={flowerRef} position={[0, stemHeight + 0.08, 0]} scale={flowerScale}>
          <Flower color={species.color} petalColor={species.petalColor} rarity={species.rarity} />
        </group>
      )}
    </group>
  );
}

function Leaves({ height, scale }) {
  const leafColor = '#5a9a4a';
  return (
    <group scale={scale}>
      <mesh position={[0.18, height * 0.4, 0]} rotation={[0, 0, -0.5]}>
        <coneGeometry args={[0.08, 0.22, 4]} />
        <meshLambertMaterial color={leafColor} />
      </mesh>
      <mesh position={[-0.18, height * 0.55, 0]} rotation={[0, 0, 0.5]}>
        <coneGeometry args={[0.08, 0.22, 4]} />
        <meshLambertMaterial color={leafColor} />
      </mesh>
    </group>
  );
}

function Flower({ color, petalColor, rarity = 1 }) {
  // Plus la rareté est haute, plus de pétales
  const petals = Math.min(8, 4 + rarity);
  const radius = 0.18 + rarity * 0.02;

  const petalNodes = [];
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    petalNodes.push(
      <mesh
        key={i}
        position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
        rotation={[0, -angle, 0.4]}
      >
        <sphereGeometry args={[0.11, 6, 5]} />
        <meshLambertMaterial color={petalColor} />
      </mesh>
    );
  }

  return (
    <group>
      {petalNodes}
      {/* Cœur de la fleur */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshLambertMaterial color={color} />
      </mesh>
    </group>
  );
}
