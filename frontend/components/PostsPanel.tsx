'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { getPosts, getScoredPages, type GeneratedPost, type ScoredPage } from '@/lib/api'
import { PostCard } from './PostCard'

interface Props {
  docId: string
  enabled: boolean
}

// Posts are auto-generated + auto-rendered by the pipeline. This panel only polls
// and displays; it keeps polling while any post is still generating or rendering.
function isPending(p: GeneratedPost): boolean {
  if (p.status === 'failed') return false
  return p.status !== 'completed' || !p.image_url
}

export function PostsPanel({ docId, enabled }: Props) {
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [context, setContext] = useState<Record<string, ScoredPage>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await getPosts(docId)
      setPosts(res.posts)
      setError(null)
      return res.posts
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load posts')
      return null
    } finally {
      setLoading(false)
    }
  }, [docId])

  // Context map (why-selected) — fetched once
  useEffect(() => {
    if (!enabled) return
    getScoredPages(docId)
      .then((res) => setContext(Object.fromEntries(res.pages.map((p) => [p.id, p]))))
      .catch(() => {})
  }, [enabled, docId])

  // Initial load + poll every 3s while anything is still generating/rendering
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!enabled) return
    const tick = async () => {
      const cur = await load()
      if (cur && !cur.some(isPending) && timer.current) {
        clearInterval(timer.current)
        timer.current = null
      }
    }
    tick()
    timer.current = setInterval(tick, 3000)
    return () => {
      if (timer.current) clearInterval(timer.current)
      timer.current = null
    }
  }, [enabled, docId, load])

  const generating = posts.some(isPending)
  const completed = posts.filter((p) => p.status === 'completed' && p.image_url).length

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#cb2eba]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6C757D]">
            Generated Posts
          </span>
          {posts.length > 0 && (
            <span className="rounded-full bg-[#fdf0fc] px-2 py-0.5 text-xs font-medium text-[#cb2eba]">
              {completed}/{posts.length} ready
            </span>
          )}
        </div>
        {(loading || generating) && (
          <div className="flex items-center gap-1.5 text-xs text-[#6C757D]">
            <Loader2 className="size-3.5 animate-spin text-[#cb2eba]" />
            {loading ? 'Loading…' : 'Generating & rendering…'}
          </div>
        )}
      </div>

      {!enabled && (
        <div className="rounded-xl border border-[#E9ECEF] px-6 py-8 text-center">
          <p className="text-sm text-[#6C757D]">Finish document processing to generate posts.</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#DC2626]/30 bg-red-50 px-4 py-3">
          <p className="text-xs font-medium text-[#DC2626]">{error}</p>
        </div>
      )}

      {enabled && !loading && !error && posts.length === 0 && (
        <div className="rounded-xl border border-[#E9ECEF] px-6 py-8 text-center">
          <p className="text-sm text-[#6C757D]">
            No posts yet. They generate automatically once page analysis selects pages.
          </p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} context={context[p.page_id]} />
          ))}
        </div>
      )}
    </div>
  )
}
