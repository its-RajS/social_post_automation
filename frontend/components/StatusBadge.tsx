import { cn } from '@/lib/utils'

type Status = 'pending' | 'processing' | 'completed' | 'failed'

const config: Record<Status, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-zinc-100 text-zinc-500' },
  processing: { label: 'Processing', className: 'bg-amber-50 text-amber-600' },
  completed: { label: 'Completed', className: 'bg-green-50 text-[#16A34A]' },
  failed: { label: 'Failed', className: 'bg-red-50 text-[#DC2626]' },
}

export function StatusBadge({ status }: { status: Status }) {
  const { label, className } = config[status] ?? config.pending
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {(status === 'pending' || status === 'processing') && (
        <span className="size-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  )
}
