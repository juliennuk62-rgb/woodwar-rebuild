import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore.js';
import { SEASON_INFO } from '../mechanics/weather.js';

// Particules ambiantes liées à la saison : pollen au printemps, soleil à
// l'été (peu de particules, juste des poussières dorées), feuilles à
// l'automne, neige en hiver. ~80 particules max — léger.
const COUNT = 80;
const AREA_X = 14;
const AREA_Z = 12;
const TOP_Y = 5;

export default function SeasonalParticles() {
  const season = useGameStore((s) => s.market.currentSeason);
  const ref = useRef();
  const data = useMemo(() => buildParticleData(), []);
  const geom = useMemo(() => buildGeometry(), []);

  // Matériau dépendant de la saison
  const material = useMemo(() => buildMaterial(SEASON_INFO[season]), [season]);

  // Réinitialise les positions au changement de saison pour un effet visible
  useEffect(() => {
    for (let i = 0; i < COUNT; i++) {
      data[i].x = (Math.random() - 0.5) * AREA_X;
      data[i].y = Math.random() * TOP_Y;
      data[i].z = (Math.random() - 0.5) * AREA_Z;
    }
  }, [season, data]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const positions = ref.current.geometry.attributes.position;
    for (let i = 0; i < COUNT; i++) {
      const d = data[i];
      step(d, delta, season);
      positions.setXYZ(i, d.x, d.y, d.z);
    }
    positions.needsUpdate = true;
  });

  return <points ref={ref} geometry={geom} material={material} />;
}

function buildParticleData() {
  const arr = [];
  for (let i = 0; i < COUNT; i++) {
    arr.push({
      x: (Math.random() - 0.5) * AREA_X,
      y: Math.random() * TOP_Y,
      z: (Math.random() - 0.5) * AREA_Z,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.2 - Math.random() * 0.5,
      vz: (Math.random() - 0.5) * 0.4,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return arr;
}

function buildGeometry() {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return g;
}

function buildMaterial(info) {
  return new THREE.PointsMaterial({
    color: info?.particleColor ?? '#ffffff',
    size: info?.id === 'winter' ? 0.10 : 0.07,
    transparent: true,
    opacity: info?.id === 'summer' ? 0.4 : 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}

// Mise à jour d'une particule — le comportement dépend de la saison
function step(d, dt, season) {
  switch (season) {
    case 'winter': {
      // Neige : tombe lentement, oscille, reset en haut quand elle touche le sol
      d.x += Math.sin(d.phase) * 0.3 * dt;
      d.y += d.vy * dt * 0.6;
      d.z += Math.cos(d.phase) * 0.3 * dt;
      d.phase += dt * 1.5;
      if (d.y < -0.2) reset(d);
      break;
    }
    case 'autumn': {
      // Feuilles : descente plus rapide, pivote en chemin
      d.x += d.vx * dt + Math.sin(d.phase) * 0.4 * dt;
      d.y += d.vy * dt * 1.0;
      d.z += d.vz * dt + Math.cos(d.phase) * 0.4 * dt;
      d.phase += dt * 2;
      if (d.y < -0.2) reset(d);
      break;
    }
    case 'spring': {
      // Pollen : flotte vers le haut, beaucoup de drift latéral
      d.x += Math.sin(d.phase) * 0.8 * dt;
      d.y += 0.4 * dt + Math.sin(d.phase * 1.4) * 0.2 * dt;
      d.z += Math.cos(d.phase) * 0.8 * dt;
      d.phase += dt * 1.2;
      if (d.y > TOP_Y + 1) { d.y = -0.5; d.x = (Math.random() - 0.5) * AREA_X; d.z = (Math.random() - 0.5) * AREA_Z; }
      break;
    }
    case 'summer':
    default: {
      // Poussière dorée : très lente, flottante
      d.x += Math.sin(d.phase) * 0.15 * dt;
      d.y += 0.15 * dt;
      d.z += Math.cos(d.phase) * 0.15 * dt;
      d.phase += dt * 0.8;
      if (d.y > TOP_Y + 1) { d.y = -0.2; d.x = (Math.random() - 0.5) * AREA_X; d.z = (Math.random() - 0.5) * AREA_Z; }
      break;
    }
  }
}

function reset(d) {
  d.x = (Math.random() - 0.5) * AREA_X;
  d.y = TOP_Y + Math.random() * 1.5;
  d.z = (Math.random() - 0.5) * AREA_Z;
  d.phase = Math.random() * Math.PI * 2;
}
