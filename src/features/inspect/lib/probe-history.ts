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

type HydratedProbeRecord = {
  probeId: string;
  toolId: string;
};

export type HydratedProbeState<Probe extends HydratedProbeRecord> = {
  recordsByProbeId: Record<string, Probe>;
  probeOrderByToolId: Record<string, string[]>;
  activeProbeIdByToolId: Record<string, string>;
};

export const mergeHydratedProbeRecords = <Probe extends HydratedProbeRecord>(
  state: HydratedProbeState<Probe>,
  hydratedRecords: Probe[],
): HydratedProbeState<Probe> => {
  const activeToolIds = new Set(Object.keys(state.activeProbeIdByToolId));
  const recordsByProbeId = { ...state.recordsByProbeId };
  const probeOrderByToolId = { ...state.probeOrderByToolId };
  const activeProbeIdByToolId = { ...state.activeProbeIdByToolId };

  for (const record of hydratedRecords) {
    recordsByProbeId[record.probeId] ??= record;
    const existingOrder = probeOrderByToolId[record.toolId] ?? [];
    probeOrderByToolId[record.toolId] = existingOrder.includes(record.probeId)
      ? existingOrder
      : [...existingOrder, record.probeId];
    if (!activeToolIds.has(record.toolId)) {
      activeProbeIdByToolId[record.toolId] = record.probeId;
    }
  }

  return {
    recordsByProbeId,
    probeOrderByToolId,
    activeProbeIdByToolId,
  };
};
