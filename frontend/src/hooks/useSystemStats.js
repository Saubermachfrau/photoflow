import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { getSystemStats, getNasStatus } from '../api/client'

export function useSystemStats(interval = 5000) {
  const { setSystemStats, setNasStatus } = useAppStore()

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [stats, nas] = await Promise.all([getSystemStats(), getNasStatus()])
        setSystemStats(stats)
        setNasStatus(nas)
      } catch {}
    }
    fetchAll()
    const id = setInterval(fetchAll, interval)
    return () => clearInterval(id)
  }, [interval])
}
