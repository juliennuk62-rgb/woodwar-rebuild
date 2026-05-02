// Utilitaires pour le rendu cel-shading (toon shading) du GDD §09 :
// "Couleurs flat avec ombrage cel-shading léger".
// On crée un gradientMap 3 niveaux qui donne ce look stylisé.
import * as THREE from 'three';

let cachedGradient = null;

export function getToonGradient() {
  if (cachedGradient) return cachedGradient;

  // 3 paliers d'ombrage : ombre, mi-ton, lumière
  const colors = new Uint8Array([90, 160, 255]);
  const tex = new THREE.DataTexture(colors, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cachedGradient = tex;
  return tex;
}

// Crée un MeshToonMaterial pré-configuré avec notre gradient.
// On préfère cette helper plutôt que d'instancier la texture à chaque mesh.
export function toonMaterial(props = {}) {
  return new THREE.MeshToonMaterial({
    gradientMap: getToonGradient(),
    ...props,
  });
}
