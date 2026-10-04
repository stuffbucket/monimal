import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import { SpatialCanvas } from './SpatialCanvas.js';
import {
  SpatialCanvasSearchResult,
  SpatialCanvasSearchResults,
} from './SpatialCanvasSearch.js';

const meta = {
  title: 'Canvas/SpatialCanvasSearch',
  component: SpatialCanvasSearchResults,
} satisfies Meta<typeof SpatialCanvasSearchResults>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {
  args: {
    children: null,
    emptyMessage: 'No projects match',
  },
  render: () => (
    <SpatialCanvas>
      <SpatialCanvasSearchResults emptyMessage="No projects match">
        <SpatialCanvasSearchResult
          title="maximal-electron"
          description="/workspace/packages/maximal-electron"
          onSelect={() => undefined}
        />
        <SpatialCanvasSearchResult
          title="project-catalog"
          description="/workspace/packages/project-catalog"
          onSelect={() => undefined}
        />
      </SpatialCanvasSearchResults>
    </SpatialCanvas>
  ),
};
