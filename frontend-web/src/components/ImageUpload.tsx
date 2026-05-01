'use client'

import React, { useRef, useState } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { InfoTooltip } from './InfoTooltip'

interface Props {
  value: string | null | undefined  // URL ou data URL
  onUpload: (file: File) => Promise<void>  // callback — o pai faz o POST multipart
  onRemove?: () => Promise<void>
  maxSizeKB?: number
  recommendedSize?: string
  accept?: string
  className?: string
}

/**
 * Componente de upload de imagem com preview, drag-and-drop e validação.
 * Usado para logo do tenant (FR-V31-BRAND-002).
 */
export function ImageUpload({
  value,
  onUpload,
  onRemove,
  maxSizeKB = 200,
  recommendedSize = 'PNG, 300×100px recomendado',
  accept = 'image/png,image/jpeg,image/svg+xml,image/webp',
  className = ''
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    // Se accept for "image/*", permite qualquer image/...
    const accepted = accept.split(',').map(s => s.trim())
    const okType = accepted.includes(file.type) || accepted.some(a => a.endsWith('/*') && file.type.startsWith(a.replace('/*', '/')))
    if (!okType) {
      toast.error(`Formato não suportado: ${file.type}`)
      return
    }
    if (file.size > maxSizeKB * 1024) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      toast.error(`Arquivo muito grande (${mb}MB). Máximo ${maxSizeKB >= 1024 ? (maxSizeKB / 1024).toFixed(0) + 'MB' : maxSizeKB + 'KB'}.`)
      return
    }
    setUploading(true)
    try {
      await onUpload(file)
      toast.success('Logo enviada.')
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-slate-300">
          Logo <InfoTooltip text={`${recommendedSize}. Máximo ${maxSizeKB}KB. Formatos aceitos: PNG, JPG, SVG, WEBP.`} />
        </label>
        {value && onRemove && (
          <button
            type="button"
            onClick={async () => {
              if (!confirm('Remover a logo atual?')) return
              setUploading(true)
              try { await onRemove(); toast.success('Logo removida.') }
              catch (err: any) { toast.error(err.message) }
              finally { setUploading(false) }
            }}
            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Remover
          </button>
        )}
      </div>

      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${
          dragging ? 'border-indigo-400 bg-indigo-500/5' : 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        {uploading ? (
          <div className="flex items-center justify-center py-4 text-slate-400 text-sm">
            Enviando…
          </div>
        ) : value ? (
          <div className="flex items-center gap-3">
            <img
              src={value}
              alt="Logo atual"
              className="w-16 h-16 object-contain bg-white/5 rounded border border-white/10"
            />
            <div className="flex-1 text-xs text-slate-400">
              <p className="font-bold text-white mb-1">Logo atual</p>
              <p>Clique ou arraste para substituir</p>
            </div>
            <Upload className="w-4 h-4 text-slate-500" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-slate-400">
            <ImageIcon className="w-8 h-8 mb-2 text-slate-500" />
            <p className="text-sm font-medium">Clique ou arraste uma imagem</p>
            <p className="text-xs text-slate-500 mt-1">{recommendedSize} · máx {maxSizeKB}KB</p>
          </div>
        )}
      </div>
    </div>
  )
}
