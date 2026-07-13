'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/UploadZone'
import { DocumentList } from '@/components/DocumentList'
import Link from 'next/link'
import { Palette } from 'lucide-react'

export default function HomePage() {
  const [refreshTick, setRefreshTick] = useState(0)

  return (
    <main className="min-h-screen bg-[#F8F9FA] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#212529]">LinkedIn Automation</h1>
          <p className="mt-1 text-sm text-[#6C757D]">
            Upload documents — pipeline runs automatically
          </p>
          <Link href="/designer" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d9d3df] bg-white px-4 py-2 text-xs font-semibold text-[#694b75] hover:border-[#b23ba4]">
            <Palette className="size-3.5" /> Open designer dashboard
          </Link>
        </div>
        <UploadZone onUploaded={() => setRefreshTick((t) => t + 1)} />
        <DocumentList refreshTick={refreshTick} />
      </div>
    </main>
  )
}
