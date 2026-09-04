export type ProbeHistoryCandidate = {
  id: string;
  toolId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  createdAt: number;
  directedTest?: {
    round: number;
    parentProbeId: string | null;
    request: string;
    inputHash: string;
  };
  directedEvaluation?: { verdict: string };
  analysisData?: { verdict: string };
};

export const selectHydratableProbes = <Probe extends ProbeHistoryCandidate>(
  probes: Probe[],
) => probes;
