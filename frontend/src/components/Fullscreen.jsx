import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { thumbnailUrl } from '../api/client'
import { X, ChevronLeft, ChevronRight, Trash2, Star, Info } from 'lucide-react'
import ExifPanel from './ExifPanel'
import styles from './Fullscreen.module.css'

export default function Fullscreen() {
  const {
    fullscreenImage, fullscreenIndex, images,
    closeFullscreen, openFullscreen,
    markedForDelete, toggleDelete,
    imageRatings, setRating,
  } = useAppStore()

  const [showExif, setShowExif] = useState(false)

  const prev = () => {
    const idx = Math.max(fullscreenIndex - 1, 0)
    openFullscreen(images[idx]?.path, idx)
  }
  const next = () => {
    const idx = Math.min(fullscreenIndex + 1, images.length - 1)
    openFullscreen(images[idx]?.path, idx)
  }

  const isDeleted = markedForDelete.has(fullscreenImage)
  const rating = imageRatings[fullscreenImage] || 0
  const currentImg = images[fullscreenIndex]

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') closeFullscreen()
      if (e.key === 'Delete' || e.key === 'x' || e.key === 'X') toggleDelete(fullscreenImage)
      if (e.key === 'i' || e.key === 'I') setShowExif(s => !s)
      if (['1','2','3','4','5'].includes(e.key)) setRating(fullscreenImage, parseInt(e.key))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreenIndex, fullscreenImage])

  return (
    <div className={styles.overlay} onClick={closeFullscreen}>
      {/* Controls top */}
      <div className={styles.topBar} onClick={e => e.stopPropagation()}>
        <span className={styles.counter}>{fullscreenIndex + 1} / {images.length}</span>
        <span className={styles.filename}>{currentImg?.name}</span>
        <div className={styles.topActions}>
          {/* Rating */}
          <div className={styles.stars}>
            {[1,2,3,4,5].map(s => (
              <button
                key={s}
                className={`${styles.star} ${s <= rating ? styles.starOn : ''}`}
                onClick={() => setRating(fullscreenImage, s)}
              >★</button>
            ))}
          </div>
          <button
            className={`${styles.actionBtn} ${isDeleted ? styles.actionBtnRed : ''}`}
            onClick={() => toggleDelete(fullscreenImage)}
            title="Löschen markieren (X)"
          >
            <Trash2 size={16} />
          </button>
          <button
            className={`${styles.actionBtn} ${showExif ? styles.actionBtnActive : ''}`}
            onClick={() => setShowExif(s => !s)}
            title="EXIF-Info (I)"
          >
            <Info size={16} />
          </button>
          <button className={styles.closeBtn} onClick={closeFullscreen} title="Schließen (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Bild */}
      <div className={styles.imageArea} onClick={e => e.stopPropagation()}>
        <button
          className={`${styles.navBtn} ${styles.navLeft}`}
          onClick={prev}
          disabled={fullscreenIndex === 0}
        >
          <ChevronLeft size={24} />
        </button>

        <div className={styles.imageContainer}>
          <img
            key={fullscreenImage}
            src={thumbnailUrl(fullscreenImage, 1600)}
            alt={currentImg?.name}
            className={`${styles.image} ${isDeleted ? styles.imageDeleted : ''}`}
          />
          {isDeleted && (
            <div className={styles.deleteIndicator}>
              <Trash2 size={32} />
              <span>Zum Löschen markiert</span>
            </div>
          )}
        </div>

        <button
          className={`${styles.navBtn} ${styles.navRight}`}
          onClick={next}
          disabled={fullscreenIndex >= images.length - 1}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* EXIF Side Panel */}
      {showExif && (
        <div className={styles.exifSide} onClick={e => e.stopPropagation()}>
          <ExifPanel path={fullscreenImage} onClose={() => setShowExif(false)} inline />
        </div>
      )}

      {/* Film strip */}
      <div className={styles.filmstrip} onClick={e => e.stopPropagation()}>
        {images.map((img, idx) => (
          <div
            key={img.path}
            className={`${styles.filmItem} ${idx === fullscreenIndex ? styles.filmActive : ''} ${markedForDelete.has(img.path) ? styles.filmDeleted : ''}`}
            onClick={() => openFullscreen(img.path, idx)}
          >
            <img src={thumbnailUrl(img.path, 120)} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  )
}
