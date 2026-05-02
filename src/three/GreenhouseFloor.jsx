import { useMemo } from 'react';
import * as THREE from 'three';
import { getToonGradient } from './toon.js';

// Sol en bois chaud (#8B6914) + charpente métallique (#C8C8B0)
// + panneaux de verre semi-transparents (rgba(200,230,200,0.15)).
// Palette directe du GDD §13 — Prompt 2.
const WOOD = '#8b6914';
const WOOD_DARK = '#6a4f0f';
const METAL = '#c8c8b0';
const METAL_DARK = '#9a9a86';
const GLASS = '#bfe0bf';

const FLOOR_WIDTH = 13;
const FLOOR_DEPTH = 10;
const WALL_HEIGHT = 3.2;

export default function GreenhouseFloor({ accent = '#7ec87a' }) {
  const grad = useMemo(() => getToonGradient(), []);
  const planks = useMemo(() => buildPlankPositions(), []);
  const grid = useMemo(() => buildGridGeometry(), []);

  return (
    <group>
      {/* ── Sol en bois ───────────────────────────────────────── */}
      <mesh position={[0, -0.05, 0]} receiveShadow={false}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={WOOD} gradientMap={grad} />
      </mesh>

      {/* Lattes de bois — fines bandes pour donner du grain */}
      {planks.map((p, i) => (
        <mesh key={i} position={[0, 0, p]}>
          <boxGeometry args={[FLOOR_WIDTH - 0.1, 0.005, 0.04]} />
          <meshToonMaterial color={WOOD_DARK} gradientMap={grad} />
        </mesh>
      ))}

      {/* Liseré accent pour bien voir le périmètre */}
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[FLOOR_WIDTH + 0.2, 0.012, FLOOR_DEPTH + 0.2]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>

      {/* Grille douce — repère pour les slots */}
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={accent} transparent opacity={0.1} />
      </lineSegments>

      {/* ── Charpente métallique ──────────────────────────────── */}
      <Frame grad={grad} />

      {/* ── Panneaux de verre ────────────────────────────────── */}
      <GlassPanels />
    </group>
  );
}

// Charpente : 4 piliers d'angle + 4 traverses hautes + 2 poutres faîtières
function Frame({ grad }) {
  const halfW = FLOOR_WIDTH / 2;
  const halfD = FLOOR_DEPTH / 2;
  const corners = [
    [-halfW,  halfD], [ halfW,  halfD],
    [-halfW, -halfD], [ halfW, -halfD],
  ];

  return (
    <group>
      {/* Piliers d'angle */}
      {corners.map(([x, z], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2, z]}>
          <cylinderGeometry args={[0.08, 0.08, WALL_HEIGHT, 6]} />
          <meshToonMaterial color={METAL} gradientMap={grad} />
        </mesh>
      ))}

      {/* Traverses hautes — 4 cadres au sommet des piliers */}
      <mesh position={[0, WALL_HEIGHT, halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, 0.08]} />
        <meshToonMaterial color={METAL} gradientMap={grad} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT, -halfD]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.08, 0.08]} />
        <meshToonMaterial color={METAL} gradientMap={grad} />
      </mesh>
      <mesh position={[ halfW, WALL_HEIGHT, 0]}>
        <boxGeometry args={[0.08, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={METAL_DARK} gradientMap={grad} />
      </mesh>
      <mesh position={[-halfW, WALL_HEIGHT, 0]}>
        <boxGeometry args={[0.08, 0.08, FLOOR_DEPTH]} />
        <meshToonMaterial color={METAL_DARK} gradientMap={grad} />
      </mesh>

      {/* Poutre faîtière */}
      <mesh position={[0, WALL_HEIGHT + 1.2, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.1, 0.1]} />
        <meshToonMaterial color={METAL} gradientMap={grad} />
      </mesh>

      {/* Toit en pente — 2 pans qui se rejoignent au faîte */}
      <mesh position={[0, WALL_HEIGHT + 0.6, halfD / 2]} rotation={[Math.PI / 6, 0, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.04, FLOOR_DEPTH * 0.6]} />
        <meshLambertMaterial color={GLASS} transparent opacity={0.2} />
      </mesh>
      <mesh position={[0, WALL_HEIGHT + 0.6, -halfD / 2]} rotation={[-Math.PI / 6, 0, 0]}>
        <boxGeometry args={[FLOOR_WIDTH, 0.04, FLOOR_DEPTH * 0.6]} />
        <meshLambertMaterial color={GLASS} transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

// 4 panneaux de verre semi-transparents avec montants discrets
function GlassPanels() {
  const halfW = FLOOR_WIDTH / 2;
  const halfD = FLOOR_DEPTH / 2;
  const wallProps = (
    <meshLambertMaterial color={GLASS} transparent opacity={0.12} depthWrite={false} />
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
