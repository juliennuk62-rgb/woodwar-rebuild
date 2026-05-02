import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

// Caméra isométrique avec contrôles utilisateur :
//  · drag (souris ou 1 doigt)  → pan
//  · molette                   → zoom
//  · pinch (2 doigts)          → zoom
// Pas de rotation : la vue iso reste fixe (GDD §13 — Prompt 2).
//
// On déplace le `target` (point regardé) plutôt que la position caméra,
// pour conserver l'angle iso.
//
// Pour ne pas avaler les clics de plantation, on utilise un flag global
// `window.__jardin_drag` : si > 200 ms après un drag, PlantSlot ignore
// le onClick suivant.

const ISO_OFFSET = [12, 12, 12];
const PAN_LIMITS = { x: 5, z: 5 };
const ZOOM_RANGE = { min: 18, max: 120 };
const DRAG_THRESHOLD_PX = 6;

export default function IsometricCamera() {
  const { camera, gl, size } = useThree();
  const target = useRef([0, 0, 0]);
  const zoomRef = useRef(40);

  // Recadrage initial + sur resize : choisit un zoom qui fait tenir 15×12 unités.
  useEffect(() => {
    const z = Math.max(
      ZOOM_RANGE.min,
      Math.min(size.width / 15, size.height / 12)
    );
    zoomRef.current = z;
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  // Pose les listeners de pan + zoom.
  useEffect(() => {
    const dom = gl.domElement;
    const pointers = new Map();
    let drag = null;
    let pinchStartDist = null;
    let pinchStartZoom = null;

    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        drag = {
          startX: e.clientX,
          startY: e.clientY,
          startTarget: [...target.current],
          moved: false,
        };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchStartZoom = zoomRef.current;
        drag = null; // un pinch interrompt un éventuel pan
      }
    };

    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch (2 doigts) → zoom
      if (pointers.size === 2 && pinchStartDist != null) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        zoomRef.current = clamp(
          pinchStartZoom * (dist / pinchStartDist),
          ZOOM_RANGE.min,
          ZOOM_RANGE.max
        );
        apply();
        return;
      }

      // Pan (1 doigt) — uniquement après un seuil pour ne pas voler les clics
      if (drag) {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        const k = 1 / zoomRef.current;
        const wx = -dx * k;
        const wz = -dy * k;
        // Sur une vue iso, mouvement écran ↔ déplacement combiné x/z
        const newX = clamp(drag.startTarget[0] + wx * 1.2 + wz * 0.7, -PAN_LIMITS.x, PAN_LIMITS.x);
        const newZ = clamp(drag.startTarget[2] - wx * 0.7 + wz * 1.2, -PAN_LIMITS.z, PAN_LIMITS.z);
        target.current = [newX, 0, newZ];
        apply();
      }
    };

    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { pinchStartDist = null; pinchStartZoom = null; }
      if (pointers.size === 0) {
        if (drag && drag.moved) {
          // Inhibe le clic R3F qui suit immédiatement
          window.__jardinDragEndedAt = Date.now();
        }
        drag = null;
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomRef.current = clamp(zoomRef.current * factor, ZOOM_RANGE.min, ZOOM_RANGE.max);
      apply();
    };

    // pointerdown sur le canvas, mais move/up sur window pour suivre hors-canvas
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  function apply() {
    const [tx, ty, tz] = target.current;
    camera.position.set(tx + ISO_OFFSET[0], ty + ISO_OFFSET[1], tz + ISO_OFFSET[2]);
    camera.lookAt(tx, ty, tz);
    camera.zoom = zoomRef.current;
    camera.updateProjectionMatrix();
  }

  return null;
}

// Utilitaire à utiliser dans PlantSlot.onClick pour ignorer les clics
// qui arrivent juste après un drag (la fin du drag déclenche un onClick R3F).
export function clickWasDrag() {
  const t = window.__jardinDragEndedAt;
  if (!t) return false;
  return Date.now() - t < 250;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
