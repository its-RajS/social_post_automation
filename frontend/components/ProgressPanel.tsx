'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { getDocumentStatus, type StatusResponse } from '@/lib/api'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-[#FFF3CD] text-[#856404]',
    processing: 'bg-[#CCE5FF] text-[#004085]',
    completed: 'bg-[#D4EDDA] text-[#155724]',
    failed: 'bg-[#F8D7DA] text-[#721C24]',
  }
  const labels: Record<string, string> = {
    pending: 'Queued',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? styles.pending}`}>
      {labels[status] ?? status}
    </span>
  )
}

const STAGES = [
  { id: 'parsing',     label: 'Parse & extract',       m: 1 },
  { id: 'screenshots', label: 'Generate screenshots',  m: 1 },
  { id: 'chunking',    label: 'Chunk text',            m: 1 },
  { id: 'embedding',   label: 'Create embeddings',     m: 1 },
  { id: 'graph',       label: 'Build knowledge graph', m: 2 },
  { id: 'score',       label: 'Score pages',           m: 3 },
]

const M1_STAGE_IDS = ['parsing', 'screenshots', 'chunking', 'embedding']

type RowState = 'done' | 'active' | 'idle' | 'auto'

function StageRow({ label, state, isAuto }: { label: string; state: RowState; isAuto?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {state === 'done' && <CheckCircle2 className="size-3.5 shrink-0 text-[#16A34A]" />}
      {state === 'active' && (
        <span className="size-3.5 shrink-0 rounded-full border-2 border-[#cb2eba] animate-pulse block" />
      )}
      {(state === 'idle' || state === 'auto') && (
        <span className={`size-3.5 shrink-0 rounded-full border block ${state === 'auto' ? 'border-[#d8bfd8]' : 'border-[#ADB5BD]'}`} />
      )}
      <span className={['text-xs', state === 'done' && 'text-[#212529]', state === 'active' && 'font-medium text-[#cb2eba]', (state === 'idle' || state === 'auto') && 'text-[#ADB5BD]'].filter(Boolean).join(' ')}>
        {label}
        {isAuto && <span className="ml-1 text-[10px] text-[#d8bfd8]">(auto)</span>}
      </span>
    </div>
  )
}

function useElapsed(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  docId: string
  initialStatus?: StatusResponse
}

export function ProgressPanel({ docId, initialStatus }: Props) {
  const [status, setStatus] = useState<StatusResponse | null>(initialStatus ?? null)
  const [startedAt] = useState(() => new Date().toISOString())
  const elapsed = useElapsed(startedAt)

  useEffect(() => {
    if (status?.status === 'completed' || status?.status === 'failed') return

    const es = new EventSource(`/api/v1/${docId}/events`)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setStatus((prev) => ({
          ...(prev ?? ({} as StatusResponse)),
          doc_id: docId,
          status: data.status,
          progress: data.progress,
          created_at: prev?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
        if (data.status === 'completed' || data.status === 'failed') es.close()
      } catch {}
    }
    es.onerror = () => {
      es.close()
      getDocumentStatus(docId).then(setStatus).catch(() => {})
    }
    return () => es.close()
  }, [docId, status?.status])

  if (!status) return null

  const processingStage = status.progress?.processing_stage ?? 'pending'
  const docStatus = status.status
  const m1Idx = M1_STAGE_IDS.indexOf(processingStage)

  function stateFor(_stageId: string, stageIdx: number): RowState {
    if (stageIdx >= 4) return 'auto'
    if (docStatus === 'completed') return 'done'
    if (docStatus === 'failed' || docStatus === 'pending') return 'idle'
    if (stageIdx < m1Idx) return 'done'
    if (stageIdx === m1Idx) return 'active'
    return 'idle'
  }

  const activeStage = STAGES.find((s, i) => stateFor(s.id, i) === 'active')
  const activeLabel = activeStage?.label ?? (docStatus === 'completed' ? 'Complete' : 'Queued')

  const pages = status.progress?.total_pages ?? null
  const chunks = status.progress?.chunks_created ?? null

  return (
    <div className="rounded-xl border border-[#E9ECEF] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <StatusBadge status={docStatus} />
          </div>
          <p className="text-sm font-medium text-[#212529]">{activeLabel}</p>
        </div>
        {docStatus === 'processing' && (
          <span className="shrink-0 font-mono text-xs text-[#6C757D] tabular-nums">{elapsed}</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {STAGES.map((stage, i) => {
          const state = stateFor(stage.id, i)
          return (
            <div key={stage.id}>
              {i === 4 && <div className="my-1.5 border-t border-dashed border-[#E9ECEF]" />}
              <StageRow label={stage.label} state={state} isAuto={stage.m > 1} />
            </div>
          )
        })}
      </div>

      {(pages != null || chunks != null) && (
        <div className="mt-4 flex gap-3 border-t border-[#F8F9FA] pt-3">
          {pages != null && (
            <div className="text-center">
              <div className="text-sm font-semibold text-[#212529]">{pages}</div>
              <div className="text-[10px] text-[#6C757D]">pages</div>
            </div>
          )}
          {chunks != null && chunks > 0 && (
            <div className="text-center">
              <div className="text-sm font-semibold text-[#212529]">{chunks}</div>
              <div className="text-[10px] text-[#6C757D]">chunks</div>
            </div>
          )}
        </div>
      )}

      {docStatus === 'failed' && status.error_message && (
        <div className="mt-3 rounded-lg bg-[#F8D7DA] px-3 py-2 text-xs text-[#721C24]">
          {status.error_message}
        </div>
      )}
    </div>
  )
}
