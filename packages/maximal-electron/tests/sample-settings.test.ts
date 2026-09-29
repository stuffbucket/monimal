import { describe, expect, it } from 'vitest';

import {
  SAMPLE_CLIENTS,
  SAMPLE_ENDPOINT,
  SAMPLE_MODELS,
} from '../.storybook/sample-settings.js';
import { groupByKind } from '../src/renderer/lib/settings.js';

/**
 * Sample content, checked for the two things that would make it a defect.
 *
 * The first is a credential. This repository holds none, and a module of
 * example values is exactly where one gets committed by accident.
 *
 * The second is content that does not exercise the surface it is there to
 * fill, such as a catalogue with one group.
 */

describe('the sample settings content', () => {
  it('carries no key on the endpoint', () => {
    expect(SAMPLE_ENDPOINT.key).toBeUndefined();
  });

  it('names its client values as examples rather than as secrets', () => {
    for (const client of SAMPLE_CLIENTS) {
      expect(client.key, client.label).toContain('not-a-real-key');
    }
  });

  it('covers more than one kind of model, so the grouping shows', () => {
    expect(groupByKind(SAMPLE_MODELS).length).toBeGreaterThan(1);
  });
});
