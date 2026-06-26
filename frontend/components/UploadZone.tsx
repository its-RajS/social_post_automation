'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Upload, FileText, FileImage, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadDocument } from '@/lib/api'
import { toast } from 'sonner'

const ACCEPTED = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/html',
]

const ACCEPT_ATTR = ACCEPTED.join(',')

type State = 'idle' | 'drag' | 'uploading'

export function UploadZone() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleUpload = useCallback(
    async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        setError(`Unsupported file type: ${file.type || file.name.split('.').pop()}`)
        return
      }
      if (file.size > 100 * 1024 * 1024) {
        setError('File exceeds 100MB limit')
        return
      }
      setError(null)
      setState('uploading')
      try {
        const res = await uploadDocument(file)
        toast.success('Upload complete. Processing started.')
        router.push(`/documents/${res.doc_id}`)
      } catch (err) {
        setState('idle')
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    },
    [router],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setState('idle')
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload],
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <label
        htmlFor="file-input"
        onDragOver={(e) => { e.preventDefault(); setState('drag') }}
        onDragLeave={() => setState('idle')}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer transition-colors',
          'bg-white',
          state === 'drag' && 'border-[#0EA5E9] bg-sky-50/40',
          state !== 'drag' && 'border-[#E9ECEF] hover:border-[#0EA5E9]/50',
          error && 'border-[#DC2626]',
        )}
        aria-describedby="upload-constraints"
      >
        {state === 'uploading' ? (
          <>
            <Loader2 className="size-8 text-[#0EA5E9] animate-spin" />
            <p className="text-sm font-medium text-[#212529]">Uploading…</p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-[#6C757D]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#212529]">
                Drop a file or click to browse
              </p>
              <p id="upload-constraints" className="mt-1 text-xs text-[#6C757D]">
                PDF, PPTX, DOCX, PNG, JPG, HTML · Max 100MB
              </p>
            </div>
          </>
        )}
      </label>

      <input
        ref={inputRef}
        id="file-input"
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={onFileChange}
        disabled={state === 'uploading'}
      />

      {error && (
        <p className="mt-2 text-xs text-[#DC2626]" role="alert">
          {error}
        </p>
      )}

      {selectedFile && state === 'idle' && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-[#E9ECEF] bg-white px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-[#6C757D]" />
            <span className="truncate text-sm text-[#212529]">{selectedFile.name}</span>
          </div>
          <button
            type="button"
            onClick={() => handleUpload(selectedFile)}
            className="ml-4 shrink-0 rounded-lg bg-[#0EA5E9] px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
          >
            Upload & Process
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-center gap-5" aria-hidden="true">
        {[FileText, FileImage, FileCode].map((Icon, i) => (
          <Icon key={i} className="size-5 text-[#6C757D]" />
        ))}
      </div>
    </div>
  )
}
