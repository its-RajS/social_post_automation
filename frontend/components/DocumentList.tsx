'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { listDocuments, type DocumentSummary } from '@/lib/api'
import { DocumentCard } from './DocumentCard'

interface Props {
  refreshTick?: number
}

export function DocumentList({ refreshTick }: Props) {
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function poll() {
      while (active) {
        try {
          const res = await listDocuments()
          if (!active) break
          setDocs(res.documents)
          setLoading(false)
          const hasActive = res.documents.some((d) =>
            ['pending', 'processing'].includes(d.status),
          )
          await new Promise((r) => setTimeout(r, hasActive ? 3000 : 8000))
        } catch {
          setLoading(false)
          await new Promise((r) => setTimeout(r, 5000))
        }
      }
    }

    poll()
    return () => {
      active = false
    }
  }, [refreshTick])

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader2 className="size-5 animate-spin text-[#6C757D]" />
      </div>
    )
  }

  if (docs.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-[#E9ECEF] py-12 text-center">
        <p className="text-sm text-[#6C757D]">No documents yet. Upload one above.</p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#6C757D]">
        Your Documents ({docs.length})
      </p>
      <div className="flex flex-col gap-3">
        {docs.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>
    </div>
  )
}
