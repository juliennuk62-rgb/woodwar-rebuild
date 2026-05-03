import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';

// V5 — Feedback visuel ultra-pop sur récolte manuelle + prestige.
//
// Pure HTML/CSS overlay (PAS de Three.js) : un layer fixe par-dessus le canvas
// R3F qui reçoit pointer-events:none. On gère deux types de bursts :
//   - 'manual'  : ~12 confettis colorés (vert/doré/rose/cyan), part du dernier
//                 point de clic capté via window.__lastClickXY.
//   - 'prestige': 30 confettis dorés depuis le centre + flash plein écran +
//                 texte "PRESTIGE" qui scale-in/fade-out (~600ms).
//
// On s'abonne au store via useGameStore.subscribe :
//   - apparition d'un floatingNumber kind:'manual' → burst manuel
//   - changement de stats.firstPrestigeAt (null → ts) ou apparition d'un
//     nouveau prestige (stats.firstPrestigeAt change tout court) → burst prestige
//
// Respect settings.reducedMotion : on skip complètement (le composant continue
// d'exister mais ignore les events).

const MANUAL_COLORS = ['#7ec87a', '#d4a84b', '#e07a7a', '#6ab0d4', '#c8e8c4', '#f2c94c'];
const PRESTIGE_COLORS = ['#ffd76a', '#d4a84b', '#fff1b8', '#f5b830', '#fde68a'];

const MANUAL_COUNT = 12;
const PRESTIGE_COUNT = 30;

const MANUAL_LIFETIME_MS = 1000;
const PRESTIGE_LIFETIME_MS = 1200;
const PRESTIGE_FLASH_MS = 600;

let burstSeq = 0;

function makeBurst({ kind, x, y }) {
  const count = kind === 'prestige' ? PRESTIGE_COUNT : MANUAL_COUNT;
  const colors = kind === 'prestige' ? PRESTIGE_COLORS : MANUAL_COLORS;
  const lifetime = kind === 'prestige' ? PRESTIGE_LIFETIME_MS : MANUAL_LIFETIME_MS;

  const particles = Array.from({ length: count }).map((_, i) => {
    // Arc de cercle : on tire des angles répartis sur le demi-cercle haut
    // (-PI à 0) avec un peu de jitter pour que ça reste organique.
    const baseAngle = -Math.PI + (Math.PI * (i + 0.5)) / count;
    const angle = baseAngle + (Math.random() - 0.5) * 0.5;
    const speed = 220 + Math.random() * 180; // px/s initial
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    return {
      id: i,
      color: colors[i % colors.length],
      dx,
      dy,
      // gravité positive → les particules retombent
      gravity: 900 + Math.random() * 300,
      size: 6 + Math.random() * 3,
      rot: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 720,
      delay: Math.random() * 60,
    };
  });

  return {
    id: ++burstSeq,
    kind,
    x,
    y,
    particles,
    lifetime,
    bornAt: performance.now(),
  };
}

export default function ConfettiBurst() {
  const reducedMotion = useGameStore((s) => s.settings?.reducedMotion);
  const [bursts, setBursts] = useState([]);
  const [prestigeFlash, setPrestigeFlash] = useState(null); // { id, bornAt }
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  // Capture position du dernier clic pour ancrer le burst manuel.
  useEffect(() => {
    const onDown = (e) => {
      window.__lastClickXY = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);

  // Subscribe au store : récolte manuelle + prestige.
  useEffect(() => {
    return useGameStore.subscribe((s, prev) => {
      if (reducedRef.current) return;

      // 1) Détecter un nouveau floatingNumber kind:'manual'
      const fns = s.floatingNumbers ?? [];
      const prevFns = prev?.floatingNumbers ?? [];
      if (fns.length > prevFns.length) {
        const prevIds = new Set(prevFns.map((f) => f.id));
        for (const f of fns) {
          if (prevIds.has(f.id)) continue;
          if (f.kind !== 'manual') continue;
          const pos = window.__lastClickXY ?? {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          };
          const burst = makeBurst({ kind: 'manual', x: pos.x, y: pos.y });
          setBursts((b) => [...b, burst]);
          setTimeout(() => {
            setBursts((b) => b.filter((x) => x.id !== burst.id));
          }, burst.lifetime + 100);
        }
      }

      // 2) Détecter un prestige : stats.firstPrestigeAt qui change.
      const cur = s.stats?.firstPrestigeAt ?? null;
      const old = prev?.stats?.firstPrestigeAt ?? null;
      if (cur !== old && cur != null) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const burst = makeBurst({ kind: 'prestige', x: cx, y: cy });
        setBursts((b) => [...b, burst]);
        const flashId = burst.id;
        setPrestigeFlash({ id: flashId, bornAt: performance.now() });
        setTimeout(() => {
          setBursts((b) => b.filter((x) => x.id !== burst.id));
        }, burst.lifetime + 100);
        setTimeout(() => {
          setPrestigeFlash((f) => (f && f.id === flashId ? null : f));
        }, PRESTIGE_FLASH_MS + 200);
      }
    });
  }, []);

  if (reducedMotion) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {prestigeFlash && (
        <>
          <div className="prestige-flash-overlay" />
          <div className="prestige-flash-text">PRESTIGE 🌟</div>
        </>
      )}
      {bursts.map((b) => (
        <div
          key={b.id}
          className={`confetti-burst confetti-burst-${b.kind}`}
          style={{ left: b.x, top: b.y }}
        >
          {b.particles.map((p) => (
            <span
              key={p.id}
              className="confetti-particle"
              style={{
                background: p.color,
                width: `${p.size}px`,
                height: `${p.size}px`,
                boxShadow: `0 0 8px ${p.color}, 0 0 14px ${p.color}55`,
                animationDuration: `${b.lifetime}ms`,
                animationDelay: `${p.delay}ms`,
                // Variables CSS lues par l'animation @keyframes confetti-fly.
                '--dx': `${p.dx}px`,
                '--dy': `${p.dy}px`,
                '--gravity': `${p.gravity}px`,
                '--rot0': `${p.rot}deg`,
                '--rot1': `${p.rot + p.rotSpeed}deg`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
