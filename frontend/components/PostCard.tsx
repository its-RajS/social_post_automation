'use client'

import { useState } from 'react'
import { Loader2, ImageOff, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { CopyButton } from './CopyButton'
import { StatusBadge } from './StatusBadge'
import type { GeneratedPost, ScoredPage } from '@/lib/api'

type BadgeStatus = 'pending' | 'processing' | 'completed' | 'failed'

function toBadgeStatus(status: string): BadgeStatus {
  if (status === 'completed' || status === 'failed' || status === 'pending') return status
  return 'processing' // generating, queued, etc.
}

function scoreColor(score: number): string {
  if (score >= 0.45) return '#cb2eba'
  if (score >= 0.3) return '#787496'
  return '#ADB5BD'
}

export function PostCard({ post, context }: { post: GeneratedPost; context?: ScoredPage }) {
  const [zoom, setZoom] = useState(false)
  const failed = post.status === 'failed'
  const rendering = !post.image_url && !failed
  const score = context?.post_potential_score ?? null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#E9ECEF] bg-white">
      {/* Rendered image (1200x627 ≈ 1.91:1) */}
      <div
        className="relative aspect-[1200/627] w-full bg-[#F8F9FA] flex items-center justify-center"
        style={post.image_url ? { cursor: 'zoom-in' } : undefined}
        onClick={() => post.image_url && setZoom(true)}
      >
        {post.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt={post.title ?? 'Rendered post'}
            className="h-full w-full object-cover"
          />
        ) : failed ? (
          <div className="flex flex-col items-center gap-1.5 text-[#DC2626]">
            <ImageOff className="size-5" />
            <span className="text-xs font-medium">Render failed</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-[#6C757D]">
            <Loader2 className="size-5 animate-spin text-[#cb2eba]" />
            <span className="text-xs">Rendering…</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="flex-1 text-sm font-semibold leading-snug text-[#212529]">
            {post.title ?? (rendering ? 'Generating…' : 'Untitled post')}
          </h3>
          <StatusBadge status={toBadgeStatus(post.status)} />
        </div>

        {post.template_id && (
          <span className="w-fit rounded bg-[#f0eeff] px-1.5 py-0.5 text-[10px] font-medium text-[#787496]">
            {post.template_id.replace(/_/g, ' ')}
          </span>
        )}

        {post.caption && (
          <div className="flex items-start gap-1.5">
            <p className="flex-1 whitespace-pre-line text-xs leading-relaxed text-[#4a4a4a] line-clamp-6">
              {post.caption}
            </p>
            <CopyButton value={post.caption} />
          </div>
        )}

        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#fdf0fc] px-2 py-0.5 text-[10px] font-medium text-[#cb2eba]"
              >
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        )}

        {/* Why this page */}
        {context && (
          <div className="mt-1 rounded-lg border border-[#E9ECEF] bg-[#F8F9FA] px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Star className="size-3 fill-[#cb2eba] text-[#cb2eba]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6C757D]">
                Why this page
              </span>
              {score != null && (
                <span
                  className="ml-auto text-[11px] font-mono font-medium tabular-nums"
                  style={{ color: scoreColor(score) }}
                >
                  {score.toFixed(2)}
                </span>
              )}
            </div>
            {context.main_topic && (
              <p className="text-xs text-[#212529]">{context.main_topic}</p>
            )}
            {(context.audience.length > 0 || context.pain_points.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {context.audience.map((a) => (
                  <span key={a} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-[#787496] border border-[#E9ECEF]">
                    {a}
                  </span>
                ))}
                {context.pain_points.map((p) => (
                  <span key={p} className="rounded bg-white px-1.5 py-0.5 text-[10px] text-[#6C757D] border border-[#E9ECEF]">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zoom lightbox */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-white rounded-xl">
          <DialogTitle className="sr-only">{post.title ?? 'Rendered post'}</DialogTitle>
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image_url} alt={post.title ?? 'Rendered post'} className="w-full object-contain max-h-[80vh]" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
