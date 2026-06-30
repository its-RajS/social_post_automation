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

interface Props {
  onUploaded?: (docIds: string[]) => void
}

export function UploadZone({ onUploaded }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const handleFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((f) => {
        if (!ACCEPTED.includes(f.type)) return false
        if (f.size > 100 * 1024 * 1024) return false
        return true
      })
      const rejected = files.length - valid.length
      if (valid.length === 0) {
        setError('No supported files. Accepted: PDF, PPTX, DOCX, PNG, JPG, HTML (max 100MB each)')
        return
      }
      if (rejected > 0) {
        toast.warning(`${rejected} file(s) skipped — unsupported type or too large`)
      }

      setError(null)
      setState('uploading')
      setProgress({ done: 0, total: valid.length })

      const docIds: string[] = []
      for (let i = 0; i < valid.length; i++) {
        try {
          const res = await uploadDocument(valid[i])
          docIds.push(res.doc_id)
          setProgress({ done: i + 1, total: valid.length })
        } catch (err) {
          toast.error(`Failed to upload: ${valid[i].name}`)
        }
      }

      setState('idle')
      setSelectedFiles([])
      setProgress(null)

      if (docIds.length > 0) {
        toast.success(
          docIds.length === 1
            ? 'Upload complete. Pipeline auto-starting…'
            : `${docIds.length} files uploaded. Pipeline auto-starting…`,
        )
        if (onUploaded) {
          onUploaded(docIds)
        } else {
          router.push(`/documents/${docIds[0]}`)
        }
      }
    },
    [router, onUploaded],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setState('idle')
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) handleFiles(files)
    },
    [handleFiles],
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length > 0) setSelectedFiles(files)
    if (inputRef.current) inputRef.current.value = ''
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
          state === 'drag' && 'border-[#cb2eba] bg-[#fdf0fc]/30',
          state !== 'drag' && 'border-[#E9ECEF] hover:border-[#cb2eba]/50',
          error && 'border-[#DC2626]',
        )}
        aria-describedby="upload-constraints"
      >
        {state === 'uploading' ? (
          <>
            <Loader2 className="size-8 text-[#cb2eba] animate-spin" />
            <p className="text-sm font-medium text-[#212529]">
              {progress
                ? `Uploading ${progress.done + 1}/${progress.total}…`
                : 'Uploading…'}
            </p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-[#6C757D]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#212529]">
                Drop files or click to browse
              </p>
              <p id="upload-constraints" className="mt-1 text-xs text-[#6C757D]">
                PDF, PPTX, DOCX, PNG, JPG, HTML · Max 100MB · Multiple files OK
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
        multiple
        className="sr-only"
        onChange={onFileChange}
        disabled={state === 'uploading'}
      />

      {error && (
        <p className="mt-2 text-xs text-[#DC2626]" role="alert">
          {error}
        </p>
      )}

      {selectedFiles.length > 0 && state === 'idle' && (
        <div className="mt-4 rounded-lg border border-[#E9ECEF] bg-white p-3">
          <div className="mb-3 max-h-40 overflow-y-auto flex flex-col gap-1">
            {selectedFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded px-2 py-1 bg-[#F8F9FA]">
                <FileText className="size-3.5 shrink-0 text-[#6C757D]" />
                <span className="flex-1 truncate text-xs text-[#212529]">{f.name}</span>
                <span className="shrink-0 text-[10px] text-[#6C757D]">
                  {(f.size / 1024 / 1024).toFixed(1)}MB
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleFiles(selectedFiles)}
            className="w-full rounded-lg bg-[#cb2eba] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#b024a8] transition-colors"
          >
            Upload {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} & Process
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
