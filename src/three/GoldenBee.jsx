import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore.js';
import { getToonGradient } from './toon.js';
import { clickWasDrag } from './IsometricCamera.jsx';

// 🐝 Abeille dorée : événement aléatoire (équivalent du "golden cookie" de
// Cookie Clicker). Vole en cercle au-dessus de la scène pendant 30 s puis
// disparaît. Cliquer dessus déclenche un reward (claimBee dans le store).
//
// Composition : sphère dorée (corps) + sphère plus petite (tête) + 2 ailes
// translucides + un halo glow autour. Tout en MeshToon pour rester cohérent
// avec le style cel-shading (GDD §09).
//
// La hitbox est volontairement plus grande que la silhouette visuelle (~0.55
// de rayon sur invisibleMesh) pour rendre l'abeille FACILEMENT cliquable —
// c'est l'événement-récompense, pas un test de précision.

const FLY_RADIUS = 2.6;       // rayon du cercle de vol
const FLY_HEIGHT = 1.6;       // hauteur de base
const FLY_SPEED = 0.8;        // rad/s
const HOVER_AMP = 0.25;       // oscillation verticale

export default function GoldenBee() {
  const bee = useGameStore((s) => s.bee);
  const reducedMotion = useGameStore((s) => s.settings?.reducedMotion);
  const claimBee = useGameStore((s) => s.claimBee);
  const groupRef = useRef();
  const wingsRef = useRef();
  const grad = useMemo(() => getToonGradient(), []);

  // Position d'origine de l'abeille (autour de laquelle elle décrit un cercle)
  const origin = useMemo(() => {
    if (!bee) return [0, FLY_HEIGHT, 0];
    return [bee.x, FLY_HEIGHT, bee.z];
  }, [bee]);

  useFrame((state) => {
    if (!groupRef.current || !bee) return;
    if (reducedMotion) {
      // Statique mais cliquable : on positionne juste l'abeille à son origin.
      groupRef.current.position.set(origin[0], origin[1], origin[2]);
      return;
    }
    const t = state.clock.elapsedTime;
    // Vol circulaire autour du point d'origine
    const angle = t * FLY_SPEED;
    const px = origin[0] + Math.cos(angle) * FLY_RADIUS * 0.3;
    const pz = origin[2] + Math.sin(angle) * FLY_RADIUS * 0.3;
    const py = origin[1] + Math.sin(t * 3.2) * HOVER_AMP;
    groupRef.current.position.set(px, py, pz);
    // L'abeille fait face à sa direction de vol (tangente du cercle)
    groupRef.current.rotation.y = -angle + Math.PI / 2;
    // Battement d'ailes très rapide
    if (wingsRef.current) {
      wingsRef.current.rotation.x = Math.sin(t * 30) * 0.4;
    }
  });

  if (!bee) return null;

  const onPointerDown = (e) => {
    if (clickWasDrag()) return;
    e?.stopPropagation?.();
    claimBee();
  };

  return (
    <group ref={groupRef} position={origin}>
      {/* Halo doré en arrière (anneau au sol pour signaler la présence) */}
      <mesh position={[0, -FLY_HEIGHT + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.65, 24]} />
        <meshBasicMaterial color="#d4a84b" transparent opacity={0.5} />
      </mesh>

      {/* Glow autour du corps (sphère semi-transparente) */}
      <mesh>
        <sphereGeometry args={[0.42, 12, 10]} />
        <meshBasicMaterial color="#f5d050" transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {/* Corps doré */}
      <mesh>
        <sphereGeometry args={[0.22, 14, 12]} />
        <meshToonMaterial color="#f5c84a" gradientMap={grad} />
      </mesh>
      {/* Rayures noires (anneaux fins autour du corps) */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.2, 0.04, 6, 14]} />
        <meshToonMaterial color="#2a1a08" gradientMap={grad} />
      </mesh>
      <mesh position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.16, 0.03, 6, 12]} />
        <meshToonMaterial color="#2a1a08" gradientMap={grad} />
      </mesh>

      {/* Tête (légèrement plus petite, devant) */}
      <mesh position={[0.22, 0.02, 0]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshToonMaterial color="#1a1208" gradientMap={grad} />
      </mesh>

      {/* Ailes (groupées pour battre ensemble) */}
      <group ref={wingsRef} position={[0, 0.18, 0]}>
        <mesh position={[0, 0.02, 0.16]} rotation={[0.2, 0, 0]}>
          <sphereGeometry args={[0.18, 8, 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.02, -0.16]} rotation={[-0.2, 0, 0]}>
          <sphereGeometry args={[0.18, 8, 4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      </group>

      {/* Hitbox invisible plus grande que le mesh visible — clic facile */}
      <mesh
        onPointerDown={onPointerDown}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[0.6, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
