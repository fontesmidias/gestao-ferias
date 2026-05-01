'use client'

import React, { useState, forwardRef } from 'react'

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  className?: string
}

/**
 * Input de senha com toggle macaquinho (🙈 oculto / 🐵 visível).
 * Padrão do projeto (FR-V31-PWD-002).
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = '', ...props }, ref) => {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        <input
          ref={ref}
          {...props}
          type={visible ? 'text' : 'password'}
          className={`pr-10 ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-base leading-none focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded select-none"
          tabIndex={0}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <span aria-hidden>{visible ? '🐵' : '🙈'}</span>
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
