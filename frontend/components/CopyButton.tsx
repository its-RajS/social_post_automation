'use client'

import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded p-1 text-[#6C757D] hover:text-[#212529] hover:bg-[#F8F9FA] transition-colors"
      aria-label="Copy document ID"
    >
      {copied ? <Check className="size-3.5 text-[#16A34A]" /> : <Copy className="size-3.5" />}
    </button>
  )
}
