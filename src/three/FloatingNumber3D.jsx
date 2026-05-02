import { useRef, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { formatEuros } from '../utils/numberFormat.js';

// Floating number ancré en 3D au slot — projette du HTML via <Html> de drei.
// Animation : monte de 1.2 unité sur 1.4s puis disparaît (GDD §09).
// Se nettoie tout seul du store à la fin du timer.
export default function FloatingNumber3D({ id, amount, kind, createdAt }) {
  const ref = useRef();
  const remove = useGameStore((s) => s.removeFloatingNumber);

  useEffect(() => {
    const t = setTimeout(() => remove(id), GAME_CONFIG.floatingNumberLifetimeMs);
    return () => clearTimeout(t);
  }, [id, remove]);

  useFrame(() => {
    if (!ref.current) return;
    const elapsed = (Date.now() - createdAt) / GAME_CONFIG.floatingNumberLifetimeMs;
    const t = Math.min(1, elapsed);
    ref.current.position.y = 1.0 + t * 1.2;
  });

  return (
    <group ref={ref} position={[0, 1.0, 0]}>
      <Html center distanceFactor={8} zIndexRange={[5, 0]} pointerEvents="none">
        <div className={`fn3d ${kind === 'manual' ? 'fn3d--manual' : ''}`}>
          + {formatEuros(amount)}
          {kind === 'manual' && <span className="fn3d-bonus">bonus</span>}
        </div>
      </Html>
    </group>
  );
}
