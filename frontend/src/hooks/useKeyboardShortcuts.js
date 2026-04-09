import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

export function useKeyboardShortcuts() {
  const {
    images, fullscreenImage, fullscreenIndex,
    openFullscreen, closeFullscreen,
    toggleDelete, undoDelete, markedForDelete,
    selectAll, clearSelection,
    activeView,
  } = useAppStore()

  useEffect(() => {
    const handler = (e) => {
      // Eingabefelder ignorieren
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return

      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey

      // Vollbild-Navigation
      if (fullscreenImage) {
        if (key === 'arrowright' || key === 'arrowdown') {
          e.preventDefault()
          const next = Math.min(fullscreenIndex + 1, images.length - 1)
          openFullscreen(images[next]?.path, next)
        }
        if (key === 'arrowleft' || key === 'arrowup') {
          e.preventDefault()
          const prev = Math.max(fullscreenIndex - 1, 0)
          openFullscreen(images[prev]?.path, prev)
        }
        if (key === 'escape' || key === 'f') closeFullscreen()
        if (key === 'delete' || key === 'x') {
          if (fullscreenImage) toggleDelete(fullscreenImage)
        }
        return
      }

      // Global shortcuts
      if (ctrl && key === 'a') { e.preventDefault(); selectAll() }
      if (ctrl && key === 'z') { e.preventDefault(); undoDelete() }
      if (key === 'escape') clearSelection()

      // Culling-View shortcuts
      if (activeView === 'culling') {
        if (key === 'f') {
          const first = images[0]
          if (first) openFullscreen(first.path, 0)
        }
        if (key === ' ') { e.preventDefault() }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreenImage, fullscreenIndex, images, activeView])
}
