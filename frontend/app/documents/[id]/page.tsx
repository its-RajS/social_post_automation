import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getDocumentStatus } from '@/lib/api'
import { ProgressPanel } from '@/components/ProgressPanel'
import { AnalysisTabs } from '@/components/AnalysisTabs'
import { CopyButton } from '@/components/CopyButton'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DocumentPage({ params }: Props) {
  const { id } = await params

  let initial
  try {
    initial = await getDocumentStatus(id)
  } catch {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4">
        <div className="text-center">
          <p className="text-sm font-medium text-[#DC2626]">Document not found</p>
          <Link href="/" className="mt-4 inline-block text-sm text-[#0EA5E9] hover:underline">
            ← Upload a new document
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F8F9FA] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#6C757D] hover:text-[#212529] transition-colors mb-6"
        >
          <ArrowLeft className="size-4" />
          New upload
        </Link>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[300px_1fr]">
          {/* Left panel */}
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border border-[#E9ECEF] bg-white p-6 shadow-sm">
              <ProgressPanel docId={id} initialStatus={initial} />
            </div>

            <div className="rounded-xl border border-[#E9ECEF] bg-white p-4 shadow-sm">
              <p className="mb-1 text-xs text-[#6C757D]">Document ID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-[#F8F9FA] px-2 py-1 text-xs font-mono text-[#212529]">
                  {id}
                </code>
                <CopyButton value={id} />
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="rounded-xl border border-[#E9ECEF] bg-white p-6 shadow-sm">
            <AnalysisTabs docId={id} status={initial.status} />
          </div>
        </div>
      </div>
    </main>
  )
}
