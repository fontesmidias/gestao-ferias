'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
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
  const tooltipRef = useRef<HTMLSpanElement>(null)

  const updatePosition = useCallback(() => {
    if (!iconRef.current) return

    const rect = iconRef.current.getBoundingClientRect()
    const tooltipW = 240
    // Estimate height based on text length (more accurate than fixed 80)
    const charsPerLine = 35
    const lines = Math.ceil(text.length / charsPerLine)
    const tooltipH = Math.max(40, lines * 18 + 20)

    let top = rect.top - tooltipH - 8
    let left = rect.left + rect.width / 2 - tooltipW / 2

    // If overflows top, show below
    if (top < 8) {
      top = rect.bottom + 8
    }
    // If overflows bottom too, just center vertically
    if (top + tooltipH > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight / 2 - tooltipH / 2)
    }
    // Clamp horizontal
    if (left + tooltipW > window.innerWidth - 8) {
      left = window.innerWidth - tooltipW - 8
    }
    if (left < 8) left = 8

    setCoords({ top, left })
  }, [text])

  useEffect(() => {
    if (visible) updatePosition()
  }, [visible, updatePosition])

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
          ref={tooltipRef}
          style={{ top: coords.top, left: coords.left, maxWidth: 240 }}
          className="fixed px-3 py-2 bg-slate-900 text-slate-200 text-xs leading-relaxed rounded-lg shadow-2xl border border-white/10 z-[9999] text-center pointer-events-none animate-in fade-in duration-100"
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  )
}
