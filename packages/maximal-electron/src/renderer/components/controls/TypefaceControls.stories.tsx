import { useState } from 'react';
import type { Meta, StoryObj } from '@maximal/maximal-storybook';

import { NumberInput } from './NumberInput.js';
import { TypefaceControls } from './TypefaceControls.js';
import {
  UnitValueInput,
  type MeasurementUnit,
} from './UnitValueInput.js';

const PERCENT_UNITS: readonly MeasurementUnit<'percent' | 'em'>[] = [
  {
    value: 'percent',
    label: '%',
    step: 1,
    fromCanonical: (value) => value + 100,
    toCanonical: (value) => value - 100,
  },
  {
    value: 'em',
    label: 'em',
    step: 0.01,
    fromCanonical: (value) => 1 + (value / 100),
    toCanonical: (value) => (value - 1) * 100,
  },
];

function TypefaceControlsStory() {
  const [family, setFamily] = useState('Mono Sans');
  const [style, setStyle] = useState('normal');
  const [weight, setWeight] = useState(400);
  const [lineHeight, setLineHeight] = useState(0);
  const [tracking, setTracking] = useState(0);

  return (
    <div className="sb-shell" style={{ maxWidth: 560 }}>
      <TypefaceControls
        family={{
          label: 'Family',
          value: family,
          options: [
            { value: 'Mono Sans', label: 'Mono Sans' },
            { value: 'System Mono', label: 'System Mono' },
          ],
          onChange: setFamily,
        }}
        style={{
          label: 'Style',
          value: style,
          options: [
            { value: 'normal', label: 'Regular' },
            { value: 'italic', label: 'Italic' },
          ],
          onChange: setStyle,
        }}
        weight={{
          value: weight,
          minimum: 100,
          maximum: 900,
          step: 1,
          onCommit: setWeight,
        }}
        metrics={[
          {
            id: 'story-line-height',
            label: 'Line height',
            value: lineHeight,
            units: PERCENT_UNITS,
            defaultUnit: 'percent',
            autoValue: 0,
            canonicalStep: 0.1,
            onCommit: setLineHeight,
          },
          {
            id: 'story-tracking',
            label: 'Letter spacing',
            value: tracking,
            units: PERCENT_UNITS,
            defaultUnit: 'percent',
            autoValue: 0,
            canonicalStep: 0.1,
            onCommit: setTracking,
          },
        ]}
      >
        <NumberInput
          aria-label="Grade"
          value={0}
          min={-100}
          max={100}
          onCommit={() => undefined}
        />
        <UnitValueInput
          label="Custom metric"
          value={0}
          units={PERCENT_UNITS}
          defaultUnit="percent"
          onCommit={() => undefined}
        />
      </TypefaceControls>
    </div>
  );
}

const meta = {
  title: 'Controls/Typeface controls',
  component: TypefaceControls,
  args: {
    family: {
      label: 'Family',
      value: 'Mono Sans',
      options: [{ value: 'Mono Sans', label: 'Mono Sans' }],
      onChange: () => undefined,
    },
    style: {
      label: 'Style',
      value: 'normal',
      options: [{ value: 'normal', label: 'Regular' }],
      onChange: () => undefined,
    },
    weight: {
      value: 400,
      minimum: 100,
      maximum: 900,
      step: 1,
      onCommit: () => undefined,
    },
    metrics: [],
  },
  render: () => <TypefaceControlsStory />,
} satisfies Meta<typeof TypefaceControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
