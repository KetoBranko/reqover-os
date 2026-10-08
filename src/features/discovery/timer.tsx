'use client'

import { useEffect, useState } from 'react'

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Elapsed time since the conversation started (server timestamp, so reloads keep counting). */
export function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const id = setInterval(tick, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [])
  return (
    <span className="tabular text-lg font-medium" aria-label="Gesprächsdauer" role="timer">
      {now == null ? '00:00' : fmt((now - new Date(startedAt).getTime()) / 1000)}
    </span>
  )
}
