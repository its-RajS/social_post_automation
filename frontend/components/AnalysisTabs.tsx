'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PageGrid } from './PageGrid'
import { KnowledgeGraphPanel } from './KnowledgeGraphPanel'
import { PageAnalysisPanel } from './PageAnalysisPanel'
import { PostsPanel } from './PostsPanel'

interface Props {
  docId: string
  status: string
  filename?: string
}

const TABS = [
  { id: 'pages', label: 'Pages' },
  { id: 'graph', label: 'Knowledge Graph' },
  { id: 'analysis', label: 'Page Analysis' },
  { id: 'posts', label: 'Posts' },
] as const

type TabId = (typeof TABS)[number]['id']

export function AnalysisTabs({ docId, status, filename }: Props) {
  const [active, setActive] = useState<TabId>('pages')
  const enabled = status === 'completed'

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#E9ECEF]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'px-3 pb-2.5 pt-1 text-xs font-medium transition-colors border-b-2 -mb-px',
              active === tab.id
                ? 'border-[#cb2eba] text-[#212529]'
                : 'border-transparent text-[#6C757D] hover:text-[#212529]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div>
        {active === 'pages' && (
          <PageGrid docId={docId} status={status} filename={filename} />
        )}
        {active === 'graph' && (
          <KnowledgeGraphPanel docId={docId} enabled={enabled} />
        )}
        {active === 'analysis' && (
          <PageAnalysisPanel docId={docId} enabled={enabled} />
        )}
        {active === 'posts' && (
          <PostsPanel docId={docId} enabled={enabled} />
        )}
      </div>
    </div>
  )
}
