import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useState, type ReactElement, type ReactNode } from 'react'

export function createMaximalQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  })
}

export function MaximalQueryProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [queryClient] = useState(createMaximalQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
