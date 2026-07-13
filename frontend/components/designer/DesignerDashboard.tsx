'use client'
/* eslint-disable @next/next/no-img-element -- MinIO presigned URLs have dynamic hosts and preserve generated artwork dimensions. */

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight,
  ExternalLink, FileStack, GripVertical, Share2, Loader2, LogOut, RefreshCw, Settings,
  ShieldCheck, Sparkles, Undo2, X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  addLinkedInOrganization,
  cancelDesignerPublication,
  DesignerPost,
  disconnectLinkedIn,
  getAdminSession,
  getDesignerPosts,
  getDesignerPublication,
  getLinkedInStatus,
  LinkedInStatus,
  listDesignerPublications,
  loginAdmin,
  logoutAdmin,
  prepareDesignerPublication,
  Publication,
  publishDesignerPublication,
  resolveDesignerPublication,
  retryDesignerFeedback,
  retryDesignerPublication,
  reviewDesignerPost,
  setDefaultLinkedInDestination,
  type AdminSession,
} from '@/lib/api'

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED'

function indiaDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function moveDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function DesignerDashboard() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined)

  useEffect(() => {
    getAdminSession().then(setSession).catch(() => setSession(null))
  }, [])

  if (session === undefined) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-6 animate-spin text-[#cb2eba]" /></div>
  }
  if (!session) return <AdminLogin onAuthenticated={setSession} />
  return <AuthenticatedDashboard session={session} onLogout={() => setSession(null)} />
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: (session: AdminSession) => void }) {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    try { onAuthenticated(await loginAdmin(email, password)) }
    catch (error) { toast.error(message(error)) }
    finally { setLoading(false) }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3fa] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[#e5e1ef] bg-white p-7 shadow-xl shadow-[#5b477a]/10">
        <div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-[#f4e9f7] text-[#9d258f]"><ShieldCheck /></div>
        <h1 className="text-xl font-semibold text-[#211d29]">Designer workspace</h1>
        <p className="mt-1 text-sm text-[#746d7d]">Sign in to review and publish generated posts.</p>
        <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-[#746d7d]">Email</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-lg border border-[#ded9e7] px-3 py-2.5 text-sm outline-none focus:border-[#b23ba4]" />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#746d7d]">Password</label>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-lg border border-[#ded9e7] px-3 py-2.5 text-sm outline-none focus:border-[#b23ba4]" />
        <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#9d258f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#851d79] disabled:opacity-60">
          {loading && <Loader2 className="size-4 animate-spin" />} Sign in
        </button>
      </form>
    </main>
  )
}

function AuthenticatedDashboard({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [date, setDate] = useState(indiaDate())
  const [tab, setTab] = useState<Tab>('PENDING')
  const [posts, setPosts] = useState<DesignerPost[]>([])
  const [history, setHistory] = useState<Publication[]>([])
  const [linkedin, setLinkedin] = useState<LinkedInStatus | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [activePublication, setActivePublication] = useState<Publication | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [draggedPost, setDraggedPost] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [daily, publications, linkedInStatus] = await Promise.all([
        getDesignerPosts(date), listDesignerPublications(), getLinkedInStatus(),
      ])
      setPosts(daily.posts)
      setHistory(publications.publications)
      setLinkedin(linkedInStatus)
    } catch (error) { toast.error(message(error)) }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('linkedin') === 'error') {
      toast.error(params.get('linkedin_error') ?? 'LinkedIn connection failed')
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (params.get('linkedin') === 'connected') {
      toast.success('LinkedIn connected')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([getDesignerPosts(date), listDesignerPublications(), getLinkedInStatus()])
      .then(([daily, publications, linkedInStatus]) => {
        if (!active) return
        setPosts(daily.posts)
        setHistory(publications.publications)
        setLinkedin(linkedInStatus)
      })
      .catch((error) => { if (active) toast.error(message(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date])

  useEffect(() => {
    if (!activePublication || !['PREPARING', 'PUBLISHING'].includes(activePublication.state)) return
    const timer = window.setInterval(async () => {
      try {
        const current = await getDesignerPublication(activePublication.id)
        setActivePublication(current)
        if (!['PREPARING', 'PUBLISHING'].includes(current.state)) void load()
      } catch (error) { toast.error(message(error)) }
    }, 2500)
    return () => window.clearInterval(timer)
  }, [activePublication, load])

  const visible = useMemo(() => posts.filter((post) => {
    if (tab === 'PUBLISHED') return post.publication?.state === 'PUBLISHED'
    if (post.publication?.state === 'PUBLISHED') return false
    return post.review_status === tab
  }), [posts, tab])

  const counts = useMemo(() => ({
    PENDING: posts.filter((post) => post.review_status === 'PENDING' && post.publication?.state !== 'PUBLISHED').length,
    APPROVED: posts.filter((post) => post.review_status === 'APPROVED' && post.publication?.state !== 'PUBLISHED').length,
    REJECTED: posts.filter((post) => post.review_status === 'REJECTED').length,
    PUBLISHED: posts.filter((post) => post.publication?.state === 'PUBLISHED').length,
  }), [posts])

  async function review(post: DesignerPost, action: 'approve' | 'reject' | 'undo') {
    setBusy(post.id)
    try {
      await reviewDesignerPost(post.id, action, session.csrf_token)
      setSelection((current) => current.filter((id) => id !== post.id))
      await load()
      toast.success(action === 'approve' ? 'Approved and queued for RAG' : action === 'reject' ? 'Rejected and queued for RAG' : 'Review cleared')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  function toggleSelection(postId: string) {
    setSelection((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId])
  }

  function changeDate(nextDate: string) {
    setLoading(true)
    setSelection([])
    setActivePublication(null)
    setDate(nextDate)
  }

  function moveSelection(postId: string, direction: -1 | 1) {
    setSelection((current) => {
      const index = current.indexOf(postId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function dropSelection(targetId: string) {
    if (!draggedPost || draggedPost === targetId) return
    setSelection((current) => {
      const next = current.filter((id) => id !== draggedPost)
      const target = next.indexOf(targetId)
      next.splice(target, 0, draggedPost)
      return next
    })
    setDraggedPost(null)
  }

  async function prepare() {
    setBusy('prepare')
    try {
      const publication = await prepareDesignerPublication(selection, session.csrf_token)
      setActivePublication(publication)
      setSelection([])
      toast.success('Read-only publication preview is being prepared')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  async function publish() {
    if (!activePublication) return
    setBusy('publish')
    try {
      await publishDesignerPublication(activePublication.id, session.csrf_token)
      setActivePublication({ ...activePublication, state: 'PUBLISHING' })
      toast.success('Publishing to LinkedIn')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  async function cancelPublication() {
    if (!activePublication) return
    setBusy('cancel')
    try {
      await cancelDesignerPublication(activePublication.id, session.csrf_token)
      setActivePublication(null)
      await load()
      toast.success('Draft cancelled; its posts can be reviewed again')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  async function resolveVerification(outcome: 'published' | 'not_published') {
    if (!activePublication) return
    const prompt = outcome === 'published'
      ? 'Confirm that you found this post live on LinkedIn.'
      : 'Confirm that the post is absent from LinkedIn. It will become eligible for retry.'
    if (!window.confirm(prompt)) return
    setBusy('resolve')
    try {
      const result = await resolveDesignerPublication(activePublication.id, outcome, session.csrf_token)
      setActivePublication({ ...activePublication, state: result.state })
      await load()
      toast.success(outcome === 'published' ? 'Publication marked as published' : 'Publication can now be retried')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  async function retryFeedback(post: DesignerPost) {
    setBusy(post.id)
    try {
      await retryDesignerFeedback(post.id, session.csrf_token)
      await load()
      toast.success('Feedback indexing queued again')
    } catch (error) { toast.error(message(error)) }
    finally { setBusy(null) }
  }

  async function logout() {
    try { await logoutAdmin(session.csrf_token) } finally { onLogout() }
  }

  return (
    <main className="min-h-screen bg-[#f7f6f9]">
      <header className="border-b border-[#e8e5ec] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-5 py-4 lg:px-8">
          <Link href="/" className="rounded-lg p-2 text-[#746d7d] hover:bg-[#f5f2f7]"><ArrowLeft className="size-4" /></Link>
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#9d258f] text-white"><Sparkles className="size-4" /></div>
          <div><h1 className="font-semibold text-[#211d29]">Designer dashboard</h1><p className="text-xs text-[#817987]">Review → curate → publish</p></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowSettings((value) => !value)} className="flex items-center gap-2 rounded-lg border border-[#ded9e7] px-3 py-2 text-xs font-medium hover:bg-[#f8f6fa]"><Settings className="size-3.5" /> Settings</button>
            <button onClick={logout} className="rounded-lg p-2 text-[#817987] hover:bg-[#f8f6fa]" title="Sign out"><LogOut className="size-4" /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-6 lg:px-8">
        {showSettings && linkedin && <LinkedInSettings status={linkedin} csrf={session.csrf_token} onChanged={load} />}

        <section className="mb-5 flex flex-col gap-3 rounded-xl border border-[#e6e2ea] bg-white p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2"><CalendarDays className="size-4 text-[#9d258f]" /><span className="text-sm font-semibold">Daily collection</span></div>
          <div className="flex items-center gap-1 sm:ml-auto">
            <button onClick={() => changeDate(moveDate(date, -1))} className="rounded-md p-2 hover:bg-[#f6f3f8]"><ChevronLeft className="size-4" /></button>
            <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="rounded-lg border border-[#ded9e7] px-3 py-1.5 text-sm" />
            <button onClick={() => changeDate(moveDate(date, 1))} disabled={date >= indiaDate()} className="rounded-md p-2 hover:bg-[#f6f3f8] disabled:opacity-30"><ChevronRight className="size-4" /></button>
            <button onClick={() => void load()} className="ml-2 rounded-md p-2 hover:bg-[#f6f3f8]"><RefreshCw className="size-4" /></button>
          </div>
        </section>

        <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-[#e6e2ea] bg-white p-1.5">
          {(['PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED'] as Tab[]).map((value) => (
            <button key={value} onClick={() => setTab(value)} className={`flex min-w-fit items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${tab === value ? 'bg-[#32283d] text-white' : 'text-[#746d7d] hover:bg-[#f6f3f8]'}`}>
              {value[0] + value.slice(1).toLowerCase()} <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === value ? 'bg-white/15' : 'bg-[#eeeaf1]'}`}>{counts[value]}</span>
            </button>
          ))}
        </div>

        <div className={`grid gap-6 ${activePublication ? 'xl:grid-cols-[1fr_420px]' : ''}`}>
          <section>
            {loading ? <div className="flex justify-center py-20"><Loader2 className="size-6 animate-spin text-[#9d258f]" /></div> : visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d9d3df] bg-white py-16 text-center text-sm text-[#817987]">No posts in this view for {date}.</div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                {visible.map((post) => <DesignerPostCard key={post.id} post={post} selected={selection.includes(post.id)} busy={busy === post.id} onSelect={() => toggleSelection(post.id)} onReview={(action) => review(post, action)} onRetryFeedback={() => retryFeedback(post)} />)}
              </div>
            )}
          </section>
          {activePublication && <PublicationPreview publication={activePublication} busy={busy !== null} onPublish={publish} onCancel={cancelPublication} onResolve={resolveVerification} />}
        </div>

        {selection.length > 0 && (
          <section className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-3xl rounded-2xl border border-[#d8cedd] bg-[#211d29] p-4 text-white shadow-2xl">
            <div className="flex items-center gap-3"><FileStack className="size-5 text-[#eaa9df]" /><div><p className="text-sm font-semibold">{selection.length} approved post{selection.length === 1 ? '' : 's'} selected</p><p className="text-xs text-white/60">{selection.length === 2 ? 'Choose one, or select at least three for a PDF document post.' : selection.length >= 3 ? 'Arrange the PDF page order.' : 'Single-image LinkedIn post.'}</p></div></div>
            {selection.length >= 3 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{selection.map((id, index) => { const post = posts.find((item) => item.id === id); return <div key={id} draggable onDragStart={() => setDraggedPost(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropSelection(id)} className="flex min-w-40 cursor-grab items-center gap-2 rounded-lg bg-white/10 px-2 py-1.5 text-xs active:cursor-grabbing"><GripVertical className="size-3 text-white/40" /><span className="font-mono text-white/50">{index + 1}</span><span className="flex-1 truncate">{post?.title ?? 'Post'}</span><button onClick={() => moveSelection(id, -1)} disabled={index === 0}><ArrowUp className="size-3" /></button><button onClick={() => moveSelection(id, 1)} disabled={index === selection.length - 1}><ArrowDown className="size-3" /></button></div> })}</div>}
            <div className="mt-3 flex justify-end gap-2"><button onClick={() => setSelection([])} className="rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10">Clear</button><button onClick={prepare} disabled={selection.length === 2 || busy === 'prepare'} className="flex items-center gap-2 rounded-lg bg-[#d657c7] px-4 py-2 text-xs font-semibold disabled:opacity-40">{busy === 'prepare' && <Loader2 className="size-3.5 animate-spin" />} Prepare preview</button></div>
          </section>
        )}

        <PublicationHistory publications={history} csrf={session.csrf_token} onChanged={load} onOpen={setActivePublication} />
      </div>
    </main>
  )
}

function DesignerPostCard({ post, selected, busy, onSelect, onReview, onRetryFeedback }: { post: DesignerPost; selected: boolean; busy: boolean; onSelect: () => void; onReview: (action: 'approve' | 'reject' | 'undo') => void; onRetryFeedback: () => void }) {
  const selectable = post.review_status === 'APPROVED' && !post.publication
  return (
    <article className={`overflow-hidden rounded-xl border bg-white transition ${selected ? 'border-[#b23ba4] ring-2 ring-[#b23ba4]/15' : 'border-[#e6e2ea]'}`}>
      <div className="relative flex min-h-44 items-center justify-center bg-[#efedf1]">
        {post.image_url ? <img src={post.image_url} alt={post.title ?? 'Generated design'} className="max-h-72 w-full object-contain" /> : <Loader2 className="size-5 animate-spin text-[#9d258f]" />}
        {selectable && <button onClick={onSelect} className={`absolute right-3 top-3 flex size-7 items-center justify-center rounded-full border-2 shadow ${selected ? 'border-[#9d258f] bg-[#9d258f] text-white' : 'border-white bg-white text-transparent'}`}><Check className="size-4" /></button>}
      </div>
      <div className="p-4">
        <div className="flex items-start gap-2"><h2 className="flex-1 text-sm font-semibold leading-snug">{post.title ?? 'Untitled post'}</h2><span className="rounded bg-[#f1edf5] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#766681]">{post.template_id?.replaceAll('_', ' ')}</span></div>
        <p className="mt-2 text-[10px] text-[#8b8491]">{post.source.filename} · page {post.source.page_number}</p>
        {post.caption && <p className="mt-3 line-clamp-5 whitespace-pre-line text-xs leading-relaxed text-[#514b58]">{post.caption}</p>}
        <div className="mt-3 flex flex-wrap gap-1">{post.hashtags.map((tag) => <span key={tag} className="text-[10px] font-medium text-[#9d258f]">{tag}</span>)}</div>
        <div className="mt-4 flex items-center gap-2 border-t border-[#eeeaf1] pt-3">
          <span className={`text-[10px] font-semibold ${post.feedback_index_status === 'FAILED' ? 'text-red-600' : 'text-[#8b8491]'}`}>RAG: {post.feedback_index_status.toLowerCase().replace('_', ' ')}</span>
          {post.feedback_index_status === 'FAILED' && <button onClick={onRetryFeedback} className="mr-auto text-[10px] font-semibold text-red-600 hover:underline">Retry RAG</button>}
          {post.feedback_index_status !== 'FAILED' && <span className="mr-auto" />}
          {busy ? <Loader2 className="size-4 animate-spin" /> : post.review_status === 'PENDING' ? <><button onClick={() => onReview('reject')} className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600"><X className="size-3" /> Reject</button><button onClick={() => onReview('approve')} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Check className="size-3" /> Approve</button></> : post.review_status === 'APPROVED' && !post.publication ? <><button onClick={() => onReview('undo')} className="rounded-lg p-1.5 text-[#817987]" title="Undo"><Undo2 className="size-3.5" /></button><button onClick={() => onReview('reject')} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600">Move to rejected</button></> : post.review_status === 'REJECTED' ? <><button onClick={() => onReview('undo')} className="rounded-lg p-1.5 text-[#817987]" title="Undo"><Undo2 className="size-3.5" /></button><button onClick={() => onReview('approve')} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs text-emerald-700">Approve instead</button></> : <span className="text-xs font-semibold text-emerald-700">{post.publication?.state.replaceAll('_', ' ')}</span>}
        </div>
      </div>
    </article>
  )
}

function PublicationPreview({ publication, busy, onPublish, onCancel, onResolve }: { publication: Publication; busy: boolean; onPublish: () => void; onCancel: () => void; onResolve: (outcome: 'published' | 'not_published') => void }) {
  return <aside className="h-fit rounded-xl border border-[#ded8e5] bg-white p-5 xl:sticky xl:top-5">
    <div className="flex items-center gap-2"><FileStack className="size-4 text-[#9d258f]" /><h2 className="text-sm font-semibold">Read-only preview</h2><span className="ml-auto rounded-full bg-[#f1edf5] px-2 py-1 text-[9px] font-bold text-[#766681]">{publication.state.replaceAll('_', ' ')}</span></div>
    {publication.state === 'PREPARING' ? <div className="py-12 text-center text-sm text-[#817987]"><div className="flex items-center justify-center gap-2"><Loader2 className="size-5 animate-spin text-[#9d258f]" /> AI is preparing the publication…</div><button onClick={onCancel} disabled={busy} className="mt-6 rounded-lg border border-[#ded9e7] px-3 py-2 text-xs font-semibold disabled:opacity-40">Cancel draft</button></div> : <>
      <div className="mt-4 flex gap-2 overflow-x-auto">{publication.items.map((item) => item.image_url && <img key={item.post_id} src={item.image_url} alt={item.title ?? 'Publication page'} className="h-28 max-w-48 rounded-lg border border-[#e6e2ea] object-contain" />)}</div>
      <h3 className="mt-4 text-sm font-semibold">{publication.title}</h3><p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-[#514b58]">{publication.caption}</p><p className="mt-2 text-xs font-medium text-[#9d258f]">{publication.hashtags.join(' ')}</p>
      {publication.document_url && <a href={publication.document_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#7360a8]">Open PDF <ExternalLink className="size-3" /></a>}
      {publication.error_message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{publication.error_message}</p>}
      {publication.state === 'VERIFICATION_REQUIRED' && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><p>LinkedIn may have received this post. Check LinkedIn before choosing an outcome.</p><div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => onResolve('published')} className="rounded-md bg-emerald-700 px-2.5 py-1.5 font-semibold text-white">It is live</button><button disabled={busy} onClick={() => onResolve('not_published')} className="rounded-md border border-amber-300 px-2.5 py-1.5 font-semibold">It is absent</button></div></div>}
      <div className="mt-5 border-t border-[#eeeaf1] pt-4"><p className="mb-3 text-[10px] uppercase tracking-wide text-[#8b8491]">Destination · {publication.destination?.label}</p><div className="flex gap-2">{['PREPARING', 'READY', 'FAILED', 'PUBLISHING'].includes(publication.state) && <button onClick={onCancel} disabled={busy} className="rounded-lg border border-[#ded9e7] px-3 py-2.5 text-xs font-semibold disabled:opacity-40">Cancel draft</button>}<button onClick={onPublish} disabled={publication.state !== 'READY' || busy} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />} Publish now</button></div></div>
    </>}
  </aside>
}

function LinkedInSettings({ status, csrf, onChanged }: { status: LinkedInStatus; csrf: string; onChanged: () => Promise<void> }) {
  const [organizationId, setOrganizationId] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const connection = status.connections[0]
  async function addOrganization(event: FormEvent) { event.preventDefault(); if (!connection) return; setBusy(true); try { await addLinkedInOrganization({ connection_id: connection.id, organization_id: organizationId, label, make_default: true }, csrf); setOrganizationId(''); setLabel(''); await onChanged(); toast.success('Company page saved as default') } catch (error) { toast.error(message(error)) } finally { setBusy(false) } }
  return <section className="mb-5 rounded-xl border border-[#d9e5f2] bg-white p-5">
    <div className="flex items-center gap-2"><Share2 className="size-4 text-[#0a66c2]" /><h2 className="text-sm font-semibold">LinkedIn connection</h2></div>
    {!status.configured ? <p className="mt-3 text-xs text-amber-700">Add LinkedIn client credentials and callback URL to the API environment before connecting.</p> : !connection ? <a href="/api/v1/linkedin/oauth/start" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2 text-xs font-semibold text-white"><Share2 className="size-3.5" /> Connect LinkedIn</a> : <div className="mt-4 grid gap-5 lg:grid-cols-2">
      <div><p className="text-xs font-semibold">{connection.display_name ?? 'Connected member'}</p><p className="mt-1 text-[10px] text-[#817987]">Token expires {new Date(connection.expires_at).toLocaleDateString()}</p><div className="mt-3 space-y-2">{connection.destinations.map((destination) => <button key={destination.id} onClick={async () => { await setDefaultLinkedInDestination(destination.id, csrf); await onChanged() }} className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-xs ${destination.is_default ? 'border-[#0a66c2] bg-blue-50' : 'border-[#e6e2ea]'}`}><span className="flex-1">{destination.label} · {destination.type.toLowerCase()}</span>{destination.is_default && <Check className="size-3.5 text-[#0a66c2]" />}</button>)}</div><button onClick={async () => { await disconnectLinkedIn(connection.id, csrf); await onChanged() }} className="mt-3 text-[10px] font-semibold text-red-600">Disconnect</button></div>
      <form onSubmit={addOrganization}><p className="text-xs font-semibold">Add company-page destination</p><input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} required pattern="[0-9]+" placeholder="LinkedIn organization ID" className="mt-3 w-full rounded-lg border border-[#ded9e7] px-3 py-2 text-xs" /><input value={label} onChange={(event) => setLabel(event.target.value)} required placeholder="Company page label" className="mt-2 w-full rounded-lg border border-[#ded9e7] px-3 py-2 text-xs" /><button disabled={busy} className="mt-2 rounded-lg border border-[#0a66c2] px-3 py-2 text-xs font-semibold text-[#0a66c2]">Save and make default</button></form>
    </div>}
  </section>
}

function PublicationHistory({ publications, csrf, onChanged, onOpen }: { publications: Publication[]; csrf: string; onChanged: () => Promise<void>; onOpen: (publication: Publication) => void }) {
  if (publications.length === 0) return null
  return <section className="mt-8"><h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#817987]">Publication history</h2><div className="overflow-hidden rounded-xl border border-[#e6e2ea] bg-white">{publications.slice(0, 12).map((publication) => <div key={publication.id} className="flex items-center gap-3 border-b border-[#eeeaf1] px-4 py-3 last:border-0"><button onClick={() => onOpen(publication)} className="flex-1 text-left"><p className="text-xs font-semibold">{publication.title ?? 'Preparing publication'}</p><p className="mt-0.5 text-[10px] text-[#817987]">{publication.collection_date} · {publication.destination?.label} · {publication.format.replace('_', ' ').toLowerCase()}</p></button><span className="rounded-full bg-[#f1edf5] px-2 py-1 text-[9px] font-bold text-[#766681]">{publication.state.replaceAll('_', ' ')}</span>{publication.state === 'FAILED' && <button onClick={async () => { try { await retryDesignerPublication(publication.id, csrf); await onChanged(); toast.success('Retry queued') } catch (error) { toast.error(message(error)) } }} className="rounded-lg border border-[#ded9e7] px-2 py-1 text-[10px] font-semibold">Retry</button>}</div>)}</div></section>
}
