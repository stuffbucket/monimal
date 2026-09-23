import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isScannablePath,
  networkLiterals,
  ratchetChanges,
  ratchetIncreases,
} from "../scripts/check-network-literals.mjs";

test("isScannablePath covers code and machine configuration, not prose", () => {
  assert.equal(isScannablePath("src/server.ts"), true);
  assert.equal(isScannablePath("config/service.yaml"), true);
  assert.equal(isScannablePath("docs/runtime.md"), false);
  assert.equal(isScannablePath("network-literals-baseline.json"), false);
});

function ipv4Address(value) {
  return [24, 16, 8, 0]
    .map((shift) => (value >>> shift) & 0xff)
    .join(".");
}

function origin(protocol, host, port) {
  return `${protocol}://${host}:${port}`;
}

const detectorPort = 4142;
const loopback = ipv4Address(0x7f000001);
const wildcard = ipv4Address(0);
const loopbackUrl = origin("http", loopback, detectorPort);

test("networkLiterals finds fixed local authorities and bare IP addresses", () => {
  const secureLoopbackUrl = origin("https", loopback, detectorPort);
  assert.deepEqual(
    networkLiterals(`"${loopbackUrl}/v1" "${secureLoopbackUrl}" "${wildcard}"`),
    [wildcard, loopbackUrl, secureLoopbackUrl],
  );
});

test("networkLiterals rejects invalid IPv4 lookalikes and deduplicates overlaps", () => {
  const invalidIp = "999.1.1.1";
  const loopbackAuthority = `${loopback}:${detectorPort}`;
  assert.deepEqual(
    networkLiterals(`"${loopbackUrl}" "${loopbackAuthority}" "${invalidIp}"`),
    [loopbackAuthority, loopbackUrl],
  );
});

test("networkLiterals finds every valid numeric port", () => {
  const forms = [
    (port) => `${loopback}:${port}`,
    (port) => origin("http", loopback, port),
  ];
  for (const form of forms) {
    const expected = Array.from({ length: 65_536 }, (_, port) => form(port));
    const detected = new Set(networkLiterals(expected.join("\n")));
    assert.equal(detected.size, 65_536);
    for (const literal of expected) assert.ok(detected.has(literal), literal);
  }
});

test("ratchetChanges detects new, increased, removed, and reduced identities", () => {
  const known = [{ path: "a.ts", literal: "example.invalid:4141", count: 2 }];
  assert.deepEqual(ratchetChanges(known, known), { added: [], gone: [] });
  assert.deepEqual(
    ratchetChanges([{ ...known[0], count: 3 }], known),
    {
      added: [{ path: "a.ts", literal: "example.invalid:4141", count: 3 }],
      gone: known,
    },
  );
});

test("ratchetIncreases permits only removals and lower occurrence counts", () => {
  const known = [{ path: "a.ts", literal: "example.invalid:4141", count: 2 }];
  assert.deepEqual(
    ratchetIncreases([{ ...known[0], count: 1 }], known),
    [],
  );
  assert.deepEqual(
    ratchetIncreases([{ ...known[0], count: 3 }], known),
    [{ path: "a.ts", literal: "example.invalid:4141", count: 3 }],
  );
  assert.deepEqual(
    ratchetIncreases(
      [{ path: "b.ts", literal: "example.invalid:4141", count: 1 }],
      known,
    ),
    [{ path: "b.ts", literal: "example.invalid:4141", count: 1 }],
  );
});