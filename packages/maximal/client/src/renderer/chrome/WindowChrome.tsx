import type { ReactElement, ReactNode } from 'react'
import { WindowChrome as PackageWindowChrome } from 'stuffbucket-electron/renderer'

export function WindowChrome({ children }: { children: ReactNode }): ReactElement {
  return (
    <PackageWindowChrome
      layoutId="maximal-chrome"
      tab={{ id: 'maximal', title: 'Maximal' }}
      tabsLabel="Maximal"
    >
      {children}
    </PackageWindowChrome>
  )
}
