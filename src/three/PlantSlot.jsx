import { useState, useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useGameStore } from '../store/gameStore.js';
import { getPlantStage, getSpeciesData, computePlantRevenue } from '../engine/economy.js';
import { isHotPrice } from '../mechanics/market.js';
import { getToonGradient } from './toon.js';
import { clickWasDrag } from './IsometricCamera.jsx';
import PlantMesh from './PlantMesh.jsx';
import PollenBurst from './PollenBurst.jsx';
import FloatingNumber3D from './FloatingNumber3D.jsx';

// Pot de plantation : pot en terre cuite + plante (si plantée) + halo
// d'interaction + particules à la floraison + floating numbers attachés.
export default function PlantSlot({ slot }) {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const plant = greenhouse.plants.find((p) => p.slotId === slot.id);
  const harvest = useGameStore((s) => s.harvestPlant);
  const reducedMotion = useGameStore((s) => s.settings.reducedMotion);
  // Prix actuel de l'espèce sur le marché — undefined pour les hybrides ou
  // espèces inconnues (pas de prix coté), ce qui désactive naturellement le badge.
  const marketPrice = useGameStore((s) =>
    plant ? s.market.prices[plant.speciesId] : undefined
  );
  // Sélecteur stable : on ne lit que `floatingNumbers` (référence partagée)
  // et on filtre en useMemo. Sans ça, `.filter()` côté sélecteur recrée un
  // nouveau tableau à chaque tick → re-render permanent du composant.
  const allFloatingNumbers = useGameStore((s) => s.floatingNumbers);
  const slotFloats = useMemo(
    () => allFloatingNumbers.filter(
      (f) => f.slotId === slot.id && (f.greenhouseId == null || f.greenhouseId === ghId)
    ),
    [allFloatingNumbers, slot.id, ghId]
  );

  const [hover, setHover] = useState(false);
  // Perf : la valeur exacte du ratio (60 fps) vit dans une ref. Le state
  // React n'est mis à jour qu'aux changements visibles (palier de 5 %)
  // pour ne pas re-render PlantMesh à chaque frame Three.js.
  const growthRef = useRef(0);
  const [growth, setGrowth] = useState(0);
  const wasMatureRef = useRef(false);
  const [burstId, setBurstId] = useState(0);

  // Cleanup du curseur au démontage (cas où onPointerOut n'a pas eu le temps
  // de se déclencher avant un switch de serre).
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  useFrame(() => {
    if (!plant) {
      if (growthRef.current !== 0) {
        growthRef.current = 0;
        setGrowth(0);
      }
      wasMatureRef.current = false;
      return;
    }
    const state = useGameStore.getState();
    const { ratio } = getPlantStage(plant, undefined, greenhouse, state);
    growthRef.current = ratio;
    // setState seulement si le palier visible change (5 %). Évite le
    // re-render à 60 fps qui plombait le CPU avec ~20 pots actifs.
    if (Math.abs(ratio - growth) >= 0.05 || (ratio >= 1 && growth < 1) || (ratio < 0.05 && growth > 0)) {
      setGrowth(ratio);
    }

    const isMature = ratio >= 1;
    if (isMature && !wasMatureRef.current) {
      setBurstId((id) => id + 1);
    }
    wasMatureRef.current = isMature;
  });

  const onClick = (e) => {
    if (clickWasDrag()) return;
    e?.stopPropagation?.();
    if (!plant) {
      window.dispatchEvent(new CustomEvent('jardin:open-shop', { detail: { slotId: slot.id } }));
      return;
    }
    if (growth >= 1) harvest(slot.id, { manual: true });
  };

  const ready = plant && growth >= 1;
  // On résout l'espèce une seule fois et on garde une couleur de repli
  // si elle n'est pas trouvée (espèce supprimée d'une save importée d'une
  // ancienne version par exemple).
  const species = plant ? getSpeciesData(plant.speciesId, useGameStore.getState()) : null;
  const accent = species?.petalColor ?? '#7ec87a';

  // Badge "BON MOMENT" : la plante est (presque) mature ET son espèce est en pic
  // de marché. `marketPrice` est undefined pour les hybrides → la condition est
  // naturellement falsy et le badge n'apparaît pas.
  const showHotBadge = plant && growth >= 0.85 && isHotPrice(marketPrice);

  // Badge data permanent : revenu projeté (non-manuel, valeur de base affichée
  // pour ne pas survendre le +25 %). Calculé uniquement quand un palier (5 %)
  // change, donc pas de coût au tick.
  const projectedRevenue = useMemo(() => {
    if (!plant || !species) return 0;
    const s = useGameStore.getState();
    return computePlantRevenue(plant, greenhouse, s.market, { manual: false }, s);
  }, [plant, species, greenhouse, growth]);
  const dataBadgeLabel = ready
    ? `✅ +${projectedRevenue} €`
    : `🌱 ${Math.round(growth * 100)}%`;
  const dataBadgeClass = [
    'plant-data-badge',
    ready ? 'is-mature' : 'is-growing',
    reducedMotion ? 'is-static' : '',
  ].filter(Boolean).join(' ');

  return (
    <group
      position={slot.position}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      onClick={onClick}
    >
      <Pot accentHover={hover || ready} ready={ready} accent={accent} reducedMotion={reducedMotion} />
      {plant && species && <PlantMesh species={species} growth={growth} />}
      {plant && burstId > 0 && <PollenBurst key={burstId} color={accent} />}
      {plant && (
        <Html position={[0, 1.1, 0]} center distanceFactor={8} zIndexRange={[4, 0]} pointerEvents="none">
          <div className={dataBadgeClass}>{dataBadgeLabel}</div>
        </Html>
      )}
      {ready && hover && (
        <Html position={[0, 1.4, 0]} center distanceFactor={8} zIndexRange={[5, 0]} pointerEvents="none">
          <div className="pot-tooltip">Récolter manuellement <strong>+25 %</strong></div>
        </Html>
      )}
      {showHotBadge && (
        <Html position={[0, 1.7, 0]} center distanceFactor={8} zIndexRange={[5, 0]} pointerEvents="none">
          <div className="hot-badge">🔥 ×{marketPrice.toFixed(1)}</div>
        </Html>
      )}
      {slotFloats.map((f) => (
        <FloatingNumber3D
          key={f.id}
          amount={f.amount}
          kind={f.kind}
          createdAt={f.createdAt}
        />
      ))}
    </group>
  );
}

