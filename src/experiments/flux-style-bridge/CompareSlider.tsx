import { useState, useRef, useCallback, useEffect, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'

interface CompareSliderProps {
  imageA: string
  imageB: string
  labelA: string
  labelB: string
  style?: CSSProperties
  cover?: boolean
}

export default function CompareSlider({ imageA, imageB, labelA, labelB, style, cover }: CompareSliderProps) {
  const [position, setPosition] = useState(50)
  const [animating, setAnimating] = useState(false)
  const [hovering, setHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
  }, [])

  const startResetTimer = useCallback(() => {
    clearResetTimer()
    resetTimer.current = setTimeout(() => {
      setAnimating(true)
      setPosition(50)
    }, 1000)
  }, [clearResetTimer])

  useEffect(() => () => clearResetTimer(), [clearResetTimer])

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnimating(false)
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    setPosition((x / rect.width) * 100)
  }, [])

  // Desktop: hover moves the slider
  const onMouseMove = useCallback((e: ReactMouseEvent) => {
    clearResetTimer()
    updatePosition(e.clientX)
  }, [updatePosition, clearResetTimer])

  // Mobile: drag-based (pointerdown starts, pointermove updates)
  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    // Only capture for touch — let mouse clicks pass through
    if (e.pointerType !== 'mouse') {
      dragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      updatePosition(e.clientX)
    }
  }, [updatePosition])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragging.current) return
    updatePosition(e.clientX)
  }, [updatePosition])

  const onPointerUp = useCallback(() => {
    dragging.current = false
    startResetTimer()
  }, [startResetTimer])

  const labelStyle: CSSProperties = {
    position: 'absolute',
    top: 8,
    padding: '2px 8px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: '0.65rem',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderRadius: 4,
    pointerEvents: 'none',
    userSelect: 'none',
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseEnter={() => { setHovering(true); clearResetTimer() }}
      onMouseLeave={() => { setHovering(false); startResetTimer() }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        cursor: 'ew-resize',
        userSelect: 'none',
        touchAction: 'pan-y',
        ...style,
      }}
    >
      {/* Image B (full, background) */}
      {!cover && (
        <img
          src={imageB}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'blur(40px) brightness(0.5)',
            display: 'block',
          }}
        />
      )}
      <img
        src={imageB}
        alt={labelB}
        draggable={false}
        style={cover
          ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
          : { width: '100%', display: 'block', position: 'relative' }
        }
      />

      {/* Image A (clipped to slider position) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        clipPath: `inset(0 ${100 - position}% 0 0)`,
        transition: animating ? 'clip-path 0.6s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}>
        {/* Blurred fill for size mismatch */}
        {!cover && (
          <img
            src={imageA}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(40px) brightness(0.5)',
              display: 'block',
            }}
          />
        )}
        <img
          src={imageA}
          alt={labelA}
          draggable={false}
          style={cover
            ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
            : { width: '100%', display: 'block', position: 'relative' }
          }
        />
      </div>

      {/* Divider line */}
      <div style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${position}%`,
        width: 2,
        background: '#fff',
        transform: 'translateX(-1px)',
        pointerEvents: 'none',
        boxShadow: '0 0 4px rgba(0,0,0,0.5)',
        opacity: hovering || dragging.current ? 1 : 0.5,
        transition: animating ? 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s' : 'opacity 0.15s',
      }} />

      {/* Handle */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: `${position}%`,
        transform: 'translate(-50%, -50%)',
        width: 'min(32px, 10%)',
        height: 'min(32px, 10%)',
        minWidth: 20,
        minHeight: 20,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        opacity: hovering || dragging.current ? 1 : 0.5,
        transition: animating ? 'left 0.6s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s' : 'opacity 0.15s',
      }}>
        <svg width="60%" height="60%" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 8H12M4 8L6 6M4 8L6 10M12 8L10 6M12 8L10 10" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Labels */}
      <div style={{ ...labelStyle, left: 8 }}>{labelA}</div>
      <div style={{ ...labelStyle, right: 8 }}>{labelB}</div>
    </div>
  )
}
