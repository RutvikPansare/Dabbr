'use client'

import { useRouter } from 'next/navigation'

interface Props {
  fallback?: string
  className?: string
  children: React.ReactNode
}

/**
 * Navigates back in browser history (router.back()).
 * Falls back to `fallback` href if there's no history to go back to.
 */
export default function BackButton({ fallback = '/login', className, children }: Props) {
  const router = useRouter()

  function handleClick() {
    // If there's history to go back to, use it; otherwise go to the fallback.
    if (window.history.length > 1) {
      router.back()
    } else {
      router.replace(fallback)
    }
  }

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  )
}
