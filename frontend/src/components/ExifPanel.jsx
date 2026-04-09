import { useState, useEffect } from 'react'
import { getExif } from '../api/client'
import { X, Loader } from 'lucide-react'
import styles from './ExifPanel.module.css'

export default function ExifPanel({ path, onClose, inline = false }) {
  const [exif, setExif] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getExif(path).then(data => { setExif(data); setLoading(false) }).catch(() => setLoading(false))
  }, [path])

  return (
    <div className={`${styles.panel} ${inline ? styles.panelInline : ''}`}>
      <div className={styles.header}>
        <span>EXIF-Daten</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
      </div>
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}><Loader size={16} className="animate-spin" /></div>
        ) : exif ? (
          <>
            {Object.entries(exif.important || {}).map(([k, v]) => (
              <div key={k} className={styles.row}>
                <span className={styles.key}>{k}</span>
                <span className={styles.val}>{String(v)}</span>
              </div>
            ))}
            {Object.keys(exif.important || {}).length === 0 && (
              <p className={styles.empty}>Keine EXIF-Daten gefunden</p>
            )}
          </>
        ) : (
          <p className={styles.empty}>Fehler beim Laden</p>
        )}
      </div>
    </div>
  )
}
