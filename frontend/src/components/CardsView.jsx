import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useAppStore } from '../stores/appStore'
import {
  getCards, mountCard, unmountCard, scanCard, startCopy, getJob
} from '../api/client'
import {
  CreditCard, RefreshCw, HardDrive, Upload, LogOut,
  Camera, Film, CheckCircle, AlertCircle, Loader
} from 'lucide-react'
import ProgressBar from './ProgressBar'
import styles from './CardsView.module.css'

export default function CardsView() {
  const { setActiveView } = useAppStore()
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState({})
  const [cardScans, setCardScans] = useState({})
  const [copyJob, setCopyJob] = useState(null)
  const [copyProgress, setCopyProgress] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCards()
      setCards(data)
    } catch {
      toast.error('Fehler beim Lesen der Geräte')
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [])

  const handleMount = async (card) => {
    const toastId = toast.loading(`Mounte ${card.label}…`)
    try {
      const result = await mountCard(card.device)
      toast.success(result.message, { id: toastId })
      await refresh()
      // Karte scannen
      await handleScan(card.device, result.mount_point)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Mount fehlgeschlagen', { id: toastId })
    }
  }

  const handleUnmount = async (card) => {
    const toastId = toast.loading(`Werfe aus…`)
    try {
      const result = await unmountCard(card.device)
      toast.success(result.message, { id: toastId })
      await refresh()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Auswerfen fehlgeschlagen', { id: toastId })
    }
  }

  const handleScan = async (device, mountPoint) => {
    if (!mountPoint) return
    setScanning(s => ({ ...s, [device]: true }))
    try {
      const scan = await scanCard(mountPoint)
      setCardScans(s => ({ ...s, [device]: { ...scan, mount_point: mountPoint } }))
    } catch {}
    setScanning(s => ({ ...s, [device]: false }))
  }

  const handleCopyPhotos = async (card) => {
    const scan = cardScans[card.device]
    if (!scan) return toast.error('Karte zuerst scannen')

    // Alle Fotos auf der Karte holen
    const toastId = toast.loading('Starte Kopiervorgang…')
    try {
      // Vollständiger Scan
      const fullScan = await scanCard(scan.mount_point)
      const job = await startCopy(fullScan.photos, 'photos')
      toast.success('Kopieren gestartet', { id: toastId })
      pollCopyJob(job.job_id, 'photos')
    } catch (e) {
      toast.error('Fehler beim Kopieren', { id: toastId })
    }
  }

  const handleCopyVideos = async (card) => {
    const scan = cardScans[card.device]
    if (!scan) return toast.error('Karte zuerst scannen')

    const toastId = toast.loading('Starte Video-Kopiervorgang…')
    try {
      const fullScan = await scanCard(scan.mount_point)
      const job = await startCopy(fullScan.videos, 'videos')
      toast.success('Videos werden kopiert', { id: toastId })
      pollCopyJob(job.job_id, 'videos')
    } catch (e) {
      toast.error('Fehler beim Kopieren', { id: toastId })
    }
  }

  const pollCopyJob = async (jobId, type) => {
    setCopyJob(jobId)
    const interval = setInterval(async () => {
      try {
        const job = await getJob(jobId)
        setCopyProgress(job)
        if (job.status === 'done' || job.status === 'done_with_errors') {
          clearInterval(interval)
          if (job.errors?.length) {
            toast.error(`${job.copied} kopiert, ${job.errors.length} Fehler`)
          } else {
            toast.success(`${job.copied} ${type === 'photos' ? 'Fotos' : 'Videos'} kopiert ✓`)
          }
          if (type === 'photos') {
            setTimeout(() => setActiveView('culling'), 1500)
          }
        }
      } catch { clearInterval(interval) }
    }, 800)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <p className={styles.subtitle}>
          Speicherkarte einstecken, mounten und Dateien kopieren
        </p>
        <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Aktualisieren
        </button>
      </div>

      {/* Kopier-Fortschritt */}
      {copyProgress && copyProgress.status === 'running' && (
        <div className={styles.progressSection}>
          <ProgressBar
            progress={copyProgress.progress}
            label={`Kopiere: ${copyProgress.current_file || '…'}`}
            sub={`${copyProgress.copied || 0} / ${copyProgress.total || 0} Dateien`}
            color="var(--accent)"
          />
        </div>
      )}

      {/* Karten-Liste */}
      {cards.length === 0 ? (
        <div className={styles.empty}>
          <CreditCard size={48} strokeWidth={0.8} style={{ color: 'var(--text-muted)' }} />
          <p>Keine Speicherkarte erkannt</p>
          <p className={styles.emptyHint}>Kartenleser anschließen und Karte einstecken, dann Aktualisieren klicken</p>
        </div>
      ) : (
        <div className={styles.cardGrid}>
          {cards.map(card => {
            const scan = cardScans[card.device]
            const isScan = scanning[card.device]
            return (
              <div key={card.device} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIcon}>
                    <HardDrive size={20} strokeWidth={1.5} />
                  </div>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardLabel}>{card.label}</span>
                    <span className={styles.cardMeta}>
                      {card.device} · {card.size_human} · {card.filesystem}
                    </span>
                  </div>
                  <div
                    className={styles.statusDot}
                    style={{ background: card.mounted ? 'var(--green)' : 'var(--text-muted)' }}
                    title={card.mounted ? `Gemountet: ${card.mount_point}` : 'Nicht gemountet'}
                  />
                </div>

                {card.mounted && card.mount_point && (
                  <div className={styles.mountInfo}>
                    <span className={styles.mountPath}>{card.mount_point}</span>
                    {isScan && (
                      <span className={styles.scanning}>
                        <Loader size={12} className="animate-spin" /> Scanne…
                      </span>
                    )}
                  </div>
                )}

                {scan && (
                  <div className={styles.scanResults}>
                    <div className={styles.scanStat}>
                      <Camera size={14} />
                      <span>{scan.photo_count} Fotos</span>
                    </div>
                    <div className={styles.scanStat}>
                      <Film size={14} />
                      <span>{scan.video_count} Videos</span>
                    </div>
                  </div>
                )}

                <div className={styles.cardActions}>
                  {!card.mounted ? (
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      onClick={() => handleMount(card)}
                    >
                      <Upload size={14} /> Mounten
                    </button>
                  ) : (
                    <>
                      {scan && scan.photo_count > 0 && (
                        <button
                          className={`${styles.btn} ${styles.btnAccent}`}
                          onClick={() => handleCopyPhotos(card)}
                        >
                          <Camera size={14} /> {scan.photo_count} Fotos kopieren
                        </button>
                      )}
                      {scan && scan.video_count > 0 && (
                        <button
                          className={`${styles.btn} ${styles.btnGreen}`}
                          onClick={() => handleCopyVideos(card)}
                        >
                          <Film size={14} /> {scan.video_count} Videos → NAS
                        </button>
                      )}
                      {!scan && !isScan && (
                        <button
                          className={`${styles.btn} ${styles.btnSecondary}`}
                          onClick={() => handleScan(card.device, card.mount_point)}
                        >
                          <RefreshCw size={14} /> Karte scannen
                        </button>
                      )}
                      <button
                        className={`${styles.btn} ${styles.btnDanger}`}
                        onClick={() => handleUnmount(card)}
                      >
                        <LogOut size={14} /> Auswerfen
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Hinweis */}
      <div className={styles.hint}>
        <AlertCircle size={14} />
        <span>Karten werden <strong>nie gelöscht</strong>. Fotos kommen zuerst auf die SSD (Staging), Videos direkt auf das NAS.</span>
      </div>
    </div>
  )
}