function Pot({ accentHover, ready, accent, reducedMotion }) {
  const grad = useMemo(() => getToonGradient(), []);
  // Quand la plante est mature, on force un anneau doré bien visible (signal
  // fort de "récolte manuelle dispo +25 %"). Sinon on garde le comportement
  // d'origine (accent doré au hover, sombre par défaut).
  const ringColor = ready ? '#d4a84b' : (accentHover ? '#d4a84b' : '#3a3326');
  const baseRingOpacity = ready ? 0.85 : (accentHover ? 0.6 : 0.18);

  const ringRef = useRef();
  const potRef = useRef();

  useFrame(({ clock }) => {
    // Si pas mature ou si l'utilisateur a coupé les anim, on remet à l'état neutre.
    if (!ready || reducedMotion) {
      if (ringRef.current?.material) ringRef.current.material.opacity = baseRingOpacity;
      if (potRef.current) potRef.current.scale.setScalar(1);
      return;
    }
    const pulse = Math.sin(clock.getElapsedTime() * 3) * 0.3;
    if (ringRef.current?.material) {
      ringRef.current.material.opacity = Math.max(0, Math.min(1, baseRingOpacity + pulse * 0.15));
    }
    if (potRef.current) {
      potRef.current.scale.setScalar(1 + pulse * 0.04);
    }
  });

  return (
    <group ref={potRef}>
      {/* Pot en terre cuite */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.45, 0.4, 0.3, 14]} />
        <meshToonMaterial color="#a85a35" gradientMap={grad} />
      </mesh>
      {/* Liseré supérieur */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.46, 0.46, 0.05, 14]} />
        <meshToonMaterial color="#7a3f22" gradientMap={grad} />
      </mesh>
      {/* Terre */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.04, 14]} />
        <meshToonMaterial color="#3a2410" gradientMap={grad} />
      </mesh>
      {/* Halo de sélection — anneau au sol */}
      <mesh ref={ringRef} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 28]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={baseRingOpacity}
        />
      </mesh>
    </group>
  );
}
