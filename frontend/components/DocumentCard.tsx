'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, FileText, ExternalLink, Loader2, Star } from 'lucide-react'
import { type DocumentSummary, getScoredPages, type ScoredPage } from '@/lib/api'
import { CopyButton } from './CopyButton'

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
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[status] ?? styles.pending}`}>
      {labels[status] ?? status}
    </span>
  )
}

const STAGE_ORDER = ['parsing', 'screenshots', 'chunking', 'embedding']
const STAGE_LABELS: Record<string, string> = {
  parsing: 'parse',
  screenshots: 'screenshots',
  chunking: 'chunks',
  embedding: 'embed',
}

function PipelineTrack({ stage, status }: { stage: string; status: string }) {
  const currentIdx = status === 'pending' ? -1 : STAGE_ORDER.indexOf(stage)

  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap">
      {STAGE_ORDER.map((id, i) => {
        const isDone = i < currentIdx || status === 'completed'
        const isActive = i === currentIdx && status === 'processing'
        return (
          <span key={id} className="flex items-center gap-1">
            <span
              className={[
                'rounded px-1.5 py-0.5 text-[10px] font-medium border',
                isDone
                  ? 'bg-[#D4EDDA] text-[#155724] border-[#C3E6CB]'
                  : isActive
                  ? 'bg-[#fdf0fc] text-[#cb2eba] border-[#d8bfd8] animate-pulse'
                  : 'bg-[#E9ECEF] text-[#ADB5BD] border-[#E9ECEF]',
              ].join(' ')}
            >
              {isDone ? `${STAGE_LABELS[id]} ✓` : STAGE_LABELS[id]}
            </span>
            {i < STAGE_ORDER.length - 1 && (
              <span className="text-[#ADB5BD] text-[10px]">→</span>
            )}
          </span>
        )
      })}
      <span className="text-[#ADB5BD] text-[10px] mx-0.5">·</span>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#E9ECEF] text-[#ADB5BD] border border-[#E9ECEF]">
        graph
      </span>
      <span className="text-[#ADB5BD] text-[10px]">→</span>
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#E9ECEF] text-[#ADB5BD] border border-[#E9ECEF]">
        score
      </span>
      <span className="ml-1 text-[9px] text-[#ADB5BD]">(auto)</span>
    </div>
  )
}

interface Props {
  doc: DocumentSummary
}

export function DocumentCard({ doc }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedPages, setSelectedPages] = useState<ScoredPage[] | null>(null)
  const [loadingPages, setLoadingPages] = useState(false)

  const isCompleted = doc.status === 'completed'
  const isProcessing = doc.status === 'processing'
  const isPending = doc.status === 'pending'

  const handleExpand = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && selectedPages === null && isCompleted) {
      setLoadingPages(true)
      try {
        const res = await getScoredPages(doc.id)
        setSelectedPages(res.pages.filter((p) => p.selected_for_post))
      } catch {
        setSelectedPages([])
      } finally {
        setLoadingPages(false)
      }
    }
  }

  return (
    <div className="rounded-xl border border-[#E9ECEF] bg-white shadow-sm overflow-hidden">
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <FileText className="mt-0.5 size-4 shrink-0 text-[#6C757D]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[#212529]">
              {doc.original_filename}
            </span>
            <StatusBadge status={doc.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#6C757D]">
            {doc.total_pages != null && <span>{doc.total_pages} pages</span>}
            {doc.chunks_count != null && <span>{doc.chunks_count} chunks</span>}
          </div>
          {/* Pipeline track — only while in-progress */}
          {(isProcessing || isPending) && (
            <PipelineTrack stage={doc.processing_stage} status={doc.status} />
          )}
          {/* Completed summary chips */}
          {isCompleted && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#D4EDDA] text-[#155724] border border-[#C3E6CB]">
                ingest ✓
              </span>
              <span className="text-[#ADB5BD] text-[10px]">→</span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#fdf0fc] text-[#cb2eba] border border-[#d8bfd8]">
                graph auto
              </span>
              <span className="text-[#ADB5BD] text-[10px]">→</span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#fdf0fc] text-[#cb2eba] border border-[#d8bfd8]">
                score auto
              </span>
            </div>
          )}
        </div>
        <Link
          href={`/documents/${doc.id}`}
          className="shrink-0 rounded-lg border border-[#E9ECEF] px-2.5 py-1 text-[11px] font-medium text-[#6C757D] hover:border-[#cb2eba] hover:text-[#cb2eba] transition-colors flex items-center gap-1"
        >
          Open <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Doc ID row */}
      <div className="border-t border-[#F8F9FA] px-4 py-1.5 flex items-center gap-2">
        <span className="text-[10px] text-[#ADB5BD]">ID</span>
        <code className="flex-1 truncate text-[10px] font-mono text-[#6C757D]">{doc.id}</code>
        <CopyButton value={doc.id} />
      </div>

      {/* Selected pages expandable */}
      {isCompleted && (
        <div className="border-t border-[#F8F9FA]">
          <button
            onClick={handleExpand}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] font-medium text-[#6C757D] hover:bg-[#F8F9FA] transition-colors"
          >
            {expanded ? (
              <ChevronDown className="size-3.5 text-[#cb2eba]" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <span>Selected pages for posts</span>
            {selectedPages != null && (
              <span className="ml-auto rounded-full bg-[#fdf0fc] px-2 py-0.5 text-[10px] font-medium text-[#cb2eba]">
                {selectedPages.length}
              </span>
            )}
          </button>

          {expanded && (
            <div className="border-t border-[#F8F9FA] bg-[#FAFAFA] px-4 pb-3 pt-2">
              {loadingPages ? (
                <div className="flex items-center gap-2 text-[11px] text-[#6C757D]">
                  <Loader2 className="size-3 animate-spin" />
                  Loading…
                </div>
              ) : selectedPages && selectedPages.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {selectedPages
                    .sort((a, b) => (b.post_potential_score ?? 0) - (a.post_potential_score ?? 0))
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded px-2 py-1.5 bg-white border border-[#d8bfd8]"
                      >
                        <Star className="size-3 shrink-0 fill-[#cb2eba] text-[#cb2eba]" />
                        <span className="w-7 text-center text-[10px] font-mono text-[#6C757D]">
                          p{p.page_number}
                        </span>
                        <span className="flex-1 truncate text-xs text-[#212529]">
                          {p.main_topic ?? 'Untitled'}
                        </span>
                        {p.content_type && (
                          <span className="shrink-0 rounded bg-[#fdf0fc] px-1.5 py-0.5 text-[10px] text-[#787496]">
                            {p.content_type.replace(/_/g, ' ')}
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] font-mono font-medium text-[#cb2eba]">
                          {p.post_potential_score?.toFixed(2) ?? '—'}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-[11px] text-[#6C757D]">
                  No pages selected yet.{' '}
                  <Link href={`/documents/${doc.id}`} className="text-[#cb2eba] hover:underline">
                    Run analysis →
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
