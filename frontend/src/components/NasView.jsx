import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAppStore } from '../stores/appStore'
import { getNasStatus, mountNas, unmountNas, startNasCopy, getNasJob } from '../api/client'
import { HardDrive, Plug, PlugZap, Upload, CheckCircle, AlertCircle, FolderTree } from 'lucide-react'
import ProgressBar from './ProgressBar'
import styles from './NasView.module.css'

export default function NasView() {
  const { images, nasStatus, setNasStatus } = useAppStore()
  const [jobData, setJobData] = useState(null)
  const [done, setDone] = useState(false)

  const refreshStatus = async () => {
    try { setNasStatus(await getNasStatus()) } catch {}
  }

  useEffect(() => { refreshStatus() }, [])

  const handleMount = async () => {
    const toastId = toast.loading('Verbinde mit NAS…')
    try {
      await mountNas()
      toast.success('NAS verbunden', { id: toastId })
      refreshStatus()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'NFS-Mount fehlgeschlagen', { id: toastId })
    }
  }

  const handleUnmount = async () => {
    const toastId = toast.loading('Trenne NAS…')
    try {
      await unmountNas()
      toast.success('NAS getrennt', { id: toastId })
      refreshStatus()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Fehler beim Trennen', { id: toastId })
    }
  }

  const handleCopy = async () => {
    if (!nasStatus?.mounted) return toast.error('NAS nicht verbunden')
    if (!images.length) return toast.error('Keine Bilder im Staging')

    const toastId = toast.loading('Kopiere auf NAS…')
    try {
      const allPaths = images.map(i => i.path)
      const job = await startNasCopy(allPaths)
      toast.success(`${allPaths.length} Bilder werden kopiert`, { id: toastId })
      pollJob(job.job_id)
    } catch (e) {
      toast.error('Fehler beim Kopieren', { id: toastId })
    }
  }

  const pollJob = (id) => {
    const interval = setInterval(async () => {
      try {
        const data = await getNasJob(id)
        setJobData(data)
        if (data.status === 'done') {
          clearInterval(interval)
          setDone(true)
          if (data.errors?.length) {
            toast.error(`${data.copied} kopiert, ${data.errors.length} Fehler`)
          } else {
            toast.success(`${data.copied} Bilder erfolgreich auf NAS gesichert ✓`)
          }
        }
      } catch { clearInterval(interval) }
    }, 800)
  }

  const FOLDER_EXAMPLES = [
    { path: 'Tiere/Fuchs/2026-04-09', desc: 'Fuchs erkannt' },
    { path: 'Landschaft/Wald/2026-04-09', desc: 'Waldlandschaft' },
    { path: 'Tiere/Vogel/Taube/2026-04-09', desc: 'Taube erkannt' },
    { path: 'Architektur/Stadt/2026-04-09', desc: 'Stadtaufnahmen' },
    { path: 'Sonstiges/2026-04-09', desc: 'Kein passender Tag' },
  ]

  return (
    <div className={styles.container}>
      {/* NAS Status Card */}
      <div className={`${styles.statusCard} ${nasStatus?.mounted ? styles.statusConnected : ''}`}>
        <div className={styles.statusIcon}>
          <HardDrive size={22} strokeWidth={1.5} />
        </div>
        <div className={styles.statusInfo}>
          <h3 className={styles.statusTitle}>Ugreen NAS</h3>
          <p className={styles.statusSub}>
            {nasStatus?.mounted
              ? `Verbunden · ${nasStatus.free_space_human || ''} frei`
              : `Getrennt · ${nasStatus?.nas_ip || '—'}`
            }
          </p>
        </div>
        <div className={styles.statusActions}>
          {nasStatus?.mounted
            ? <>
                <span className={styles.connectedBadge}><CheckCircle size={13} /> Verbunden</span>
                <button className={styles.btnDisconnect} onClick={handleUnmount}>
                  <Plug size={14} /> Trennen
                </button>
              </>
            : <button className={styles.btnConnect} onClick={handleMount}>
                <PlugZap size={14} /> Verbinden
              </button>
          }
        </div>
      </div>

      {/* NFS-Pfade */}
      {nasStatus?.mounted && (
        <div className={styles.pathsGrid}>
          {[
            { label: 'Bilder', path: '/volume2/Bilder', icon: '📸' },
            { label: 'Videos', path: '/volume2/Videos', icon: '🎬' },
            { label: 'Presets', path: '/volume2/Lightroom/Presets', icon: '🎨' },
          ].map(p => (
            <div key={p.path} className={styles.pathCard}>
              <span className={styles.pathIcon}>{p.icon}</span>
              <div>
                <div className={styles.pathLabel}>{p.label}</div>
                <div className={styles.pathVal}>{p.path}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Kopier-Button */}
      <div className={styles.copySection}>
        <div className={styles.copyInfo}>
          <span className={styles.copyCount}>
            {images.length} Bilder im Staging
          </span>
          <span className={styles.copyHint}>Checksummen werden verifiziert</span>
        </div>
        <button
          className={styles.copyBtn}
          onClick={handleCopy}
          disabled={!nasStatus?.mounted || !images.length || (jobData?.status === 'running')}
        >
          <Upload size={16} />
          Auf NAS kopieren
        </button>
      </div>

      {/* Fortschritt */}
      {jobData && (
        <div className={styles.progressBox}>
          <ProgressBar
            progress={jobData.progress}
            label={
              jobData.status === 'done'
                ? `${jobData.copied} Bilder gesichert ✓`
                : `Kopiere: ${jobData.current_file || '…'}`
            }
            sub={jobData.dest_folder ? `→ ${jobData.dest_folder}` : `${jobData.copied || 0} / ${jobData.total || 0}`}
            color={jobData.status === 'done' ? 'var(--green)' : 'var(--accent)'}
          />
          {jobData.errors?.length > 0 && (
            <div className={styles.errors}>
              {jobData.errors.map((e, i) => (
                <div key={i} className={styles.errorRow}><AlertCircle size={12} /> {e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ordnerstruktur Vorschau */}
      <div className={styles.folderPreview}>
        <div className={styles.folderPreviewHeader}>
          <FolderTree size={14} />
          <span>Automatische Ordnerstruktur (Beispiele)</span>
        </div>
        <div className={styles.folderList}>
          {FOLDER_EXAMPLES.map(f => (
            <div key={f.path} className={styles.folderRow}>
              <span className={styles.folderPath}>/Bilder/{f.path}/</span>
              <span className={styles.folderDesc}>{f.desc}</span>
            </div>
          ))}
        </div>
        <p className={styles.folderNote}>
          Ordner werden aus den KI-Tags bestimmt. XMP-Sidecar-Dateien werden mitgesichert.
        </p>
      </div>

      {/* Fertig-Banner */}
      {done && (
        <div className={styles.doneBanner}>
          <CheckCircle size={18} />
          <div>
            <strong>Sicherung abgeschlossen!</strong>
            <span> Bilder sind jetzt in Lightroom verfügbar.</span>
          </div>
        </div>
      )}
    </div>
  )
}
