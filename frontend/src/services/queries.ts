/** React Query hooks over the async API. Errors surface to the UI; nothing silently falls back to mock data. */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "./api";
import type { GraphNode } from "@/types";

const base = { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1, retryDelay: 800 } as const;

export const useGraph = () => useQuery({ queryKey: ["graph"], queryFn: api.getGraph, ...base });
export const useNode = (id: string | null) => useQuery({ queryKey: ["node", id], queryFn: () => api.getNode(id!), enabled: !!id, ...base });
export const useNeighbors = (id: string | null) => useQuery({ queryKey: ["neighbors", id], queryFn: () => api.getNeighbors(id!), enabled: !!id, ...base });
export const useOverview = () => useQuery({ queryKey: ["overview"], queryFn: api.getOverviewGraph, ...base });
export const useFailurePath = () => useQuery({ queryKey: ["failure-path"], queryFn: api.getFailurePath, ...base });
export const useDemoPath = () => useQuery({ queryKey: ["demo-path"], queryFn: api.getDemoPath, ...base });
export const useIncidents = () => useQuery({ queryKey: ["incidents"], queryFn: api.getIncidents, ...base });
export const useActivity = () => useQuery({ queryKey: ["activity"], queryFn: api.getActivity, ...base });
export const useScenarios = () => useQuery({ queryKey: ["scenarios"], queryFn: api.getScenarios, ...base });
export const useMemoryRecords = () => useQuery({ queryKey: ["memory"], queryFn: api.getMemory, ...base });
export const useEvidence = () => useQuery({ queryKey: ["evidence"], queryFn: api.getEvidence, ...base });
export const useRelationDescriptions = () => useQuery({ queryKey: ["relation-descriptions"], queryFn: api.getRelationDescriptions, staleTime: Infinity, retry: 1 });
export const useIntegrations = (poll = false) =>
  useQuery({ queryKey: ["integrations"], queryFn: api.getIntegrations, staleTime: 3_000, refetchInterval: poll ? 15_000 : false, retry: false, refetchOnWindowFocus: true });
export const useRun = (id: string | null | undefined) =>
  useQuery({ queryKey: ["run", id], queryFn: () => api.getInvestigation(id!), enabled: !!id, ...base });
export const useRunList = () => useQuery({ queryKey: ["runs"], queryFn: api.listInvestigations, ...base });
export const useTrace = (id: string | null, enabled: boolean) =>
  useQuery({ queryKey: ["trace", id], queryFn: () => api.getTrace(id!), enabled: enabled && !!id, ...base });

/** Look up graph nodes by id from the already-loaded graph. Unknown ids resolve to undefined. */
export function useNodeIndex(): { get: (id: string) => GraphNode | undefined; query: UseQueryResult<{ nodes: GraphNode[] }> } {
  const query = useGraph();
  const map = useMemo(() => new Map((query.data?.nodes ?? []).map((n) => [n.id, n])), [query.data]);
  const get = useCallback((id: string) => map.get(id), [map]);
  return { get, query };
}
