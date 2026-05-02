import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { PLANTS } from '../config/plants.js';
import { isHotPrice, priceTrend, HISTORY_LENGTH } from '../mechanics/market.js';
import { formatEuros } from '../utils/numberFormat.js';

// Vue du marché : pour chaque espèce, prix actuel × multiplicateur, mini-graphique
// des dernières valeurs, indicateur de tendance, badge "BON MOMENT" si > 1.40×.
export default function MarketPanel() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const market = useGameStore((s) => s.market);
  const close = useGameStore((s) => s.setActivePanel);

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Marché floral</div>
            <div className="side-panel-sub">{config.icon} {config.name}</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          <p className="panel-intro">
            Le marché fluctue toutes les 5 secondes. Vendre en masse fait baisser le
            prix d'une espèce — il remonte ensuite vers sa moyenne. Vise les pics au
            dessus de <strong className="good">×1.40</strong> pour vendre au meilleur prix.
          </p>

          <div className="market-list">
            {config.species.map((id) => {
              const sp = PLANTS[id];
              const price = market.prices[id] ?? 1.0;
              const history = market.history?.[id] ?? [];
              const trend = priceTrend(history);
              const hot = isHotPrice(price);
              const sellPrice = Math.floor(sp.baseRevenue * price);

              return (
                <div key={id} className={`market-row ${hot ? 'hot' : ''}`}>
                  <div className="market-row-icon">{sp.icon}</div>
                  <div className="market-row-info">
                    <div className="market-row-name">
                      <span>{sp.name}</span>
                      {hot && <span className="badge badge-hot">BON MOMENT</span>}
                    </div>
                    <div className="market-row-meta">
                      <span className="market-mult">×{price.toFixed(2).replace('.', ',')}</span>
                      <span className="market-arrow">{trendIcon(trend)}</span>
                      <span className="market-price">{formatEuros(sellPrice)}/vente</span>
                    </div>
                  </div>
                  <Sparkline values={history} hot={hot} />
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

function trendIcon(trend) {
  if (trend === 'up') return <span className="good">▲</span>;
  if (trend === 'down') return <span className="bad">▼</span>;
  return <span style={{ color: 'var(--muted)' }}>▬</span>;
}

// Mini SVG sparkline — 12 valeurs, hauteur 32, largeur fluide
function Sparkline({ values, hot }) {
  if (!values || values.length < 2) {
    return <div className="sparkline sparkline--empty">…</div>;
  }
  const W = 80;
  const H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.05, max - min);
  const stepX = W / (HISTORY_LENGTH - 1);

  const pts = values.map((v, i) => {
    const x = (i + (HISTORY_LENGTH - values.length)) * stepX;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return [x, y];
  });

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${pts[pts.length - 1][0].toFixed(1)} ${H} L ${pts[0][0].toFixed(1)} ${H} Z`;

  const stroke = hot ? 'var(--gold)' : 'var(--green)';
  const fill = hot ? 'rgba(212,168,75,.18)' : 'rgba(126,200,122,.15)';

  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none">
      <path d={areaPath} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={stroke} />
    </svg>
  );
}
