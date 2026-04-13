'use client'

import React, { useState } from 'react'
import { Info } from 'lucide-react'

interface InfoTooltipProps {
  text: string
  className?: string
}

export function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false)

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors" />
      {visible && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-slate-200 text-xs leading-relaxed rounded-lg shadow-xl border border-white/10 z-50 w-56 text-center pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-800" />
        </span>
      )}
    </span>
  )
}
