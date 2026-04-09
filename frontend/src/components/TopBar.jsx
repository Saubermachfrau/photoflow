import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { Keyboard, HelpCircle, X } from 'lucide-react'
import styles from './TopBar.module.css'

const VIEW_TITLES = {
  cards: 'Speicherkarten',
  culling: 'Culling',
  ai: 'KI-Analyse',
  nas: 'NAS-Sicherung',
}

const SHORTCUTS = [
  { key: '→ / ←', desc: 'Nächstes / Vorheriges Bild (Vollbild)' },
  { key: 'Del / X', desc: 'Bild zum Löschen markieren' },
  { key: 'Space', desc: 'Vollbild toggle' },
  { key: 'F', desc: 'Vollbild öffnen' },
  { key: 'Esc', desc: 'Vollbild schließen / Auswahl aufheben' },
  { key: '1–5', desc: 'Stern-Bewertung setzen' },
  { key: 'S', desc: 'Auswahl toggle' },
  { key: 'Ctrl+A', desc: 'Alle auswählen' },
  { key: 'Ctrl+Z', desc: 'Löschen rückgängig' },
  { key: 'I', desc: 'EXIF-Info togglen' },
]

export default function TopBar() {
  const { activeView, markedForDelete, selectedImages } = useAppStore()
  const [showShortcuts, setShowShortcuts] = useState(false)

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{VIEW_TITLES[activeView]}</h1>
        {activeView === 'culling' && (
          <div className={styles.badges}>
            {selectedImages.size > 0 && (
              <span className={styles.badge} style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                {selectedImages.size} ausgewählt
              </span>
            )}
            {markedForDelete.size > 0 && (
              <span className={styles.badge} style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>
                {markedForDelete.size} zum Löschen
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.right}>
        <button
          className={styles.iconBtn}
          onClick={() => setShowShortcuts(true)}
          title="Tastaturkürzel (Shift+?)"
        >
          <Keyboard size={16} />
        </button>
      </div>

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className={styles.overlay} onClick={() => setShowShortcuts(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span>Tastaturkürzel</span>
              <button className={styles.closeBtn} onClick={() => setShowShortcuts(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.shortcuts}>
              {SHORTCUTS.map(({ key, desc }) => (
                <div key={key} className={styles.shortcutRow}>
                  <kbd className={styles.kbd}>{key}</kbd>
                  <span className={styles.shortcutDesc}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
