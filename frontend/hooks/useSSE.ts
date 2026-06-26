'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { StatusResponse } from '@/lib/api'

type SSEPayload = Pick<StatusResponse, 'doc_id' | 'status' | 'progress'>

interface UseSSEOptions {
  docId: string
  onUpdate: (data: SSEPayload) => void
  onDone?: () => void
  enabled?: boolean
}

const TERMINAL = new Set(['completed', 'failed'])

export function useSSE({ docId, onUpdate, onDone, enabled = true }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null)
  const onUpdateRef = useRef(onUpdate)
  const onDoneRef = useRef(onDone)
  onUpdateRef.current = onUpdate
  onDoneRef.current = onDone

  const close = useCallback(() => {
    esRef.current?.close()
    esRef.current = null
  }, [])

  useEffect(() => {
    if (!enabled) return
    const es = new EventSource(`/api/v1/documents/${docId}/events`)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const data: SSEPayload = JSON.parse(e.data)
        onUpdateRef.current(data)
        if (TERMINAL.has(data.status)) {
          close()
          onDoneRef.current?.()
        }
      } catch {
        // malformed event — ignore
      }
    }

    es.onerror = () => {
      close()
      onDoneRef.current?.()
    }

    return close
  }, [docId, enabled, close])
}
