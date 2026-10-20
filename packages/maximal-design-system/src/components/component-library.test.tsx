import { readdirSync, readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DEFAULT_PALETTE_FIXTURE } from '../color/fixtures'
import { paletteTokens } from '../color/palette'
import {
  Autocomplete,
  Checkbox,
  Field,
  Fieldset,
  NumberInput,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Switch,
  UnitValueInput,
} from './form-controls'
import { Icon } from './icon'
import { Tabs, ToggleGroup, Toolbar, ToolbarButton } from './navigation-controls'
import {
  Accordion,
  Avatar,
  Callout,
  Card,
  Collapsible,
  InspectorPanel,
  Property,
  PropertyList,
  ScrollArea,
  Separator,
  StatusChip,
} from './surfaces'
import { SearchIcon } from '../icons'

describe('form controls', () => {
  it('render Base UI semantics with Maximal classes', () => {
    const markup = renderToStaticMarkup(
      <div>
        <Select
          defaultValue="one"
          label="Choice"
          options={[{ label: 'One', value: 'one' }]}
        />
        <Checkbox defaultChecked label="Check" />
        <RadioGroup
          aria-label="Radio"
          defaultValue="one"
          options={[{ label: 'One', value: 'one' }]}
        />
        <Switch defaultChecked label="Switch" />
        <Slider defaultValue={25} label="Amount" />
        <NumberInput defaultValue={4} label="Count" />
        <Field label="Notes" textareaProps={{ defaultValue: 'Text' }} />
      </div>,
    )

    expect(markup).toContain('class="maximal-select"')
    expect(markup).toContain('role="checkbox"')
    expect(markup).toContain('role="radio"')
    expect(markup).toContain('role="switch"')
    expect(markup).toContain('type="range"')
    expect(markup).toContain('>Amount</')
    expect(markup).toContain('class="maximal-number-input')
    expect(markup).toContain('<textarea')
  })

  it('forwards native attributes to primary controls and explicit slots', () => {
    const markup = renderToStaticMarkup(
      <div>
        <Select
          options={[{ label: 'One', value: 'one' }]}
          triggerProps={{ 'data-testid': 'select' }}
        />
        <Checkbox data-testid="checkbox" label="Check" />
        <Radio data-testid="radio" label="Radio" value="radio" />
        <RadioGroup
          aria-label="Radio group"
          data-testid="radio-group"
          options={[{ label: 'One', value: 'one' }]}
        />
        <Switch data-testid="switch" label="Switch" />
        <Slider data-testid="slider" defaultValue={25} label="Amount" />
        <NumberInput
          defaultValue={4}
          inputProps={{ 'data-testid': 'number' }}
          label="Count"
        />
        <UnitValueInput
          data-testid="unit-value"
          defaultUnit="px"
          label="Size"
          onCommit={() => undefined}
          unitSelectTriggerProps={{ 'data-testid': 'unit-value-unit' }}
          units={[{
            fromCanonical: (value) => value,
            label: 'px',
            step: 1,
            toCanonical: (value) => value,
            value: 'px',
          }]}
          value={4}
        />
        <Field
          label="Notes"
          textareaProps={{ 'data-testid': 'field' }}
        />
        <Fieldset data-testid="fieldset" legend="Group">
          Content
        </Fieldset>
        <Autocomplete
          inputProps={{ 'data-testid': 'autocomplete' }}
          items={['One']}
          label="Search"
        />
      </div>,
    )

    for (const testId of [
      'select',
      'checkbox',
      'radio',
      'radio-group',
      'switch',
      'slider',
      'number',
      'unit-value',
      'unit-value-unit',
      'field',
      'fieldset',
      'autocomplete',
    ]) {
      expect(markup).toContain(`data-testid="${testId}"`)
    }
    expect(markup).not.toContain('testId=')
  })
})

