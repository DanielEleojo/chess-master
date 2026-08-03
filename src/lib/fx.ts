import { useEffect, useRef } from 'react'

let AC: AudioContext | null = null

export function beep(good: boolean): void {
  try {
    AC ??= new AudioContext()
    const o = AC.createOscillator()
    const g = AC.createGain()
    o.connect(g)
    g.connect(AC.destination)
    o.frequency.value = good ? 880 : 170
    g.gain.setValueAtTime(0.07, AC.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.15)
    o.start()
    o.stop(AC.currentTime + 0.16)
  } catch {
    /* no audio, no problem */
  }
}

export function shake(el: HTMLElement | null): void {
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
}

// setTimeout that dies with the component (mode switches cancel pending steps).
export function useLater(): (ms: number, fn: () => void) => void {
  const epoch = useRef(0)
  useEffect(() => () => void epoch.current++, [])
  return (ms, fn) => {
    const e = epoch.current
    setTimeout(() => {
      if (e === epoch.current) fn()
    }, ms)
  }
}
