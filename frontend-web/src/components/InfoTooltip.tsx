'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

interface InfoTooltipProps {
  text: string
  className?: string
}

export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const iconRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (visible && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      const tooltipW = 224 // w-56 = 14rem = 224px
      const tooltipH = 80  // estimated max height

      // Default: above and centered
      let top = rect.top - tooltipH - 4
      let left = rect.left + rect.width / 2 - tooltipW / 2

      // If overflows top, show below
      if (top < 8) {
        top = rect.bottom + 8
      }
      // If overflows right
      if (left + tooltipW > window.innerWidth - 8) {
        left = window.innerWidth - tooltipW - 8
      }
      // If overflows left
      if (left < 8) {
        left = 8
      }

      setCoords({ top, left })
    }
  }, [visible])

  return (
    <span
      ref={iconRef}
      className={`inline-flex items-center ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" />
      {visible && typeof window !== 'undefined' && createPortal(
        <span
          style={{ top: coords.top, left: coords.left }}
          className="fixed px-3 py-2 bg-slate-800 text-slate-200 text-xs leading-relaxed rounded-lg shadow-2xl border border-white/10 z-[9999] w-56 text-center pointer-events-none animate-in fade-in duration-150"
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}
