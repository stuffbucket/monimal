import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  AppFrame,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  SurfaceTop,
} from './AppFrame.js';

const meta = {
  title: 'Shell/AppFrame',
  component: AppFrame,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppFrame>;

export default meta;

export const Default: StoryObj = {
  render: () => (
    <div style={{ height: 560 }}>
      <AppFrame
        layoutId="frame-story"
        tabs={[{ id: 'document', title: 'Document' }]}
        activeTab="document"
        onSelectTab={() => undefined}
        withLeft
        withRight
        withStatus
      >
        <SurfaceTop><div className="banner">Connected</div></SurfaceTop>
        <SurfaceRail>{(collapsed) => <nav className="nav">{collapsed ? null : 'Sections'}</nav>}</SurfaceRail>
        <main className="canvas">Document content</main>
        <SurfaceRight><aside className="inspector">Inspector</aside></SurfaceRight>
        <SurfaceStatus><span>Ready</span></SurfaceStatus>
      </AppFrame>
    </div>
  ),
};