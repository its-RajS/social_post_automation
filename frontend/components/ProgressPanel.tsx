'use client'

import { useState, useEffect } from 'react'
import { StatusBadge } from './StatusBadge'
import { Progress } from './ui/progress'
import { useSSE } from '@/hooks/useSSE'
import { useDocumentStatus } from '@/hooks/useDocumentStatus'
import type { StatusResponse } from '@/lib/api'

const STAGE_LABELS: Record<string, string> = {
  pending: 'Waiting to start…',
  processing: 'Parsing document…',
  embedding_complete: 'Embedding complete',
  failed: 'Processing failed',
}

interface Props {
  docId: string
  initial: StatusResponse
  filename?: string
}

export function ProgressPanel({ docId, initial, filename }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const { data, refetch } = useDocumentStatus(docId, initial)
  const status = data?.status ?? initial.status
  const progress = data?.progress ?? initial.progress
  const isTerminal = status === 'completed' || status === 'failed'

  useSSE({
    docId,
    enabled: !isTerminal,
    onUpdate: () => { refetch() },
    onDone: () => { refetch() },
  })

  useEffect(() => {
    if (isTerminal) return
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [isTerminal])

  const pct =
    progress.total_pages && progress.total_pages > 0
      ? Math.round((progress.screenshots_generated / progress.total_pages) * 100)
      : 0

  const stageLabel =
    STAGE_LABELS[progress.current_stage] ?? progress.current_stage

  return (
    <div className="flex flex-col gap-4">
      {filename && (
        <h2 className="text-lg font-semibold text-[#212529] truncate">{filename}</h2>
      )}

      <div className="flex items-center gap-2" aria-live="polite">
        <StatusBadge status={status} />
        {!isTerminal && (
          <span className="text-xs text-[#6C757D]">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {!isTerminal && (
        <>
          <p className="text-sm text-[#6C757D]">{stageLabel}</p>
          <Progress value={pct} className="h-1 bg-[#E9ECEF]" />
        </>
      )}

      <div className="flex gap-6 text-sm">
        <Stat label="Pages" value={progress.total_pages ?? '—'} />
        <Stat label="Chunks" value={progress.chunks_created || '—'} />
        {status === 'completed' && progress.current_stage && (
          <Stat label="Stage" value="Done" />
        )}
      </div>

      {status === 'failed' && data?.error_message && (
        <div className="rounded-lg border border-[#DC2626]/30 p-4">
          <p className="text-sm font-medium text-[#DC2626]">Processing failed</p>
          <p className="mt-1 text-sm text-[#6C757D]">{data.error_message}</p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-[#6C757D]">{label}</p>
      <p className="text-sm font-medium text-[#212529]">{value}</p>
    </div>
  )
}
