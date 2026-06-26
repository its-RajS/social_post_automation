'use client'

import { useQuery } from '@tanstack/react-query'
import { getDocumentStatus, type StatusResponse } from '@/lib/api'

const TERMINAL = new Set(['completed', 'failed'])

export function useDocumentStatus(docId: string, initialData?: StatusResponse) {
  return useQuery({
    queryKey: ['document', docId, 'status'],
    queryFn: () => getDocumentStatus(docId),
    initialData,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.has(status) ? false : 3000
    },
    staleTime: 0,
  })
}
