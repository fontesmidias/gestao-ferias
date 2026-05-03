'use client'

import { useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_BYTES = 10 * 1024 * 1024

export interface ImportDropzoneProps {
  disabled?: boolean
  uploading?: boolean
  uploadProgress?: number
  externalError?: string
  onFile: (file: File) => void | Promise<void>
}

export function ImportDropzone({
  disabled = false,
  uploading = false,
  uploadProgress = 0,
  externalError,
  onFile,
}: ImportDropzoneProps) {
  const [localError, setLocalError] = useState<string | undefined>()

  const error = externalError ?? localError

  function handleDropAccepted(files: File[]) {
    setLocalError(undefined)
    const file = files[0]
    if (!file) return
    void onFile(file)
  }

  function handleDropRejected(rejections: FileRejection[]) {
    const r = rejections[0]
    if (!r) return
    const code = r.errors[0]?.code
    let msg: string
    if (code === 'file-too-large') {
      msg = 'Tamanho máximo 10MB.'
    } else if (code === 'file-invalid-type') {
      msg = 'Arquivo deve ser .xlsx.'
    } else {
      msg = r.errors[0]?.message ?? 'Arquivo inválido.'
    }
    setLocalError(msg)
    toast.error(msg)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { [XLSX_MIME]: ['.xlsx'] },
    maxSize: MAX_BYTES,
    multiple: false,
    disabled: disabled || uploading,
    onDropAccepted: handleDropAccepted,
    onDropRejected: handleDropRejected,
  })

  const baseClasses =
    'border-2 rounded-xl p-8 text-center transition-all flex flex-col items-center justify-center gap-2'

  let stateClasses = 'border-dashed border-slate-600 bg-slate-800/40 text-slate-300'
  if (disabled) {
    stateClasses = 'border-dashed border-slate-700 bg-slate-800/20 text-slate-500 cursor-not-allowed opacity-60'
  } else if (uploading) {
    stateClasses = 'border-solid border-blue-500 bg-blue-500/5 text-slate-200 cursor-wait'
  } else if (isDragActive) {
    stateClasses = 'border-solid border-blue-500 bg-blue-500/10 text-white scale-[1.01]'
  } else if (error) {
    stateClasses = 'border-dashed border-red-500 bg-red-500/5 text-red-200'
  }

  const focusClasses =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'

  const rootProps = getRootProps()

  return (
    <div className="space-y-2">
      <div {...rootProps} className={`${baseClasses} ${stateClasses} ${focusClasses}`}>
        <input {...getInputProps()} aria-label="Selecionar arquivo .xlsx" />
        {uploading ? (
          <>
            <Upload className="w-8 h-8 text-blue-400" aria-hidden="true" />
            <div className="text-sm font-medium">Enviando arquivo… {uploadProgress}%</div>
            <progress
              className="w-full max-w-sm h-2 mt-2 [&::-webkit-progress-bar]:bg-slate-700 [&::-webkit-progress-value]:bg-blue-500"
              value={uploadProgress}
              max={100}
              aria-label="Progresso do upload"
            />
          </>
        ) : disabled ? (
          <>
            <Upload className="w-8 h-8" aria-hidden="true" />
            <div className="text-sm">Selecione o tenant alvo primeiro</div>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-slate-400" aria-hidden="true" />
            <div className="text-sm font-medium">
              Arraste o arquivo aqui ou clique para selecionar
            </div>
            <div className="text-xs text-slate-500">Apenas .xlsx, até 10 MB</div>
          </>
        )}
      </div>
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}
