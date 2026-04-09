import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAppStore } from '../stores/appStore'
import { getAiStatus, startAnalysis, getAnalysisJob, updateTags, thumbnailUrl } from '../api/client'
import { Cpu, Play, CheckCircle, AlertCircle, Tag, X, Loader, Wand2 } from 'lucide-react'
import ProgressBar from './ProgressBar'
import styles from './AiView.module.css'

export default function AiView() {
  const { images, aiResults, setAiResults, setActiveView } = useAppStore()
  const [aiStatus, setAiStatus] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [jobData, setJobData] = useState(null)
  const [polling, setPolling] = useState(false)
  const [editingTags, setEditingTags] = useState({})
  const [generatePresets, setGeneratePresets] = useState(true)

  useEffect(() => {
    getAiStatus().then(setAiStatus).catch(() => {})
  }, [])

  const handleStart = async () => {
    if (!images.length) return toast.error('Keine Bilder im Staging')
    if (!aiStatus?.llava_ready) return toast.error('LLaVA nicht bereit. Führe aus: ollama pull llava:7b')

    const toastId = toast.loading('KI-Analyse gestartet…')
    try {
      const allPaths = images.map(i => i.path)
      const job = await startAnalysis(allPaths, generatePresets)
      setJobId(job.job_id)
      toast.success(`Analysiere ${allPaths.length} Bilder`, { id: toastId })
      pollJob(job.job_id)
    } catch (e) {
      toast.error('Fehler beim Starten', { id: toastId })
    }
  }

  const pollJob = (id) => {
    setPolling(true)
    const interval = setInterval(async () => {
      try {
        const data = await getAnalysisJob(id)
        setJobData(data)
        if (data.results) {
          setAiResults(data.results)
        }
        if (data.status === 'done') {
          clearInterval(interval)
          setPolling(false)
          toast.success('KI-Analyse abgeschlossen!')
        }
      } catch { clearInterval(interval); setPolling(false) }
    }, 1500)
  }

  const handleTagUpdate = async (imgPath, newTags) => {
    try {
      await updateTags(imgPath, newTags)
      setAiResults({ [imgPath]: { ...aiResults[imgPath], tags: newTags } })
      toast.success('Tags gespeichert')
    } catch {
      toast.error('Fehler beim Speichern')
    }
  }

  const analyzedCount = Object.keys(aiResults).filter(k => aiResults[k].status === 'done').length
  const readyForNas = analyzedCount > 0 || images.length > 0

  return (
    <div className={styles.container}>
      {/* Header Panel */}
      <div className={styles.headerPanel}>
        <div className={styles.aiIcon}>
          <Cpu size={22} strokeWidth={1.5} />
        </div>
        <div className={styles.aiInfo}>
          <h2 className={styles.aiTitle}>Lokale KI-Analyse</h2>
          <p className={styles.aiSub}>
            {aiStatus?.llava_ready
              ? `LLaVA bereit · ${images.length} Bilder im Staging`
              : 'LLaVA nicht geladen'}
          </p>
        </div>
        <div className={styles.aiStatus}>
          {aiStatus?.llava_ready
            ? <span className={styles.statusOk}><CheckCircle size={14} /> Bereit</span>
            : <span className={styles.statusErr}><AlertCircle size={14} /> Nicht bereit</span>
          }
        </div>
      </div>

      {/* Ollama nicht bereit */}
      {aiStatus && !aiStatus.llava_ready && (
        <div className={styles.warningBox}>
          <AlertCircle size={16} />
          <div>
            <strong>LLaVA Modell nicht geladen.</strong> Verbinde dich per SSH und führe aus:
            <code className={styles.code}>ollama pull llava:7b</code>
            <span className={styles.warnNote}>Das Modell ist ca. 4.7 GB groß.</span>
          </div>
        </div>
      )}

      {/* Einstellungen & Start */}
      <div className={styles.controls}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={generatePresets}
            onChange={e => setGeneratePresets(e.target.checked)}
          />
          <span className={styles.toggleLabel}>Lightroom-Presets generieren</span>
        </label>
        <button
          className={styles.startBtn}
          onClick={handleStart}
          disabled={polling || !aiStatus?.llava_ready || !images.length}
        >
          {polling
            ? <><Loader size={15} className="animate-spin" /> Analysiere…</>
            : <><Wand2 size={15} /> {images.length} Bilder analysieren</>
          }
        </button>
      </div>

      {/* Fortschritt */}
      {jobData && jobData.status === 'running' && (
        <div className={styles.progressBox}>
          <ProgressBar
            progress={jobData.progress}
            label={`Analysiere: ${jobData.current || '…'}`}
            sub={`${analyzedCount} / ${images.length} fertig`}
            color="var(--purple)"
          />
        </div>
      )}

      {/* Ergebnis-Grid */}
      {Object.keys(aiResults).length > 0 && (
        <div className={styles.resultsSection}>
          <div className={styles.resultsHeader}>
            <span className={styles.resultsTitle}>Analyse-Ergebnisse</span>
            <span className={styles.resultsCount}>{analyzedCount} analysiert</span>
          </div>
          <div className={styles.resultsGrid}>
            {images.map(img => {
              const result = aiResults[img.path]
              if (!result || result.status !== 'done') return null
              return (
                <TagCard
                  key={img.path}
                  img={img}
                  result={result}
                  onSaveTags={(tags) => handleTagUpdate(img.path, tags)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Weiter zum NAS */}
      {readyForNas && analyzedCount > 0 && (
        <div className={styles.nextStep}>
          <span>Tags geprüft? Dann weiter:</span>
          <button className={styles.nextBtn} onClick={() => setActiveView('nas')}>
            Auf NAS kopieren →
          </button>
        </div>
      )}
    </div>
  )
}

function TagCard({ img, result, onSaveTags }) {
  const [tags, setTags] = useState(result.tags || [])
  const [newTag, setNewTag] = useState('')
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)

  const addTag = () => {
    const t = newTag.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
      setNewTag('')
      setSaved(false)
    }
  }

  const removeTag = (tag) => {
    setTags(tags.filter(t => t !== tag))
    setSaved(false)
  }

  const save = async () => {
    await onSaveTags(tags)
    setSaved(true)
    setEditing(false)
  }

  return (
    <div className={styles.tagCard}>
      <div className={styles.tagCardImg}>
        <img src={thumbnailUrl(img.path, 200)} alt={img.name} loading="lazy" />
      </div>
      <div className={styles.tagCardContent}>
        <div className={styles.tagCardName}>{img.name}</div>
        {result.mood && (
          <div className={styles.moodBadge}>
            <span className={styles.moodDot} />
            {result.mood}
          </div>
        )}
        <div className={styles.tagsRow}>
          {tags.map(tag => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button className={styles.tagRemove} onClick={() => removeTag(tag)}><X size={10} /></button>
            </span>
          ))}
        </div>
        {editing ? (
          <div className={styles.addTagRow}>
            <input
              className={styles.tagInput}
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Tag hinzufügen…"
              autoFocus
            />
            <button className={styles.addTagBtn} onClick={addTag}>+</button>
            <button className={styles.saveTagBtn} onClick={save}>
              {saved ? <CheckCircle size={13} /> : 'Speichern'}
            </button>
          </div>
        ) : (
          <button className={styles.editTagsBtn} onClick={() => setEditing(true)}>
            <Tag size={11} /> Tags bearbeiten
          </button>
        )}
      </div>
    </div>
  )
}
