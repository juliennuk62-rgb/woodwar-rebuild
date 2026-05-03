import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { getToonGradient } from './toon.js';

// Modèles low-poly procéduraux par espèce — chacun a son silhouette.
// Toutes les primitives sont en MeshToonMaterial pour le style cel-shading
// du GDD §09. < 500 polys par plante (contrainte perf §13).
//
// growth ∈ [0, 1] :
//   < 0.05  → graine
//   0.3+    → feuilles apparaissent
//   0.7+    → bourgeon de fleur
//   1       → floraison ouverte
export default function PlantMesh({ species, growth }) {
  const group = useRef();
  const flowerRef = useRef();
  const grad = useMemo(() => getToonGradient(), []);

  useFrame((state) => {
    if (!group.current || !species) return;
    const t = state.clock.elapsedTime;
    // Petit balancement organique
    group.current.rotation.z = Math.sin(t * 0.8 + species.height * 5) * 0.04 * growth;
    if (flowerRef.current && growth >= 0.95) {
      flowerRef.current.rotation.y = t * 0.3;
    }
  });

  // Garde-fou : un slot peut référencer une espèce inconnue (save importée
  // d'une vieille version, hybride supprimé, etc.). On rend rien plutôt que
  // de crasher la scène.
  if (!species) return null;

  if (growth < 0.05) {
    return <Seed />;
  }

  const stemHeight = species.height * Math.min(1, growth);
  const showLeaves = growth >= 0.3;
  const showFlower = growth >= 0.7;
  const flowerScale = growth >= 1 ? 1 : (growth - 0.7) / 0.3;

  return (
    <group ref={group} position={[0, 0.36, 0]}>
      {/* Tige */}
      <mesh position={[0, stemHeight / 2, 0]}>
        <cylinderGeometry args={[0.03, 0.05, stemHeight, 6]} />
        <meshToonMaterial color="#4a8a3a" gradientMap={grad} />
      </mesh>

      {/* Feuilles */}
      {showLeaves && (
        <Leaves height={stemHeight} grow={Math.min(1, (growth - 0.3) / 0.4)} grad={grad} />
      )}

      {/* Fleur */}
      {showFlower && (
        <group ref={flowerRef} position={[0, stemHeight + 0.05, 0]} scale={flowerScale}>
          <FlowerForSpecies species={species} grad={grad} />
        </group>
      )}
    </group>
  );
}

function Seed() {
  const grad = useMemo(() => getToonGradient(), []);
  return (
    <mesh position={[0, 0.36, 0]}>
      <sphereGeometry args={[0.06, 8, 6]} />
      <meshToonMaterial color="#3a2410" gradientMap={grad} />
    </mesh>
  );
}

function Leaves({ height, grow, grad }) {
  return (
    <group scale={grow}>
      <mesh position={[0.16, height * 0.4, 0]} rotation={[0, 0, -0.6]}>
        <coneGeometry args={[0.09, 0.24, 5]} />
        <meshToonMaterial color="#5a9a4a" gradientMap={grad} />
      </mesh>
      <mesh position={[-0.16, height * 0.55, 0]} rotation={[0, 0, 0.6]}>
        <coneGeometry args={[0.09, 0.24, 5]} />
        <meshToonMaterial color="#5a9a4a" gradientMap={grad} />
      </mesh>
      <mesh position={[0.06, height * 0.7, 0.12]} rotation={[0.4, 0, -0.3]}>
        <coneGeometry args={[0.07, 0.2, 5]} />
        <meshToonMaterial color="#6aaa5a" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// Aiguilleur — chaque espèce a sa silhouette
function FlowerForSpecies({ species, grad }) {
  switch (species.id) {
    case 'daisy':    return <DaisyFlower grad={grad} />;
    case 'tulip':    return <TulipFlower grad={grad} />;
    case 'rose':     return <RoseFlower grad={grad} />;
    case 'lavender': return <LavenderFlower grad={grad} />;
    case 'peony':    return <PeonyFlower grad={grad} />;
    default:         return <GenericFlower color={species.color} petalColor={species.petalColor} grad={grad} />;
  }
}

// 🌼 Marguerite : sphère blanche centrée + cône jaune au cœur + 8 pétales blancs
function DaisyFlower({ grad }) {
  const petals = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    petals.push(
      <mesh key={i} position={[Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18]} rotation={[Math.PI / 2, 0, -a]}>
        <sphereGeometry args={[0.1, 5, 4]} />
        <meshToonMaterial color="#fafaf0" gradientMap={grad} />
      </mesh>
    );
  }
  return (
    <group>
      {petals}
      <mesh position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshToonMaterial color="#f5d050" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// 🌷 Tulipe : un grand cône fermé rose
function TulipFlower({ grad }) {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <coneGeometry args={[0.16, 0.36, 6]} />
        <meshToonMaterial color="#e85a82" gradientMap={grad} />
      </mesh>
      {/* Pétales légèrement écartés à la base */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.08]}
            rotation={[0.2, -a, 0]}
          >
            <coneGeometry args={[0.08, 0.28, 4]} />
            <meshToonMaterial color="#d63b6e" gradientMap={grad} />
          </mesh>
        );
      })}
    </group>
  );
}