describe('selectable surfaces', () => {
  it('expose option selection semantics', () => {
    const markup = renderToStaticMarkup(
      <div role="listbox">
        <Callout onSelect={() => undefined} selected={false} title="Callout">
          Body
        </Callout>
        <Card onSelect={() => undefined} selected>
          Card
        </Card>
      </div>,
    )

    expect(markup).toContain('class="maximal-card"')
    expect(markup).toContain('role="option"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('class="maximal-callout"')
    expect(markup).toContain('aria-selected="false"')
    expect(markup).toMatch(
      /role="listbox"><button(?=[^>]*role="option")(?=[^>]*class="maximal-callout")[^>]*>/,
    )
  })

  it('render the remaining surface primitives with owned classes', () => {
    const markup = renderToStaticMarkup(
      <div>
        <Avatar alt="Maximal" />
        <ScrollArea>Scrollable</ScrollArea>
        <Collapsible title="Details">Content</Collapsible>
        <Accordion
          items={[{ content: 'Panel', title: 'Section', value: 'section' }]}
        />
        <Separator />
        <StatusChip label="Ready" status="ready" />
        <InspectorPanel title="Inspector">
          <PropertyList>
            <Property label="State" value="Ready" />
          </PropertyList>
        </InspectorPanel>
      </div>,
    )

    expect(markup).toContain('class="maximal-avatar"')
    expect(markup).toContain('class="maximal-scroll-area')
    expect(markup).toContain('class="maximal-collapsible')
    expect(markup).toContain('class="maximal-accordion')
    expect(markup).toContain('class="maximal-separator"')
    expect(markup).toContain('class="maximal-status-chip"')
    expect(markup).toContain('data-status="ready"')
    expect(markup).toContain('class="maximal-inspector-panel"')
    expect(markup).toContain('<dl class="maximal-property-list"')
    expect(markup).toContain('<dt class="maximal-property__label">State</dt>')
    expect(markup).toContain('<dd class="maximal-property__value">Ready</dd>')
  })
})

describe('navigation controls', () => {
  it('compose Base UI tabs, toolbar, and toggle group behavior', () => {
    const markup = renderToStaticMarkup(
      <div>
        <Tabs
          defaultValue="one"
          items={[{ content: 'Panel', label: 'One', value: 'one' }]}
        />
        <Toolbar aria-label="Tools">
          <ToolbarButton>Tool</ToolbarButton>
        </Toolbar>
        <ToggleGroup
          aria-label="Alignment"
          defaultValue={['left']}
          options={[{ label: 'Left', value: 'left' }]}
        />
      </div>,
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('class="maximal-toggle-group')
    expect(markup).toContain('aria-pressed="true"')
  })
})

describe('Icon', () => {
  it('maps glyphs to the existing icon size roles', () => {
    const markup = renderToStaticMarkup(
      <Icon label="Search" size="prominent">
        <SearchIcon />
      </Icon>,
    )

    expect(markup).toContain('class="maximal-icon"')
    expect(markup).toContain('data-size="prominent"')
    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="Search"')
  })
})

describe('component token ownership', () => {
  it('resolves every new component reference inside maximal-design-system', () => {
    const storyRoot = new URL('../../stories/', import.meta.url)
    const files = [
      new URL('../styles/components.css', import.meta.url),
      ...readdirSync(storyRoot, {
        encoding: 'utf8',
        recursive: true,
      })
        .filter((file) => file.endsWith('.stories.tsx'))
        .map((file) => new URL(file, storyRoot)),
    ]
    const references = new Set(
      files.flatMap((file) =>
        [...readFileSync(file, 'utf8')
          .matchAll(/var\((--[a-zA-Z0-9-]+)/g)]
          .flatMap((match) => match[1] === undefined ? [] : [match[1]]),
      ),
    )
    const generatedTokens = readFileSync(
      new URL('../../dist/tokens/tokens.css', import.meta.url),
      'utf8',
    )
    const palette = paletteTokens(DEFAULT_PALETTE_FIXTURE.colors)

    for (const reference of references) {
      if (reference.startsWith('--maximal-color-')) {
        expect(
          palette.light,
          `${reference} must be owned by the design-system palette`,
        ).toHaveProperty(reference)
      } else {
        expect(
          generatedTokens,
          `${reference} must be owned by generated design-system tokens`,
        ).toContain(`${reference}:`)
      }
    }
  })
})
