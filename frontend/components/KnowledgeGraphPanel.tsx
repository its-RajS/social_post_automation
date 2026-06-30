'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, GitFork, ChevronDown, ChevronUp } from 'lucide-react'
import {
  buildKnowledgeGraph,
  getGraphJobStatus,
  getGraphEntities,
  getLatestKgJob,
  type GraphEntity,
} from '@/lib/api'

const ENTITY_COLORS: Record<string, { bg: string; text: string }> = {
  Company:   { bg: 'bg-[#fdf0fc]', text: 'text-[#cb2eba]' },
  Product:   { bg: 'bg-[#f0eeff]', text: 'text-[#787496]' },
  Service:   { bg: 'bg-[#f0eeff]', text: 'text-[#787496]' },
  Audience:  { bg: 'bg-[#ecfdf5]', text: 'text-[#16A34A]' },
  Feature:   { bg: 'bg-[#eff6ff]', text: 'text-[#2563EB]' },
  PainPoint: { bg: 'bg-[#fff7ed]', text: 'text-[#EA580C]' },
  Benefit:   { bg: 'bg-[#f0fdf4]', text: 'text-[#15803D]' },
  UseCase:   { bg: 'bg-[#fafaf9]', text: 'text-[#57534E]' },
  Industry:  { bg: 'bg-[#fdf4ff]', text: 'text-[#9333EA]' },
}

const LABEL_ORDER = ['Company', 'Product', 'Service', 'Audience', 'Feature', 'PainPoint', 'Benefit', 'UseCase', 'Industry']

function primaryLabel(labels: string[]): string {
  for (const l of LABEL_ORDER) if (labels.includes(l)) return l
  return labels[0] ?? 'Entity'
}

interface Props {
  docId: string
  enabled: boolean
}

type JobState = 'checking' | 'idle' | 'queued' | 'processing' | 'completed' | 'failed'

export function KnowledgeGraphPanel({ docId, enabled }: Props) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobState, setJobState] = useState<JobState>('checking')
  const [entities, setEntities] = useState<GraphEntity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const loadEntities = useCallback(async () => {
    try {
      const res = await getGraphEntities(docId)
      if (res.count > 0) {
        setEntities(res.entities)
        setJobState('completed')
        return true
      }
    } catch {
      // no entities yet
    }
    return false
  }, [docId])

  const triggerBuild = useCallback(async () => {
    setError(null)
    setJobState('queued')
    try {
      const res = await buildKnowledgeGraph(docId)
      setJobId(res.job_id)
    } catch (e) {
      setJobState('failed')
      setError(e instanceof Error ? e.message : 'Failed to start graph build')
    }
  }, [docId])

  // On mount: check for existing job, then auto-trigger if none
  useEffect(() => {
    if (!enabled) return

    async function init() {
      try {
        const latest = await getLatestKgJob(docId)
        if (latest.job_id && latest.status !== 'none') {
          if (latest.status === 'completed') {
            await loadEntities()
          } else if (latest.status === 'queued' || latest.status === 'processing') {
            setJobId(latest.job_id)
            setJobState(latest.status)
          } else if (latest.status === 'failed') {
            setJobState('failed')
            setError(latest.error ?? 'Graph build failed')
          }
          return
        }
      } catch {
        // fallback: try entities
      }
      // No job found — check if entities already exist from prior run
      const hasEntities = await loadEntities()
      if (!hasEntities) {
        // Auto-trigger (webhook should have done this, but trigger as fallback)
        await triggerBuild()
      }
    }

    init()
  }, [enabled, docId, loadEntities, triggerBuild])

  // Poll while job is running
  useEffect(() => {
    if (!jobId || jobState === 'completed' || jobState === 'failed') return
    const interval = setInterval(async () => {
      try {
        const s = await getGraphJobStatus(jobId)
        setJobState(s.status as JobState)
        if (s.status === 'completed') {
          clearInterval(interval)
          const res = await getGraphEntities(docId)
          setEntities(res.entities)
        } else if (s.status === 'failed') {
          clearInterval(interval)
          setError(s.error ?? 'Graph build failed')
        }
      } catch {
        // transient
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [jobId, jobState, docId])

  // Group entities by type
  const byType: Record<string, GraphEntity[]> = {}
  for (const e of entities) {
    const label = primaryLabel(e.labels)
    ;(byType[label] ??= []).push(e)
  }
  const groupOrder = LABEL_ORDER.filter((l) => byType[l])

  const isActive = jobState === 'queued' || jobState === 'processing'

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitFork className="size-4 text-[#cb2eba]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6C757D]">
            Knowledge Graph
          </span>
          {jobState === 'completed' && entities.length > 0 && (
            <span className="rounded-full bg-[#fdf0fc] px-2 py-0.5 text-xs font-medium text-[#cb2eba]">
              {entities.length} entities
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
              : 'Extracting entities…'}
          </div>
        )}

        {jobState === 'completed' && (
          <button
            onClick={triggerBuild}
            className="text-xs text-[#6C757D] hover:text-[#212529] transition-colors"
          >
            Rebuild
          </button>
        )}
      </div>

      {!enabled && (
        <div className="rounded-xl border border-[#E9ECEF] px-6 py-8 text-center">
          <p className="text-sm text-[#6C757D]">
            Finish document processing to build the knowledge graph.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#DC2626]/30 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-xs font-medium text-[#DC2626]">{error}</p>
          <button
            onClick={triggerBuild}
            className="ml-3 shrink-0 text-xs text-[#DC2626] underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Entities grouped by type */}
      {jobState === 'completed' && entities.length > 0 && (
        <div className="flex flex-col gap-3">
          {groupOrder.map((label) => {
            const items = byType[label]
            const color = ENTITY_COLORS[label] ?? { bg: 'bg-[#F8F9FA]', text: 'text-[#6C757D]' }
            const isOpen = expanded[label] ?? false
            const visible = isOpen ? items : items.slice(0, 5)
            return (
              <div key={label}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#787496]">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visible.map((e) => (
                    <span
                      key={e.name}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color.bg} ${color.text}`}
                      title={e.properties?.description}
                    >
                      {e.name}
                    </span>
                  ))}
                  {items.length > 5 && (
                    <button
                      onClick={() => setExpanded((prev) => ({ ...prev, [label]: !isOpen }))}
                      className="inline-flex items-center gap-0.5 rounded-full px-2.5 py-0.5 text-xs text-[#6C757D] hover:text-[#212529] border border-[#E9ECEF] transition-colors"
                    >
                      {isOpen ? (
                        <><ChevronUp className="size-3" /> Less</>
                      ) : (
                        <><ChevronDown className="size-3" /> +{items.length - 5} more</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