// 🌹 Rose : empilement de couches de pétales pour faire le cœur
function RoseFlower({ grad }) {
  return (
    <group>
      {/* Cœur — sphères imbriquées */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.18, 10, 8]} />
        <meshToonMaterial color="#c63950" gradientMap={grad} />
      </mesh>
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshToonMaterial color="#a82340" gradientMap={grad} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshToonMaterial color="#8a1830" gradientMap={grad} />
      </mesh>
      {/* Sépales verts à la base */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.15, -0.04, Math.sin(a) * 0.15]}
            rotation={[Math.PI / 2.5, 0, -a]}
          >
            <coneGeometry args={[0.04, 0.1, 4]} />
            <meshToonMaterial color="#3a8030" gradientMap={grad} />
          </mesh>
        );
      })}
    </group>
  );
}

// 🪻 Lavande : petits cônes violets en spirale autour de la tige
function LavenderFlower({ grad }) {
  const buds = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 0.6;
    const y = i * 0.04;
    const r = 0.06 - i * 0.003;
    buds.push(
      <mesh
        key={i}
        position={[Math.cos(a) * r * 0.5, y, Math.sin(a) * r * 0.5]}
        rotation={[0.3, -a, 0]}
      >
        <coneGeometry args={[r, 0.1, 4]} />
        <meshToonMaterial color="#9d7ec8" gradientMap={grad} />
      </mesh>
    );
  }
  return <group position={[0, -0.05, 0]}>{buds}</group>;
}

// 🌺 Pivoine : grosse fleur multicouche, type "chou de pétales"
function PeonyFlower({ grad }) {
  const layers = [];
  for (let layer = 0; layer < 3; layer++) {
    const radius = 0.22 - layer * 0.05;
    const count = 8 - layer;
    const yLift = layer * 0.05;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + layer * 0.3;
      layers.push(
        <mesh
          key={`${layer}-${i}`}
          position={[Math.cos(a) * radius * 0.7, yLift, Math.sin(a) * radius * 0.7]}
          rotation={[0.4 - layer * 0.1, -a, 0]}
        >
          <sphereGeometry args={[radius * 0.55, 6, 5]} />
          <meshToonMaterial
            color={layer === 0 ? '#e8a4b8' : layer === 1 ? '#f0b4c4' : '#f8c4d0'}
            gradientMap={grad}
          />
        </mesh>
      );
    }
  }
  return (
    <group>
      {layers}
      {/* Cœur jaune */}
      <mesh position={[0, 0.16, 0]}>
        <sphereGeometry args={[0.06, 8, 6]} />
        <meshToonMaterial color="#f5d050" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// Fallback pour espèces non encore stylisées (sera utilisé pour les biomes futurs)
function GenericFlower({ color, petalColor, grad }) {
  const petals = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    petals.push(
      <mesh key={i} position={[Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16]}>
        <sphereGeometry args={[0.1, 6, 5]} />
        <meshToonMaterial color={petalColor} gradientMap={grad} />
      </mesh>
    );
  }
  return (
    <group>
      {petals}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshToonMaterial color={color} gradientMap={grad} />
      </mesh>
    </group>
  );
}
