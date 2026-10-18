import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/services/api";
import { useRun, useRunList, useScenarios } from "@/services/queries";
import type { ApiError } from "@/services/http";
import type { InvestigationRun, Scenario } from "@/types";

type Phase = "idle" | "running" | "complete" | "error";

interface InvestigationState {
  scenarios: Scenario[];
  scenariosError: unknown;
  scenarioId: string;
  description: string;
  logs: string;
  phase: Phase;
  result: InvestigationRun | null;
  /** true when the shown result was loaded from FalkorDB history rather than run in this browser session */
  restored: boolean;
  error: ApiError | null;
  reverifying: boolean;
  setScenario: (id: string) => void;
  setDescription: (v: string) => void;
  setLogs: (v: string) => void;
  run: () => void;
  reverify: () => void;
  reset: () => void;
}

const Ctx = createContext<InvestigationState | null>(null);

export function InvestigationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const scenariosQ = useScenarios();
  const scenarios = useMemo(() => scenariosQ.data ?? [], [scenariosQ.data]);
  const [scenarioId, setScenarioId] = useState("");
  const [description, setDescription] = useState("");
  const [logs, setLogs] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Initialise the form once scenarios arrive from the backend.
  useEffect(() => {
    if (!scenarioId && scenarios[0]) {
      setScenarioId(scenarios[0].id);
      setDescription(scenarios[0].description);
      setLogs(scenarios[0].logs);
    }
  }, [scenarios, scenarioId]);

  // Persistent history: the latest stored investigation is loaded from FalkorDB.
  const runsQ = useRunList();
  const latestId = runsQ.data?.[0]?.investigationId ?? null;
  const storedQ = useRun(latestId);

  const refreshAfterRun = useCallback(() => {
    for (const key of ["memory", "evidence", "activity", "incidents", "graph", "overview", "runs", "integrations", "steps"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);

  const runMut = useMutation<InvestigationRun, ApiError, void>({
    mutationFn: () => api.runInvestigation({ scenarioId, description, logs }),
    onSuccess: (r) => {
      setDismissed(null);
      qc.setQueryData(["run", r.investigationId], r);
      refreshAfterRun();
    },
  });
  const verifyMut = useMutation<InvestigationRun, ApiError, string>({
    mutationFn: (id) => api.verifyInvestigation(id),
    onSuccess: (r) => {
      qc.setQueryData(["run", r.investigationId], r);
      runMut.reset();
      refreshAfterRun();
    },
  });

  const override = verifyMut.data ?? runMut.data ?? null;
  const stored = storedQ.data && storedQ.data.investigationId !== dismissed ? storedQ.data : null;
  const result = override ?? stored;
  const restored = !override && !!stored;
  const phase: Phase = runMut.isPending ? "running" : runMut.isError ? "error" : result ? "complete" : "idle";

  const setScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id) ?? scenarios[0];
    if (!s) return;
    setScenarioId(s.id);
    setDescription(s.description);
    setLogs(s.logs);
  };

  const reset = () => {
    runMut.reset();
    verifyMut.reset();
    setDismissed(result?.investigationId ?? latestId);
    if (scenarios[0]) setScenario(scenarios[0].id);
  };

  return (
    <Ctx.Provider
      value={{
        scenarios, scenariosError: scenariosQ.error, scenarioId, description, logs, phase, result, restored,
        error: runMut.error ?? null, reverifying: verifyMut.isPending,
        setScenario, setDescription, setLogs,
        run: () => runMut.mutate(),
        reverify: () => result && verifyMut.mutate(result.investigationId),
        reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useInvestigation() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useInvestigation must be used within InvestigationProvider");
  return v;
}
