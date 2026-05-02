import { useMemo } from 'react';
import * as THREE from 'three';

// Sol de la serre + structure de verre stylisée low-poly.
// Toon-friendly : couleurs flat, ombrage minimal.
export default function GreenhouseFloor({ color = '#3a4a32', accent = '#7ec87a' }) {
  const grid = useMemo(() => buildGridGeometry(), []);

  return (
    <group>
      {/* Sol */}
      <mesh receiveShadow={false} position={[0, -0.05, 0]}>
        <boxGeometry args={[12, 0.1, 10]} />
        <meshLambertMaterial color={color} />
      </mesh>

      {/* Liseré accent */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[12.2, 0.02, 10.2]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} />
      </mesh>

      {/* Lignes de grille discrètes */}
      <lineSegments geometry={grid}>
        <lineBasicMaterial color={accent} transparent opacity={0.18} />
      </lineSegments>

      {/* Murs de verre — quatre panneaux semi-transparents */}
      <GlassWalls accent={accent} />
    </group>
  );
}

function GlassWalls({ accent }) {
  const wallMat = (
    <meshLambertMaterial color={accent} transparent opacity={0.07} />
  );
  return (
    <>
      <mesh position={[0, 1.5, -5]}>
        <boxGeometry args={[12, 3, 0.1]} />
        {wallMat}
      </mesh>
      <mesh position={[0, 1.5, 5]}>
        <boxGeometry args={[12, 3, 0.1]} />
        {wallMat}
      </mesh>
      <mesh position={[-6, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 10]} />
        {wallMat}
      </mesh>
      <mesh position={[6, 1.5, 0]}>
        <boxGeometry args={[0.1, 3, 10]} />
        {wallMat}
      </mesh>
      {/* Toit en pente — deux pans */}
      <mesh position={[0, 3.4, -2.5]} rotation={[Math.PI / 6, 0, 0]}>
        <boxGeometry args={[12, 0.1, 5.5]} />
        <meshLambertMaterial color={accent} transparent opacity={0.05} />
      </mesh>
      <mesh position={[0, 3.4, 2.5]} rotation={[-Math.PI / 6, 0, 0]}>
        <boxGeometry args={[12, 0.1, 5.5]} />
        <meshLambertMaterial color={accent} transparent opacity={0.05} />
      </mesh>
    </>
  );
}

function buildGridGeometry() {
  const positions = [];
  const size = 8;
  const step = 1.6;
  for (let x = -size; x <= size; x += step) {
    positions.push(x, 0.02, -size, x, 0.02, size);
  }
  for (let z = -size; z <= size; z += step) {
    positions.push(-size, 0.02, z, size, 0.02, z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}
