'use client'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PageItem } from '@/lib/api'

interface Props {
  page: PageItem | null
  filename?: string
  onClose: () => void
}

export function PageLightbox({ page, filename, onClose }: Props) {
  return (
    <Dialog open={!!page} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-white rounded-xl">
        <DialogTitle className="sr-only">
          {filename ? `Page ${page?.page_number} of ${filename}` : `Page ${page?.page_number}`}
        </DialogTitle>
        {page?.screenshot_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.screenshot_url}
            alt={`Page ${page.page_number}${filename ? ` of ${filename}` : ''}`}
            className="w-full object-contain max-h-[75vh]"
          />
        )}
        {page?.text_preview && (
          <div className="px-6 py-4 border-t border-[#E9ECEF]">
            <p className="text-xs text-[#6C757D] line-clamp-3">{page.text_preview}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
