import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore.js';

// Réglages : audio (placeholder Prompt 10), animations réduites, langue,
// export/import du save, reset. GDD Prompt 5.
export default function SettingsModal() {
  const open = useGameStore((s) => s.activePanel === 'settings');
  const close = useGameStore((s) => s.setActivePanel);
  const settings = useGameStore((s) => s.settings);
  const update = useGameStore((s) => s.updateSettings);
  const exportSave = useGameStore((s) => s.exportSave);
  const importSave = useGameStore((s) => s.importSave);
  const reset = useGameStore((s) => s.hardReset);

  const [importText, setImportText] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const taRef = useRef(null);

  // Applique reducedMotion sur <body> pour activer la media query manuelle
  useEffect(() => {
    document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);
  }, [settings.reducedMotion]);

  // V3 — applique le thème néon optionnel sur <body>. Au démontage,
  // on retire la classe pour ne pas laisser un état résiduel.
  useEffect(() => {
    const isNeon = settings.theme === 'neon';
    document.body.classList.toggle('theme-neon', isNeon);
    return () => {
      // Si le composant est démonté pendant que neon est actif, on
      // ne touche à rien : la classe doit rester tant que le réglage
      // est ON. Le cleanup ne sert qu'à éviter un état fantôme si
      // jamais l'effet est rejoué — rien à faire ici.
    };
  }, [settings.theme]);

  if (!open) return null;

  const onExport = async () => {
    const json = exportSave();
    try {
      await navigator.clipboard.writeText(json);
      setExportNotice('Copié dans le presse-papier ✓');
    } catch {
      setExportNotice('Save générée — copie le texte ci-dessous');
    }
    if (taRef.current) {
      taRef.current.value = json;
      taRef.current.select();
    }
    setTimeout(() => setExportNotice(''), 3000);
  };

  const onImport = () => {
    const ok = importSave(importText.trim());
    setImportNotice(ok ? 'Save importée ✓' : 'Import échoué — JSON invalide ou version incompatible.');
    if (ok) {
      setImportText('');
      setTimeout(() => close(null), 1000);
    }
    setTimeout(() => setImportNotice(''), 4000);
  };

  const onReset = () => {
    if (confirm('Réinitialiser complètement la partie ? (action irréversible)')) {
      reset();
      close(null);
    }
  };

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Réglages</div>
            <div className="side-panel-sub">Confort, accessibilité, données</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          {/* ── Audio ─────────────────────────────────────── */}
          <Section title="Audio">
            <Slider
              label="Effets sonores"
              value={settings.sfxVolume}
              onChange={(v) => update({ sfxVolume: v })}
              disabled={settings.muted}
            />
            <Slider
              label="Musique"
              value={settings.musicVolume}
              onChange={(v) => update({ musicVolume: v })}
              disabled={settings.muted}
            />
            <Toggle
              label="Couper tout le son"
              checked={settings.muted}
              onChange={(v) => update({ muted: v })}
            />
            <p className="settings-hint">
              SFX synthétisés en Web Audio. La musique d'ambiance arrivera dans une mise à jour future.
            </p>
          </Section>

          {/* ── Confort ───────────────────────────────────── */}
          <Section title="Confort">
            <Toggle
              label="Réduire les animations"
              hint="Désactive les transitions et particules pour un rendu plus calme."
              checked={settings.reducedMotion}
              onChange={(v) => update({ reducedMotion: v })}
            />
            <Toggle
              label="✨ Thème néon"
              hint="Palette dopaminante avec dégradés vifs et glow ambiant."
              checked={settings.theme === 'neon'}
              onChange={(v) => update({ theme: v ? 'neon' : 'classic' })}
            />
            <div className="settings-row">
              <label>Langue</label>
              <select
                value={settings.lang}
                onChange={(e) => update({ lang: e.target.value })}
                className="settings-select"
              >
                <option value="fr">Français</option>
                <option value="en" disabled>English (à venir)</option>
              </select>
            </div>
          </Section>

          {/* ── Sauvegarde ────────────────────────────────── */}
          <Section title="Sauvegarde">
            <button className="btn-secondary" onClick={onExport} aria-label="Exporter la sauvegarde">
              📤 Exporter (presse-papier)
            </button>
            {exportNotice && <p className="settings-notice">{exportNotice}</p>}

            <textarea
              ref={taRef}
              className="settings-textarea"
              placeholder="Colle ici un JSON de save pour l'importer…"
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              aria-label="JSON de save à importer"
            />
            <button
              className="btn-secondary"
              onClick={onImport}
              disabled={!importText.trim()}
              aria-label="Importer la sauvegarde"
            >
              📥 Importer
            </button>
            {importNotice && <p className="settings-notice">{importNotice}</p>}
          </Section>

          {/* ── Danger zone ──────────────────────────────── */}
          <Section title="Zone dangereuse">
            <button className="btn-danger" onClick={onReset} aria-label="Réinitialiser la partie">
              ⟲ Réinitialiser la progression
            </button>
            <p className="settings-hint">Toutes tes plantes, jardiniers et upgrades seront perdus.</p>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function Slider({ label, value, onChange, disabled }) {
  return (
    <div className="settings-row">
      <label>{label}</label>
      <div className="slider-group">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          aria-label={label}
        />
        <span className="slider-value">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="settings-row settings-row--toggle">
      <div>
        <label>{label}</label>
        {hint && <p className="settings-hint">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
}
