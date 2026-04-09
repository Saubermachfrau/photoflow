import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { useAppStore } from '../stores/appStore'
import { listImages, deleteImages, updateTags, thumbnailUrl } from '../api/client'
import {
  Trash2, Star, ChevronRight, ChevronDown,
  FolderOpen, LayoutGrid, Rows, Info, RotateCcw
} from 'lucide-react'
import ExifPanel from './ExifPanel'
import styles from './CullingView.module.css'

const GRID_SIZES = [
  { id: 'lg', label: 'Groß', cols: 2 },
  { id: 'md', label: 'Mittel', cols: 3 },
  { id: 'sm', label: 'Klein', cols: 4 },
  { id: 'xs', label: 'Übersicht', cols: 6 },
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

  useEffect(() => {
    loadImages(currentFolder)
  }, [currentFolder])

  const handleDeleteMarked = async () => {
    const toDelete = [...markedForDelete]
    if (!toDelete.length) return toast.error('Keine Bilder markiert')

    try {
      await deleteImages(toDelete)
      toast.success(`${toDelete.length} Bilder in Papierkorb verschoben`)
      // Aus UI entfernen
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
    try {
      await updateTags(path, [], rating)
    } catch {}
  }

  const filteredImages = filterRating > 0
    ? images.filter(img => (imageRatings[img.path] || 0) >= filterRating)
    : images

  const cols = GRID_SIZES.find(g => g.id === gridSize)?.cols || 3

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* Ordner-Navigation */}
          {folders.length > 0 && (
            <div className={styles.folderNav}>
              <button
                className={`${styles.folderBtn} ${currentFolder === '' ? styles.folderActive : ''}`}
                onClick={() => setCurrentFolder('')}
              >
                Alle
              </button>
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

          {/* Rating-Filter */}
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

        <div className={styles.toolbarRight}>
          {/* Grid-Größe */}
          <div className={styles.gridSizeGroup}>
            {GRID_SIZES.map(g => (
              <button
                key={g.id}
                className={`${styles.gridSizeBtn} ${gridSize === g.id ? styles.gridSizeActive : ''}`}
                onClick={() => setGridSize(g.id)}
                title={g.label}
              >
                {g.id === 'lg' ? '⬛' : g.id === 'md' ? '▪▪' : g.id === 'sm' ? '▫▫▫' : '···'}
              </button>
            ))}
          </div>

          {markedForDelete.size > 0 && (
            <>
              <button className={styles.undoBtn} onClick={undoDelete} title="Letztes rückgängig (Ctrl+Z)">
                <RotateCcw size={14} />
              </button>
              <button className={styles.deleteMarkedBtn} onClick={handleDeleteMarked}>
                <Trash2 size={14} />
                {markedForDelete.size} löschen
              </button>
            </>
          )}
          {selectedImages.size > 0 && (
            <button className={styles.deleteSelectedBtn} onClick={handleDeleteSelected}>
              <Trash2 size={14} />
              Auswahl löschen
            </button>
          )}
          <button
            className={styles.selectAllBtn}
            onClick={selectedImages.size > 0 ? clearSelection : selectAll}
          >
            {selectedImages.size > 0 ? 'Auswahl aufheben' : 'Alle auswählen'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Grid */}
        <div className={styles.gridArea}>
          {loading ? (
            <div className={styles.loadingGrid} style={{ '--cols': cols }}>
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

      {/* Status Bar */}
      <div className={styles.statusBar}>
        <span>{filteredImages.length} Bilder</span>
        {selectedImages.size > 0 && <span>· {selectedImages.size} ausgewählt</span>}
        {markedForDelete.size > 0 && (
          <span style={{ color: 'var(--red)' }}>· {markedForDelete.size} zum Löschen</span>
        )}
        <span className={styles.shortcutHint}>F = Vollbild · X/Del = Löschen · 1-5 = Bewertung · Ctrl+Z = Rückgängig</span>
      </div>
    </div>
  )
}

function ImageCard({ img, index, selected, markedDelete, rating, onSelect, onMarkDelete, onOpenFullscreen, onRating, onShowExif }) {
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  const thumb = thumbnailUrl(img.path, 400)

  return (
    <div
      className={`
        ${styles.imgCard}
        ${selected ? styles.imgSelected : ''}
        ${markedDelete ? styles.imgMarkedDelete : ''}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onOpenFullscreen}
    >
      {/* Bild */}
      <div className={styles.imgWrapper}>
        {imgError ? (
          <div className={styles.imgError}>?</div>
        ) : (
          <img
            src={thumb}
            alt={img.name}
            className={styles.img}
            loading="lazy"
            onError={() => setImgError(true)}
            onClick={onSelect}
          />
        )}

        {/* Overlay bei Hover */}
        {hovered && (
          <div className={styles.overlay}>
            <button className={styles.overlayBtn} onClick={onOpenFullscreen} title="Vollbild (F)">
              ⛶
            </button>
            <button className={styles.overlayBtn} onClick={onShowExif} title="EXIF-Info (I)">
              <Info size={13} />
            </button>
          </div>
        )}

        {/* Delete Markierung */}
        {markedDelete && (
          <div className={styles.deleteOverlay}>
            <Trash2 size={24} />
          </div>
        )}

        {/* Auswahl Checkbox */}
        <div
          className={`${styles.checkbox} ${selected ? styles.checkboxChecked : ''}`}
          onClick={(e) => { e.stopPropagation(); onSelect() }}
        >
          {selected && '✓'}
        </div>

        {/* RAW Badge */}
        {img.is_raw && (
          <span className={styles.rawBadge}>{img.ext.replace('.', '').toUpperCase()}</span>
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
              >
                ★
              </button>
            ))}
          </div>
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
