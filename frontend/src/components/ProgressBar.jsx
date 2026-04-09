import styles from './ProgressBar.module.css'

export default function ProgressBar({ progress = 0, label, sub, color = 'var(--accent)', eta, speed }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <span className={styles.percent}>{Math.round(progress)}%</span>
      </div>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${Math.min(progress, 100)}%`, background: color }}
        />
      </div>
      <div className={styles.subRow}>
        {sub && <span className={styles.sub}>{sub}</span>}
        <div className={styles.right}>
          {speed && <span className={styles.speed}>{speed}</span>}
          {eta && <span className={styles.eta}>{eta}</span>}
        </div>
      </div>
    </div>
  )
}
