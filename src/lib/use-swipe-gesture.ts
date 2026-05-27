import { useRef, useState } from 'react'
import type React from 'react'

interface Options {
  /** Pixel distance that constitutes a completed swipe. Default: 72. */
  threshold?: number
  /** Fired when the user swipes right past the threshold. */
  onSwipeRight: () => void
  /** Fired when the user swipes left past the threshold. */
  onSwipeLeft: () => void
  /**
   * Fired when the touch ends with very little movement (dx < 10, dy < 12).
   * Use this as a tap/open callback on swipeable rows.
   */
  onTap?: () => void
  /**
   * When true, all touch tracking is suppressed.
   * Use for bulk-select mode where swipes should be disabled.
   */
  disabled?: boolean
}

export interface SwipeGestureResult {
  /** Raw horizontal displacement from touch start. Negative = left, positive = right. */
  deltaX: number
  /** Raw vertical displacement from touch start. */
  deltaY: number
  /** Whether a touch sequence is currently in progress. */
  tracking: boolean
  /** 0–1 progress toward the threshold — useful for animating reveal overlays. */
  swipeProgress: number
  /** Spread onto the swipeable container element. */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove:  (e: React.TouchEvent) => void
    onTouchEnd:   () => void
  }
}

/**
 * useSwipeGesture — shared swipe-to-action logic for delivery rows.
 *
 * Both the provider (SwipeableDeliveryRow) and rider (CustomerRow) use
 * identical swipe mechanics: diagonal guard (dx must exceed dy + 8px),
 * elastic drag (caller applies translateX(deltaX * 0.45)), green/orange
 * reveal overlays, and threshold-based commit.
 */
export function useSwipeGesture({
  threshold = 72,
  onSwipeRight,
  onSwipeLeft,
  onTap,
  disabled = false,
}: Options): SwipeGestureResult {
  const startX = useRef(0)
  const startY = useRef(0)
  const [deltaX, setDeltaX] = useState(0)
  const [deltaY, setDeltaY] = useState(0)
  const [tracking, setTracking] = useState(false)

  // Store latest deltas in refs so onTouchEnd always reads the committed value,
  // not a stale closure from when the handler was created.
  const deltaXRef = useRef(0)
  const deltaYRef = useRef(0)

  const swipeProgress = Math.min(Math.abs(deltaX) / threshold, 1)

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    setTracking(true)
    setDeltaX(0)
    setDeltaY(0)
    deltaXRef.current = 0
    deltaYRef.current = 0
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!tracking || disabled) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    deltaYRef.current = dy
    setDeltaY(dy)
    // Diagonal guard: only track horizontal swipe if dx clearly dominates dy.
    // This prevents accidental swipes when the user is scrolling vertically.
    if (Math.abs(dx) > Math.abs(dy) + 8) {
      deltaXRef.current = dx
      setDeltaX(dx)
    }
  }

  function onTouchEnd() {
    if (!tracking) return
    setTracking(false)
    const dx = deltaXRef.current
    const dy = deltaYRef.current
    setDeltaX(0)
    setDeltaY(0)
    deltaXRef.current = 0
    deltaYRef.current = 0

    if (dx > threshold) onSwipeRight()
    else if (dx < -threshold) onSwipeLeft()
    else if (onTap && Math.abs(dx) < 10 && Math.abs(dy) < 12) onTap()
  }

  return {
    deltaX,
    deltaY,
    tracking,
    swipeProgress,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
