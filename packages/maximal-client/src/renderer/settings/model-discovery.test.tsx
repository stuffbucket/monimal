import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ModelDiscoverySnapshot } from "../../shared/host";
import { MaximalQueryProvider } from "../query-client";
import { ModelDiscoverySection } from "./local-models/ModelDiscoverySection";
import { acceptDiscoverySnapshot } from "./local-models/useModelDiscovery";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function snapshot(): ModelDiscoverySnapshot {
  return { schemaVersion: 1, id: null, revision: 0, state: "idle", includeLocalNetwork: false, networkScopes: [{ id: "eth-test/192.168.0.0/24", interfaceName: "eth-test", cidr: "192.168.0.0/24", hostCount: 254 }], endpoints: [], completedProbes: 0, totalProbes: 0, truncated: false, message: null };
}

describe("model discovery settings", () => {
  it("a stale poll cannot overwrite cancellation or a newer revision", () => {
    const cancelled = { ...snapshot(), id: "one", revision: 10, state: "cancelled" as const };
    expect(acceptDiscoverySnapshot(cancelled, { ...snapshot(), id: "one", revision: 9, state: "running" })).toBe(cancelled);
    const next = { ...snapshot(), id: "two", revision: 1 };
    expect(acceptDiscoverySnapshot(cancelled, next)).toBe(next);
  });

  it("renders exact LAN scope but defaults to device-only metadata discovery", async () => {
    const calls = vi.fn((request: { action: string }) => Promise.resolve(request.action === "describe" ? snapshot() : { ...snapshot(), id: "scan", state: "completed" as const }));
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<MaximalQueryProvider><ModelDiscoverySection capabilities={{ modelDiscovery: { act: calls } }} /></MaximalQueryProvider>));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
      const checkbox = container.querySelector("input");
      expect(checkbox?.checked).toBe(false);
      expect(container.textContent).toContain("eth-test: 192.168.0.0/24");
      expect(calls.mock.calls).toEqual([[{ action: "describe" }]]);
      const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "Discover models");
      await act(async () => button?.click());
      expect(calls).toHaveBeenCalledWith({ action: "start", includeLocalNetwork: false, networkScopeIds: [] });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
      await act(async () => checkbox?.click());
      const refresh = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "Refresh discovery");
      await act(async () => refresh?.click());
      expect(calls).toHaveBeenCalledWith({ action: "start", includeLocalNetwork: true, networkScopeIds: ["eth-test/192.168.0.0/24"] });
    } finally { act(() => root.unmount()); }
  });

  it("older hosts retain an explicit unsupported state", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<MaximalQueryProvider><ModelDiscoverySection capabilities={{}} /></MaximalQueryProvider>));
      expect(container.textContent).toContain("unavailable on this host");
      expect(container.querySelector("button")).toBeNull();
    } finally { act(() => root.unmount()); }
  });
});
