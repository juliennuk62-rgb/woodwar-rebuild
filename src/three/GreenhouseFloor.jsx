import { useMemo } from 'react';
import * as THREE from 'three';
import { getToonGradient } from './toon.js';

// Couleur du sol + charpente + verre selon le biome de la serre (Prompt 8).
// Tempérée → bois chaud + métal. Tropicale → bois sombre + verre vert.
// Aride → grès + ironwork + verre safran. Arctique → ice-blue + steel.
const THEMES = {
  temperate: { wood: '#8b6914', woodDark: '#6a4f0f', metal: '#c8c8b0', metalDark: '#9a9a86', glass: '#bfe0bf' },
  tropical:  { wood: '#5e3a20', woodDark: '#42271a', metal: '#9bc4a8', metalDark: '#6f9a82', glass: '#a8d4c8' },
  arid:      { wood: '#a87a4a', woodDark: '#7a5530', metal: '#c8b88c', metalDark: '#9a8a64', glass: '#e8d8a8' },
  arctic:    { wood: '#a0b8c0', woodDark: '#7a8a90', metal: '#c8d4e0', metalDark: '#8aa0b0', glass: '#d8e8f0' },
  complex:   { wood: '#2a3a4a', woodDark: '#1a2a3a', metal: '#7eaaca', metalDark: '#5a8aab', glass: '#c8d4e0' },
};

const FLOOR_WIDTH = 13;
const FLOOR_DEPTH = 10;
const WALL_HEIGHT = 3.2;

export default function GreenhouseFloor({ accent = '#7ec87a', biome = 'temperate' }) {
  const grad = useMemo(() => getToonGradient(), []);
  const planks = useMemo(() => buildPlankPositions(), []);
  const grid = useMemo(() => buildGridGeometry(), []);
  const theme = THEMES[biome] ?? THEMES.temperate;

  return (
    <group>
      {/* ── Sol ───────────────────────────────────────────────── */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={theme.wood} gradientMap={grad} />
      </mesh>
      {planks.map((p, i) => (
        <mesh key={i} position={[0, 0, p]}>
          <boxGeometry args={[FLOOR_WIDTH - 0.1, 0.005, 0.04]} />
          <meshToonMaterial color={theme.woodDark} gradientMap={grad} />
        </mesh>
      ))}
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[FLOOR_WIDTH + 0.2, 0.012, FLOOR_DEPTH + 0.2]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={accent} transparent opacity={0.1} />
      </lineSegments>

      <Frame grad={grad} theme={theme} />
      <GlassPanels glass={theme.glass} />
    </group>
  );
}

function Frame({ grad, theme }) {
  const halfW = FLOOR_WIDTH / 2;
  const halfD = FLOOR_DEPTH / 2;
  const corners = [
    [-halfW,  halfD], [ halfW,  halfD],
    [-halfW, -halfD], [ halfW, -halfD],
  ];
  return (
    <group>
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2, z]}>
          <cylinderGeometry args={[0.08, 0.08, WALL_HEIGHT, 6]} />
          <meshToonMaterial color={theme.metal} gradientMap={grad} />
        </mesh>
      ))}
      <mesh position={[0, WALL_HEIGHT, halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, 0.08]} />
        <meshToonMaterial color={theme.metal} gradientMap={grad} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT, -halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, 0.08]} />
        <meshToonMaterial color={theme.metal} gradientMap={grad} />
      </mesh>
      <mesh position={[ halfW, WALL_HEIGHT, 0]}>
        <boxGeometry args={[0.08, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={theme.metalDark} gradientMap={grad} />
      </mesh>
      <mesh position={[-halfW, WALL_HEIGHT, 0]}>
        <boxGeometry args={[0.08, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={theme.metalDark} gradientMap={grad} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT + 1.2, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.1, 0.1]} />
        <meshToonMaterial color={theme.metal} gradientMap={grad} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT + 0.6, halfD / 2]} rotation={[Math.PI / 6, 0, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.04, FLOOR_DEPTH * 0.6]} />
        <meshLambertMaterial color={theme.glass} transparent opacity={0.2} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT + 0.6, -halfD / 2]} rotation={[-Math.PI / 6, 0, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.04, FLOOR_DEPTH * 0.6]} />
        <meshLambertMaterial color={theme.glass} transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function GlassPanels({ glass }) {
  const halfW = FLOOR_WIDTH / 2;
  const halfD = FLOOR_DEPTH / 2;
  const wallProps = (
    <meshLambertMaterial color={glass} transparent opacity={0.12} depthWrite={false} />
  );
  return (
    <>
      <mesh position={[0, WALL_HEIGHT / 2, halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, WALL_HEIGHT, 0.05]} />
        {wallProps}
      </mesh>
      <mesh position={[0, WALL_HEIGHT / 2, -halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, WALL_HEIGHT, 0.05]} />
        {wallProps}
      </mesh>
      <mesh position={[ halfW, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.05, WALL_HEIGHT, FLOOR_DEPTH]} />
        {wallProps}
      </mesh>
      <mesh position={[-halfW, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.05, WALL_HEIGHT, FLOOR_DEPTH]} />
        {wallProps}
      </mesh>
    </>
  );
}

function buildPlankPositions() {
  const positions = [];
  const step = 0.6;
  for (let z = -FLOOR_DEPTH / 2 + step; z < FLOOR_DEPTH / 2; z += step) {
    positions.push(z);
  }
  return positions;
}

function buildGridGeometry() {
  const positions = [];
  const halfW = (FLOOR_WIDTH - 1) / 2;
  const halfD = (FLOOR_DEPTH - 1) / 2;
  const step = 1.6;
  for (let x = -halfW; x <= halfW + 0.01; x += step) {
    positions.push(x, 0.012, -halfD, x, 0.012, halfD);
  }
  for (let z = -halfD; z <= halfD + 0.01; z += step) {
    positions.push(-halfW, 0.012, z, halfW, 0.012, z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}
