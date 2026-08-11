import { describe, expect, it } from 'vitest';

import {
  SAMPLE_APPS,
  SAMPLE_CLIENTS,
  SAMPLE_ENDPOINT,
  SAMPLE_MODELS,
  sampleUsage,
} from '../src/renderer/lib/sample-settings.js';
import { groupByKind } from '../src/renderer/lib/settings.js';

/**
 * Sample content, checked for the two things that would make it a defect.
 *
 * The first is a credential. This repository holds none, and a module of
 * example values is exactly where one gets committed by accident.
 *
 * The second is content that does not exercise the surface it is there to
 * fill: a catalogue with one group, an application list with one state.
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

  it('covers every application state', () => {
    expect(new Set(SAMPLE_APPS.map((app) => app.status))).toEqual(
      new Set(['ready', 'not-installed', 'coming-soon']),
    );
  });

  it('dates its events from the clock it is given', () => {
    const now = 1_700_000_000_000;
    for (const event of sampleUsage(now).events) {
      expect(event.atMs).toBeLessThan(now);
    }
  });
});
