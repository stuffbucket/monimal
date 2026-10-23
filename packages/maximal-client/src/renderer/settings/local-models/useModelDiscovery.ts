import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ModelDiscoverySnapshot } from "../../../shared/host";
import type { SettingsCapabilities } from "../capabilities";

const scopeKey = ["settings", "local-models", "discovery", "scope"] as const;
const sessionKey = (id: string | null) => ["settings", "local-models", "discovery", "session", id] as const;

/** A delayed poll cannot undo cancellation or replace a newer session revision. */
export function acceptDiscoverySnapshot(previous: ModelDiscoverySnapshot | null | undefined, next: ModelDiscoverySnapshot | null) {
  if (previous && next && previous.id === next.id && previous.revision > next.revision) return previous;
  return next;
}

export function useModelDiscovery(capabilities: Pick<SettingsCapabilities, "modelDiscovery">) {
  const service = capabilities.modelDiscovery;
  const client = useQueryClient();
  const [includeLocalNetwork, setIncludeLocalNetwork] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const scopes = useQuery({
    queryKey: scopeKey,
    queryFn: () => service?.act({ action: "describe" }) ?? null,
    enabled: service !== undefined,
    retry: false,
    staleTime: 0,
  });
  const session = useQuery({
    queryKey: sessionKey(id),
    queryFn: async () => {
      const next = id && service ? await service.act({ action: "read", id }) : null;
      return acceptDiscoverySnapshot(client.getQueryData<ModelDiscoverySnapshot | null>(sessionKey(id)), next);
    },
    enabled: service !== undefined && id !== null,
    refetchInterval: (query) => query.state.status !== "error" && query.state.data?.state === "running" ? 300 : false,
    retry: false,
  });
  const start = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("Model discovery requires an updated desktop host.");
      return service.act({ action: "start", includeLocalNetwork, networkScopeIds: includeLocalNetwork ? [selectedScopeId ?? scopes.data?.networkScopes[0]?.id ?? ""] : [] });
    },
    onSuccess: (result) => {
      cancel.reset();
      client.setQueryData(sessionKey(result.id), result);
      setId(result.id);
    },
  });
  const cancel = useMutation({
    mutationFn: async () => {
      if (!service || !id) throw new Error("No discovery session is running.");
      return service.act({ action: "cancel", id });
    },
    onSuccess: (result) => client.setQueryData<ModelDiscoverySnapshot | null>(sessionKey(result.id), (old) => acceptDiscoverySnapshot(old, result)),
  });
  return {
    available: service !== undefined,
    selectedScopeId: selectedScopeId ?? scopes.data?.networkScopes[0]?.id ?? "",
    setSelectedScopeId,
    includeLocalNetwork, setIncludeLocalNetwork,
    scopes, session, start, cancel,
    running: session.data?.state === "running" && !session.isError,
    error: cancel.error ?? start.error ?? session.error ?? scopes.error,
  };
}
