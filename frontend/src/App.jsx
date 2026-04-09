import { useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useAppStore } from './stores/appStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSystemStats } from './hooks/useSystemStats'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import CardsView from './components/CardsView'
import CullingView from './components/CullingView'
import AiView from './components/AiView'
import NasView from './components/NasView'
import Fullscreen from './components/Fullscreen'
import styles from './styles/App.module.css'

export default function App() {
  const { theme, activeView, fullscreenImage } = useAppStore()

  // Theme beim Start anwenden
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useKeyboardShortcuts()
  useSystemStats()

  const views = {
    cards: <CardsView />,
    culling: <CullingView />,
    ai: <AiView />,
    nas: <NasView />,
  }

  return (
    <div className={styles.layout}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg-elevated)' } },
          error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg-elevated)' } },
        }}
      />
      <Sidebar />
      <div className={styles.main}>
        <TopBar />
        <div className={styles.content}>
          {views[activeView] || <CardsView />}
        </div>
      </div>
      {fullscreenImage && <Fullscreen />}
    </div>
  )
}
