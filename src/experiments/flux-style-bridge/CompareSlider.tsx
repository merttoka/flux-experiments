import { useState, useRef, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'

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
  const [hovering, setHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    setPosition((x / rect.width) * 100)
  }, [])

  // Desktop: hover moves the slider
  const onMouseMove = useCallback((e: ReactMouseEvent) => {
    updatePosition(e.clientX)
  }, [updatePosition])

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
  }, [])

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
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
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
      <img
        src={imageB}
        alt={labelB}
        draggable={false}
        style={cover
          ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
          : { width: '100%', display: 'block' }
        }
      />

      {/* Image A (clipped to slider position) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        clipPath: `inset(0 ${100 - position}% 0 0)`,
      }}>
        <img
          src={imageA}
          alt={labelA}
          draggable={false}
          style={cover
            ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
            : { width: '100%', display: 'block' }
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
        transition: 'opacity 0.15s',
      }} />

      {/* Handle */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: `${position}%`,
        transform: 'translate(-50%, -50%)',
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        color: '#333',
        pointerEvents: 'none',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        opacity: hovering || dragging.current ? 1 : 0.5,
        transition: 'opacity 0.15s',
      }}>
        ↔
      </div>

      {/* Labels */}
      <div style={{ ...labelStyle, left: 8 }}>{labelA}</div>
      <div style={{ ...labelStyle, right: 8 }}>{labelB}</div>
    </div>
  )
}
