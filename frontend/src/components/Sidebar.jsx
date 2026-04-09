import { useAppStore } from '../stores/appStore'
import styles from './Sidebar.module.css'
import {
  CreditCard, Grid3X3, Cpu, HardDrive,
  Sun, Moon, Minus, Camera
} from 'lucide-react'

const THEMES = [
  { id: 'dark',     label: 'Dark',     icon: '●' },
  { id: 'light',    label: 'Light',    icon: '○' },
  { id: 'dim',      label: 'Dim',      icon: '◑' },
  { id: 'darkroom', label: 'Darkroom', icon: '◆' },
]

const NAV = [
  { id: 'cards',   label: 'Karten',   icon: CreditCard, desc: 'Mounten & Kopieren' },
  { id: 'culling', label: 'Culling',  icon: Grid3X3,    desc: 'Bilder sichten' },
  { id: 'ai',      label: 'KI',       icon: Cpu,        desc: 'Analyse & Tags' },
  { id: 'nas',     label: 'NAS',      icon: HardDrive,  desc: 'Sichern' },
]

export default function Sidebar() {
  const { activeView, setActiveView, theme, setTheme, systemStats, nasStatus } = useAppStore()

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <Camera size={20} strokeWidth={1.5} />
        <span className={styles.logoText}>Photo<strong>Flow</strong></span>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {NAV.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            className={`${styles.navItem} ${activeView === id ? styles.active : ''}`}
            onClick={() => setActiveView(id)}
            title={desc}
          >
            <Icon size={18} strokeWidth={1.5} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.spacer} />

      {/* System Stats */}
      {systemStats && (
        <div className={styles.statsPanel}>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>CPU</span>
            <div className={styles.statBar}>
              <div
                className={styles.statFill}
                style={{
                  width: `${systemStats.cpu_percent}%`,
                  background: systemStats.cpu_percent > 80 ? 'var(--red)' : 'var(--accent)'
                }}
              />
            </div>
            <span className={styles.statVal}>{systemStats.cpu_percent}%</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>RAM</span>
            <div className={styles.statBar}>
              <div
                className={styles.statFill}
                style={{
                  width: `${systemStats.ram.percent}%`,
                  background: systemStats.ram.percent > 80 ? 'var(--yellow)' : 'var(--green)'
                }}
              />
            </div>
            <span className={styles.statVal}>{systemStats.ram.percent}%</span>
          </div>
          {systemStats.cpu_temp && (
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Temp</span>
              <div className={styles.statBar}>
                <div
                  className={styles.statFill}
                  style={{
                    width: `${Math.min((systemStats.cpu_temp / 100) * 100, 100)}%`,
                    background: systemStats.cpu_temp > 75 ? 'var(--red)' : 'var(--accent)'
                  }}
                />
              </div>
              <span className={styles.statVal}>{systemStats.cpu_temp}°</span>
            </div>
          )}
          {/* NAS Indikator */}
          <div className={styles.nasIndicator}>
            <span
              className={styles.nasDot}
              style={{ background: nasStatus?.mounted ? 'var(--green)' : 'var(--text-muted)' }}
            />
            <span className={styles.nasLabel}>
              NAS {nasStatus?.mounted ? (nasStatus.free_space_human ? `· ${nasStatus.free_space_human}` : '· verbunden') : '· getrennt'}
            </span>
          </div>
        </div>
      )}

      {/* Themes */}
      <div className={styles.themeSection}>
        <span className={styles.themeLabel}>Theme</span>
        <div className={styles.themes}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`${styles.themeBtn} ${theme === t.id ? styles.themeActive : ''}`}
              onClick={() => setTheme(t.id)}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
