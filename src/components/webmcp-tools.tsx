"use client";

import { useEffect, useRef } from "react";

import type { InspectionSessionController } from "@/features/inspect/hooks/use-inspection-session-controller";
import { createInspectionWebMCPTools } from "@/features/inspect/webmcp";

type WebMCPToolsProps = {
  controller: InspectionSessionController;
};

export const WebMCPTools = ({ controller }: WebMCPToolsProps) => {
  const controllerRef = useRef(controller);

  useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  useEffect(() => {
    const modelContext = document.modelContext;

    if (!modelContext) {
      return;
    }

    const registration = new AbortController();
    const tools = createInspectionWebMCPTools(() => controllerRef.current);

    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, {
          signal: registration.signal,
        }),
      ),
    ).catch((error: unknown) => {
      if (!registration.signal.aborted) {
        console.error("Could not register ToolTruth WebMCP tools.", error);
      }
    });

    return () => registration.abort();
  }, [controller.snapshot.runId]);

  return null;
};
