import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { getSpeciesData } from '../engine/economy.js';
import { TRAITS } from '../mechanics/hybridation.js';
import { formatDuration } from '../utils/numberFormat.js';

const BIOME_LABELS = {
  temperate: 'Tempéré',
  tropical:  'Tropical',
  arid:      'Désertique',
  arctic:    'Arctique',
};

// Modale qui s'affiche quand une expédition révèle une nouvelle espèce.
// Composition : illustration emoji XL + nom commun + nom scientifique
// + description poétique + appel à l'action.
export default function DiscoveryModal() {
  const discovery = useGameStore((s) => s.currentDiscovery);
  const dismiss = useGameStore((s) => s.dismissDiscovery);
  const greenhouses = useGameStore((s) => s.greenhouses);
  // On laisse passer la modale Offline en premier — sinon les 2 se chevauchent
  // au retour d'un long offline.
  const offlineGains = useGameStore((s) => s.offlineGains);
  const state = useGameStore.getState();

  if (!discovery) return null;
  if (offlineGains && (offlineGains.euros > 0 || offlineGains.plants > 0)) return null;
  const species = getSpeciesData(discovery.speciesId, state);
  if (!species) return null;
  const isHybrid = !!species.isHybrid;
  const tagLabel = isHybrid ? 'Hybride synthétisé' : 'Nouvelle découverte';
  const trait = species.trait ? TRAITS[species.trait] : null;

  // La serre où cette espèce peut être plantée
  const targetGh = Object.values(GREENHOUSES).find((g) => g.species.includes(species.id));
  const targetState = targetGh ? greenhouses[targetGh.id] : null;
  const greenhouseUnlocked = targetState?.unlocked ?? false;

  return (
    <div className="discovery-backdrop" onClick={dismiss}>
      <div className="discovery-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="disc-title">
        <div className="discovery-banner" style={{ background: `radial-gradient(circle at center, ${species.petalColor}33, transparent 70%)` }}>
          <div className="discovery-icon">{species.icon}</div>
        </div>
        <div className="discovery-tag">{tagLabel}</div>
        {trait && <div className="discovery-trait">{trait.icon} {trait.name} — {trait.description}</div>}
        <h2 id="disc-title">{species.name}</h2>
        {species.scientificName && (
          <div className="discovery-sci"><em>{species.scientificName}</em></div>
        )}
        {species.poetic && <p className="discovery-poetic">« {species.poetic} »</p>}
        <p className="discovery-desc">{species.description}</p>

        <div className="discovery-stats">
          <div><span>Biome</span><strong>{BIOME_LABELS[species.biome] ?? species.biome}</strong></div>
          <div><span>Croissance</span><strong>{formatDuration(species.growTime)}</strong></div>
          <div><span>Revenu base</span><strong>{species.baseRevenue} €</strong></div>
          <div><span>Rareté</span><strong>{'⭐'.repeat(Math.min(7, species.rarity))}</strong></div>
        </div>

        {greenhouseUnlocked ? (
          <div className="discovery-status good">
            ✓ Disponible dans la {targetGh.icon} {targetGh.name}
          </div>
        ) : targetGh ? (
          <div className="discovery-status warn">
            🔒 Pour la cultiver, débloque la {targetGh.icon} {targetGh.name}
          </div>
        ) : null}

        <button className="discovery-cta" onClick={dismiss}>
          Ajouter à ma collection
        </button>
      </div>
    </div>
  );
}
