import { UploadZone } from '@/components/UploadZone'

export default function UploadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-[#F8F9FA]">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-[#212529]">LinkedIn Automation</h1>
          <p className="mt-1 text-sm text-[#6C757D]">
            Upload a document to extract content and generate posts
          </p>
        </div>
        <UploadZone />
      </div>
    </main>
  )
}
