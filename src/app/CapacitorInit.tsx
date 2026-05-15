'use client'

import { useEffect } from 'react'

export default function CapacitorInit() {
  useEffect(() => {
    import('@/lib/capacitor').then(m => m.initCapacitor())
  }, [])
  return null
}
