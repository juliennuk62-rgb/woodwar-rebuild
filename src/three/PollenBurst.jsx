import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore.js';

// Particules de pollen à la floraison (GDD §09 — Direction Artistique).
// Système de points légers : ~24 particules dorées qui s'élèvent et fadent.
// Très peu coûteux : un seul Points avec un BufferGeometry mis à jour en useFrame.
const COUNT = 24;
const LIFETIME = 1.8;

export default function PollenBurst({ color = '#f5d050' }) {
  const reducedMotion = useGameStore((s) => s.settings?.reducedMotion);
  const ref = useRef();
  const geom = useMemo(() => buildGeometry(), []);
  const mat = useMemo(() => buildMaterial(color), [color]);
  const startTime = useRef(null);

  if (reducedMotion) return null;
  const data = useMemo(() => {
    const arr = [];
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 0.8;
      arr.push({
        x: 0,
        y: 0,
        z: 0,
        vx: Math.cos(angle) * speed * 0.4,
        vy: 1.0 + Math.random() * 0.6,
        vz: Math.sin(angle) * speed * 0.4,
        wobble: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;
    if (startTime.current == null) startTime.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - startTime.current;
    const ratio = Math.min(1, t / LIFETIME);

    const positions = ref.current.geometry.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      const d = data[i];
      d.x += d.vx * delta;
      d.y += d.vy * delta;
      d.z += d.vz * delta;
      d.vy *= 0.96;
      const wobble = Math.sin(state.clock.elapsedTime * 4 + d.wobble) * 0.04;
      positions.setXYZ(i, d.x + wobble, d.y, d.z + wobble);
    }
    positions.needsUpdate = true;

    // Fade out
    mat.opacity = (1 - ratio) * 0.9;
    if (ratio >= 1 && ref.current.parent) {
      ref.current.visible = false;
    }
  });

  return (
    <points ref={ref} geometry={geom} material={mat} position={[0, 1.0, 0]} />
  );
}

function buildGeometry() {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return g;
}

function buildMaterial(color) {
  return new THREE.PointsMaterial({
    color,
    size: 0.08,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}
