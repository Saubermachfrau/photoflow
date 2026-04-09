import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useAppStore } from '../stores/appStore'
import { listImages, deleteImages, updateTags, thumbnailUrl } from '../api/client'
import {
  Trash2, RotateCcw, FolderOpen, Info, CheckSquare, Square, X
} from 'lucide-react'
import ExifPanel from './ExifPanel'
import styles from './CullingView.module.css'

const GRID_SIZES = [
  { id: 'lg', cols: 2, label: 'XL' },
  { id: 'md', cols: 3, label: 'L' },
  { id: 'sm', cols: 4, label: 'M' },
  { id: 'xs', cols: 6, label: 'S' },
]

export default function CullingView() {
  const {
    images, setImages, folders, setFolders,
    currentFolder, setCurrentFolder,
    selectedImages, toggleSelect, selectAll, clearSelection,
    markedForDelete, toggleDelete, undoDelete,
    imageRatings, setRating,
    openFullscreen,
  } = useAppStore()

  const [gridSize, setGridSize] = useState('md')
  const [showExif, setShowExif] = useState(false)
  const [exifTarget, setExifTarget] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filterRating, setFilterRating] = useState(0)

  const loadImages = useCallback(async (folder = '') => {
    setLoading(true)
    try {
      const data = await listImages(folder)
      setImages(data.images || [])
      setFolders(data.folders || [])
    } catch {
      toast.error('Fehler beim Laden der Bilder')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadImages(currentFolder) }, [currentFolder])

  const handleDeleteMarked = async () => {
    const toDelete = [...markedForDelete]
    if (!toDelete.length) return toast.error('Keine Bilder markiert')
    try {
      await deleteImages(toDelete)
      toast.success(`${toDelete.length} Bilder in Papierkorb verschoben`)
      setImages(images.filter(img => !markedForDelete.has(img.path)))
      clearSelection()
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  const handleDeleteSelected = async () => {
    const toDelete = [...selectedImages]
    if (!toDelete.length) return toast.error('Keine Bilder ausgewählt')
    try {
      await deleteImages(toDelete)
      toast.success(`${toDelete.length} Bilder entfernt`)
      setImages(images.filter(img => !selectedImages.has(img.path)))
      clearSelection()
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  const handleRating = async (path, rating) => {
    setRating(path, rating)
    try { await updateTags(path, [], rating) } catch {}
  }

  const allSelected = images.length > 0 && selectedImages.size === images.length

  const filteredImages = filterRating > 0
    ? images.filter(img => (imageRatings[img.path] || 0) >= filterRating)
    : images

  const cols = GRID_SIZES.find(g => g.id === gridSize)?.cols || 3

  return (
    <div className={styles.container}>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className={styles.toolbar}>

        {/* Links: Ordner + Rating-Filter */}
        <div className={styles.toolbarLeft}>
          {folders.length > 0 && (
            <div className={styles.folderNav}>
              <button
                className={`${styles.folderBtn} ${currentFolder === '' ? styles.folderActive : ''}`}
                onClick={() => setCurrentFolder('')}
              >Alle</button>
              {folders.map(f => (
                <button
                  key={f.path}
                  className={`${styles.folderBtn} ${currentFolder === f.path ? styles.folderActive : ''}`}
                  onClick={() => setCurrentFolder(f.path)}
                >
                  {f.name}
                  <span className={styles.folderCount}>{f.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className={styles.filterRow}>
            <span className={styles.filterLabel}>Filter:</span>
            {[0,1,2,3,4,5].map(r => (
              <button
                key={r}
                className={`${styles.ratingFilterBtn} ${filterRating === r ? styles.ratingFilterActive : ''}`}
                onClick={() => setFilterRating(r)}
              >
                {r === 0 ? 'Alle' : '★'.repeat(r)}
              </button>
            ))}
          </div>
        </div>

        {/* Rechts: Aktionen */}
        <div className={styles.toolbarRight}>

          {/* Grid-Größe */}
          <div className={styles.gridSizeGroup}>
            {GRID_SIZES.map(g => (
              <button
                key={g.id}
                className={`${styles.gridSizeBtn} ${gridSize === g.id ? styles.gridSizeActive : ''}`}
                onClick={() => setGridSize(g.id)}
                title={g.label}
              >{g.label}</button>
            ))}
          </div>

          {/* Alles auswählen / abwählen */}
          <button
            className={`${styles.actionBtn} ${allSelected ? styles.actionBtnActive : ''}`}
            onClick={allSelected ? clearSelection : selectAll}
            title="Alle auswählen (Ctrl+A)"
          >
            {allSelected
              ? <><CheckSquare size={14} /> Alle abwählen</>
              : <><Square size={14} /> Alle auswählen</>
            }
          </button>

          {/* Auswahl löschen */}
          {selectedImages.size > 0 && (
            <button className={styles.actionBtnDanger} onClick={handleDeleteSelected}>
              <Trash2 size={14} />
              {selectedImages.size} Auswahl löschen
            </button>
          )}

          {/* Markierte löschen */}
          {markedForDelete.size > 0 && (
            <>
              <button className={styles.undoBtn} onClick={undoDelete} title="Rückgängig (Ctrl+Z)">
                <RotateCcw size={14} />
              </button>
              <button className={styles.actionBtnRed} onClick={handleDeleteMarked}>
                <Trash2 size={14} />
                {markedForDelete.size} markierte löschen
              </button>
            </>
          )}

        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────── */}
      <div className={styles.content}>
        <div className={styles.gridArea}>
          {loading ? (
            <div className={styles.grid} style={{ '--cols': cols }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={`${styles.skeletonCard} skeleton`} />
              ))}
            </div>
          ) : filteredImages.length === 0 ? (
            <div className={styles.empty}>
              <FolderOpen size={48} strokeWidth={0.8} style={{ color: 'var(--text-muted)' }} />
              <p>Keine Bilder im Staging-Bereich</p>
              <p className={styles.emptyHint}>Kopiere Fotos von der Speicherkarte über den Karten-Tab</p>
            </div>
          ) : (
            <div className={styles.grid} style={{ '--cols': cols }}>
              {filteredImages.map((img, idx) => (
                <ImageCard
                  key={img.path}
                  img={img}
                  index={idx}
                  selected={selectedImages.has(img.path)}
                  markedDelete={markedForDelete.has(img.path)}
                  rating={imageRatings[img.path] || 0}
                  onSelect={() => toggleSelect(img.path)}
                  onMarkDelete={() => toggleDelete(img.path)}
                  onOpenFullscreen={() => openFullscreen(img.path, idx)}
                  onRating={(r) => handleRating(img.path, r)}
                  onShowExif={() => { setExifTarget(img.path); setShowExif(true) }}
                />
              ))}
            </div>
          )}
        </div>

        {/* EXIF Panel */}
        {showExif && exifTarget && (
          <ExifPanel path={exifTarget} onClose={() => setShowExif(false)} />
        )}
      </div>

      {/* ── Status Bar ──────────────────────────────────────────── */}
      <div className={styles.statusBar}>
        <span>{filteredImages.length} Bilder</span>
        {selectedImages.size > 0 && (
          <span style={{ color: 'var(--accent)' }}>· {selectedImages.size} ausgewählt</span>
        )}
        {markedForDelete.size > 0 && (
          <span style={{ color: 'var(--red)' }}>· {markedForDelete.size} zum Löschen markiert</span>
        )}
        <span className={styles.shortcutHint}>
          Klick = auswählen · Doppelklick = Vollbild · X = löschen markieren · 1-5 = Bewertung · Ctrl+Z = Rückgängig
        </span>
      </div>
    </div>
  )
}

/* ── ImageCard ──────────────────────────────────────────────────────────── */
function ImageCard({ img, selected, markedDelete, rating, onSelect, onMarkDelete, onOpenFullscreen, onRating, onShowExif }) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  const thumb = thumbnailUrl(img.path, 400)

  const handleClick = (e) => {
    // Einfacher Klick = auswählen
    // Doppelklick = Vollbild (wird separat behandelt)
    if (e.detail === 1) {
      onSelect()
    }
  }

  return (
    <div
      className={`
        ${styles.imgCard}
        ${selected ? styles.imgSelected : ''}
        ${markedDelete ? styles.imgMarkedDelete : ''}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Bild – Klick = auswählen, Doppelklick = Vollbild */}
      <div
        className={styles.imgWrapper}
        onClick={handleClick}
        onDoubleClick={onOpenFullscreen}
      >
        {imgError ? (
          <div className={styles.imgError}>
            <span>?</span>
            <span className={styles.imgErrorName}>{img.name}</span>
          </div>
        ) : (
          <img
            src={thumb}
            alt={img.name}
            className={styles.img}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}

        {/* Hover-Overlay */}
        {hovered && !markedDelete && (
          <div className={styles.overlay}>
            <button
              className={styles.overlayBtn}
              onClick={(e) => { e.stopPropagation(); onOpenFullscreen() }}
              title="Vollbild"
            >⛶</button>
            <button
              className={styles.overlayBtn}
              onClick={(e) => { e.stopPropagation(); onShowExif() }}
              title="EXIF-Info"
            ><Info size={13} /></button>
          </div>
        )}

        {/* Löschen-Overlay */}
        {markedDelete && (
          <div className={styles.deleteOverlay}>
            <Trash2 size={28} />
            <span>Zum Löschen</span>
          </div>
        )}

        {/* Auswahl-Checkbox oben links */}
        <div
          className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`}
          onClick={(e) => { e.stopPropagation(); onSelect() }}
        >
          {selected && <X size={10} strokeWidth={3} />}
        </div>

        {/* RAW Badge oben rechts */}
        {img.is_raw && (
          <span className={styles.rawBadge}>
            {img.ext.replace('.', '').toUpperCase()}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className={styles.imgFooter}>
        <span className={styles.imgName}>{img.name}</span>
        <div className={styles.imgActions}>
          {/* Sterne */}
          <div className={styles.stars}>
            {[1,2,3,4,5].map(s => (
              <button
                key={s}
                className={`${styles.star} ${s <= rating ? styles.starFilled : ''}`}
                onClick={(e) => { e.stopPropagation(); onRating(s) }}
                title={`${s} Stern${s > 1 ? 'e' : ''}`}
              >★</button>
            ))}
          </div>
          {/* Löschen-Button */}
          <button
            className={`${styles.deleteBtn} ${markedDelete ? styles.deleteBtnActive : ''}`}
            onClick={(e) => { e.stopPropagation(); onMarkDelete() }}
            title="Zum Löschen markieren (X)"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
