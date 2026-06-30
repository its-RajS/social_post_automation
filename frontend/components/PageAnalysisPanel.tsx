'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, BarChart3, Star } from 'lucide-react'
import {
  analyzePages,
  getAnalysisJobStatus,
  getScoredPages,
  getLatestAnalysisJob,
  type ScoredPage,
} from '@/lib/api'

function scoreColor(score: number): string {
  if (score >= 0.45) return '#cb2eba'
  if (score >= 0.3) return '#787496'
  return '#ADB5BD'
}

function ScoreBar({ score }: { score: number | null }) {
  const pct = score != null ? Math.round(score * 100) : 0
  const color = score != null ? scoreColor(score) : '#E9ECEF'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="relative h-1.5 w-16 rounded-full bg-[#E9ECEF] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="text-[11px] font-mono font-medium tabular-nums"
        style={{ color: score != null ? color : '#ADB5BD' }}
      >
        {score != null ? score.toFixed(2) : '—'}
      </span>
    </div>
  )
}

function ContentTypePill({ type }: { type: string | null }) {
  if (!type) return null
  const MAP: Record<string, string> = {
    stat: 'bg-[#fff7ed] text-[#EA580C]',
    insight: 'bg-[#eff6ff] text-[#2563EB]',
    case_study: 'bg-[#f0fdf4] text-[#15803D]',
    workflow: 'bg-[#f0eeff] text-[#787496]',
    product_education: 'bg-[#fdf0fc] text-[#cb2eba]',
    announcement: 'bg-[#ecfdf5] text-[#16A34A]',
    quote: 'bg-[#fafaf9] text-[#57534E]',
    other: 'bg-[#F8F9FA] text-[#6C757D]',
  }
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${MAP[type] ?? MAP.other}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

interface Props {
  docId: string
  enabled: boolean
}

type JobState = 'checking' | 'idle' | 'queued' | 'processing' | 'completed' | 'failed'

export function PageAnalysisPanel({ docId, enabled }: Props) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobState, setJobState] = useState<JobState>('checking')
  const [pages, setPages] = useState<ScoredPage[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadPages = useCallback(async () => {
    try {
      const res = await getScoredPages(docId)
      const scored = res.pages.filter((p) => p.analysis_status === 'analyzed')
      if (scored.length > 0) {
        setPages(res.pages)
        setJobState('completed')
        return true
      }
    } catch {
      // no analysis yet
    }
    return false
  }, [docId])

  const triggerAnalysis = useCallback(async () => {
    setError(null)
    setJobState('queued')
    try {
      const res = await analyzePages(docId)
      setJobId(res.job_id)
    } catch (e) {
      setJobState('failed')
      setError(e instanceof Error ? e.message : 'Failed to start analysis')
    }
  }, [docId])

  // On mount: find existing job or auto-trigger
  useEffect(() => {
    if (!enabled) return

    async function init() {
      try {
        const latest = await getLatestAnalysisJob(docId)
        if (latest.job_id && latest.status !== 'none') {
          if (latest.status === 'completed') {
            await loadPages()
          } else if (latest.status === 'queued' || latest.status === 'processing') {
            setJobId(latest.job_id)
            setJobState(latest.status)
          } else if (latest.status === 'failed') {
            setJobState('failed')
            setError(latest.error ?? 'Analysis failed')
          }
          return
        }
      } catch {
        // fallback
      }
      const hasPages = await loadPages()
      if (!hasPages) {
        await triggerAnalysis()
      }
    }

    init()
  }, [enabled, docId, loadPages, triggerAnalysis])

  // Poll while running
  useEffect(() => {
    if (!jobId || jobState === 'completed' || jobState === 'failed') return
    const interval = setInterval(async () => {
      try {
        const s = await getAnalysisJobStatus(jobId)
        setJobState(s.status as JobState)
        if (s.status === 'completed') {
          clearInterval(interval)
          const res = await getScoredPages(docId)
          setPages(res.pages)
        } else if (s.status === 'failed') {
          clearInterval(interval)
          setError(s.error ?? 'Analysis failed')
        }
      } catch {
        // transient
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [jobId, jobState, docId])

  const isActive = jobState === 'queued' || jobState === 'processing'
  const sorted = [...pages].sort((a, b) => (b.post_potential_score ?? -1) - (a.post_potential_score ?? -1))
  const selected = pages.filter((p) => p.selected_for_post)
  const rejected = pages.filter((p) => p.analysis_status === 'analyzed' && p.post_potential_score === 0)
  const scored = pages.filter((p) => p.analysis_status === 'analyzed' && (p.post_potential_score ?? 0) > 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[#cb2eba]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6C757D]">
            Page Analysis
          </span>
          {jobState === 'completed' && (
            <span className="rounded-full bg-[#fdf0fc] px-2 py-0.5 text-xs font-medium text-[#cb2eba]">
              {selected.length} selected
            </span>
          )}
        </div>

        {(jobState === 'checking' || isActive) && (
          <div className="flex items-center gap-1.5 text-xs text-[#6C757D]">
            <Loader2 className="size-3.5 animate-spin text-[#cb2eba]" />
            {jobState === 'checking'
              ? 'Checking…'
              : jobState === 'queued'
              ? 'Queued…'
              : 'Scoring pages…'}
          </div>
        )}

        {jobState === 'completed' && (
          <button
            onClick={triggerAnalysis}
            className="text-xs text-[#6C757D] hover:text-[#212529] transition-colors"
          >
            Re-analyze
          </button>
        )}
      </div>

      {!enabled && (
        <div className="rounded-xl border border-[#E9ECEF] px-6 py-8 text-center">
          <p className="text-sm text-[#6C757D]">
            Finish document processing to analyze page potential.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#DC2626]/30 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-medium text-[#DC2626]">{error}</p>
          <button
            onClick={triggerAnalysis}
            className="ml-3 shrink-0 text-xs text-[#DC2626] underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {jobState === 'completed' && pages.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Summary stats */}
          <div className="flex gap-5 border-b border-[#E9ECEF] pb-4">
            <Stat label="Scored" value={scored.length} />
            <Stat label="Selected" value={selected.length} accent />
            <Stat label="Auto-rejected" value={rejected.length} />
          </div>

          {/* Selected pages callout */}
          {selected.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Star className="size-3 fill-[#cb2eba] text-[#cb2eba]" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#cb2eba]">
                  Ready to post
                </p>
              </div>
              <div className="flex flex-col gap-1">
                {selected.map((p) => (
                  <PageRow key={p.id} page={p} highlight />
                ))}
              </div>
            </div>
          )}

          {/* All pages */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6C757D]">
              All pages
            </p>
            <div className="flex flex-col gap-1">
              {sorted.map((p) => (
                <PageRow key={p.id} page={p} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-[#6C757D]">{label}</p>
      <p className={`text-lg font-semibold ${accent ? 'text-[#cb2eba]' : 'text-[#212529]'}`}>
        {value}
      </p>
    </div>
  )
}

function PageRow({ page, highlight }: { page: ScoredPage; highlight?: boolean }) {
  const score = page.post_potential_score
  const isRejected = page.analysis_status === 'analyzed' && score === 0
  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        highlight
          ? 'bg-[#fdf0fc] border border-[#d8bfd8]'
          : isRejected
          ? 'opacity-40'
          : 'hover:bg-[#F8F9FA]',
      ].join(' ')}
    >
      <span className="w-8 shrink-0 text-center text-[11px] font-mono text-[#6C757D]">
        {page.page_number}
      </span>
      <span className="flex-1 truncate text-xs text-[#212529]">
        {page.main_topic ?? (isRejected ? 'Auto-rejected' : 'Pending…')}
      </span>
      <ContentTypePill type={page.content_type} />
      <ScoreBar score={score} />
    </div>
  )
}
