'use client'

import { useState } from 'react'
import { Table2, Image } from 'lucide-react'
import { Skeleton } from './ui/skeleton'
import type { PageItem } from '@/lib/api'

interface Props {
  page: PageItem
  onClick: () => void
}

export function PageCard({ page, onClick }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl overflow-hidden border border-[#E9ECEF] bg-white shadow-sm text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2 transition-shadow hover:shadow-md"
    >
      <div className="aspect-[3/4] relative overflow-hidden bg-[#F8F9FA]">
        {page.screenshot_url && !errored ? (
          <>
            {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.screenshot_url}
              alt={`Page ${page.page_number}`}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-[#6C757D]">No preview</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-white">
        <span className="text-xs text-[#6C757D]">Page {page.page_number}</span>
        <div className="flex gap-1.5">
          {page.has_tables && <Table2 className="size-3.5 text-[#6C757D]" />}
          {page.has_images && <Image className="size-3.5 text-[#6C757D]" />}
        </div>
      </div>
    </button>
  )
}
