import type { ReactElement } from "react";
import type { DiscoveredModelEndpoint } from "@maximal/maximal-model-contract";
import { Button } from "@maximal/maximal-electron/renderer";
import type { SettingsCapabilities } from "../capabilities";
import { describeError } from "../../shared/errors";
import { useModelDiscovery } from "./useModelDiscovery";

type Discovery = ReturnType<typeof useModelDiscovery>;

function EndpointResult({ endpoint }: { endpoint: DiscoveredModelEndpoint }): ReactElement {
  return (
    <details className="settings-card">
      <summary><bdi>{endpoint.url}</bdi> · {endpoint.models.length} served model IDs</summary>
      <p>{endpoint.scope === "device" ? "This-device endpoint" : "Local-network endpoint"} · {endpoint.runtime ?? endpoint.protocol}</p>
      <p>Reachability: responded to metadata probe. Isolation: unverified. Reachability does not prove readiness or sandbox safety.</p>
      <p>Observed {new Date(endpoint.observedAt).toLocaleString()}. Refresh before connecting.</p>
      {endpoint.authenticationRequired ? <p>Authentication required. Service type is unverified; no stored credentials were sent.</p> : null}
      <ul>{endpoint.models.map((model) => (
        <li key={model.id}><bdi>{model.name}</bdi> — execution location: {model.executionLocation}
          {model.configuredTargetId ? <> · configured deployment <bdi>{model.configuredTargetId}</bdi></> : null}
        </li>
      ))}</ul>
      <p>These IDs may be aliases, not distinct verified variants. Discovery lists at most 128 IDs per endpoint and does not connect, load, install, publish, or share models.</p>
    </details>
  );
}

function NetworkScope({ discovery, busy }: { discovery: Discovery; busy: boolean }): ReactElement {
  const scopes = discovery.scopes.data?.networkScopes ?? [];
  return <>
    <label>
      <input type="checkbox" checked={discovery.includeLocalNetwork} disabled={busy || scopes.length === 0} onChange={(event) => discovery.setIncludeLocalNetwork(event.target.checked)} />
      Also discover the Local network
    </label>
    {scopes.length > 0 ? <p>Available LAN scope: {scopes.map((scope) => `${scope.interfaceName}: ${scope.cidr} (${scope.hostCount} hosts)`).join("; ")}. Select one private interface scope below; unsupported interfaces are excluded.</p> : null}
    {discovery.includeLocalNetwork ? <label>Scan this LAN interface <select disabled={busy} value={discovery.selectedScopeId} onChange={(event) => discovery.setSelectedScopeId(event.target.value)}>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.interfaceName}: {scope.cidr}</option>)}</select></label> : null}
    <Button disabled={busy || discovery.scopes.isFetching} onClick={() => void discovery.scopes.refetch()}>Refresh interface scope</Button>
  </>;
}

function DiscoveryControls({ discovery }: { discovery: Discovery }): ReactElement {
  const busy = discovery.running || discovery.start.isPending || discovery.cancel.isPending;
  const disabled = busy || discovery.scopes.isPending || discovery.scopes.isError;
  return <>
    <NetworkScope discovery={discovery} busy={busy} />
    <Button disabled={disabled} onClick={() => discovery.start.mutate()}>{discovery.session.data ? "Refresh discovery" : "Discover models"}</Button>
    {discovery.running ? <Button disabled={discovery.cancel.isPending} onClick={() => discovery.cancel.mutate()}>Cancel discovery</Button> : null}
  </>;
}

function DiscoveryResults({ discovery }: { discovery: Discovery }): ReactElement {
  const result = discovery.session.data;
  const message = result?.message ?? discovery.scopes.data?.message;
  return <>
    {discovery.error ? <p role="alert">Discovery failed: {describeError(discovery.error)}</p> : null}
    <p role="status">{result ? `${result.state}: ${result.completedProbes}/${result.totalProbes} endpoint probes` : "This device selected; Local network is off by default."}</p>
    {message ? <p>{message}</p> : null}
    {result?.state === "completed" && result.endpoints.length === 0 ? <p>No compatible service metadata found in this bounded scan. Discovery does not cover arbitrary ports; configure a reviewed runtime/provider endpoint manually.</p> : null}
    {result?.endpoints.map((endpoint) => <EndpointResult key={endpoint.id} endpoint={endpoint} />)}
  </>;
}

export function ModelDiscoverySection({ capabilities }: { capabilities: Pick<SettingsCapabilities, "modelDiscovery"> }): ReactElement {
  const discovery = useModelDiscovery(capabilities);
  const unsupported = !discovery.available || discovery.scopes.data?.state === "unsupported";
  return (
    <section aria-labelledby="model-discovery-heading">
      <h2 id="model-discovery-heading">Discover model services</h2>
      <p>Start with This device. Discovery only reads supported service metadata; it never runs inference or changes existing providers.</p>
      {unsupported ? <p>Model discovery is unavailable on this host. Update the desktop client; existing provider settings remain available below.</p> : <DiscoveryControls discovery={discovery} />}
      <p>A local endpoint may forward requests elsewhere. Probe location is not proof of where inference runs.</p>
      <DiscoveryResults discovery={discovery} />
    </section>
  );
}
