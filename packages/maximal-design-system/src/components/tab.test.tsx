import { Tabs } from '@base-ui/react/tabs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Tab } from './tab'

describe('Tab', () => {
  it('adds Maximal styling and content to a Base UI tab trigger', () => {
    const markup = renderToStaticMarkup(
      <Tabs.Root value="details">
        <Tabs.List>
          <Tab
            active
            className="consumer-tab"
            icon={<svg data-icon="details" />}
            label="Details"
            onClose={() => undefined}
            value="details"
          />
        </Tabs.List>
      </Tabs.Root>,
    )

    expect(markup).toContain('role="tab"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('class="maximal-tab consumer-tab"')
    expect(markup).toContain('data-icon="details"')
    expect(markup).toContain('<span>Details</span>')
    expect(markup).toContain('maximal-tab__close-icon')
  })

  it('omits the close affordance when the tab is inactive or not closable', () => {
    const inactive = renderToStaticMarkup(
      <Tabs.Root value="other">
        <Tabs.List>
          <Tab label="Details" onClose={() => undefined} value="details" />
          <Tab active closable={false} label="Other" value="other" />
        </Tabs.List>
      </Tabs.Root>,
    )

    expect(inactive).not.toContain('maximal-tab__close-icon')
  })
})
