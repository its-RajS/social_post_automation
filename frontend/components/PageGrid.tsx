'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDocumentPages } from '@/lib/api'
import { PageCard } from './PageCard'
import { PageLightbox } from './PageLightbox'
import { Skeleton } from './ui/skeleton'
import type { PageItem } from '@/lib/api'

interface Props {
  docId: string
  status: string
  filename?: string
}

const SKELETON_COUNT = 6

export function PageGrid({ docId, status, filename }: Props) {
  const [active, setActive] = useState<PageItem | null>(null)
  const isCompleted = status === 'completed'

  const { data } = useQuery({
    queryKey: ['document', docId, 'pages'],
    queryFn: () => getDocumentPages(docId),
    enabled: isCompleted,
    staleTime: 60_000,
  })

  if (!isCompleted) {
    if (status === 'failed') {
      return (
        <div className="flex items-center justify-center h-48">
          <p className="text-sm text-[#6C757D]">No pages generated</p>
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden border border-[#E9ECEF]">
            <Skeleton className="aspect-[3/4] rounded-none" />
            <div className="px-3 py-2 bg-white">
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const pages = data?.pages ?? []

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-[#6C757D]">Pages loading…</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {pages.map((page) => (
          <PageCard key={page.page_id} page={page} onClick={() => setActive(page)} />
        ))}
      </div>
      <PageLightbox page={active} filename={filename} onClose={() => setActive(null)} />
    </>
  )
}
