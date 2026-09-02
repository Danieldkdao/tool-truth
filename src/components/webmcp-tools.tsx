"use client";

import { useEffect } from "react";

const supportedTools = new Set([
  "preview_order",
  "get_inventory",
  "fetch_reviews",
]);

export const WebMCPTools = () => {
  useEffect(() => {
    if (!("modelContext" in document)) {
      console.warn("WebMCP is not available in this browser.");
      return;
    }

    const registration = new AbortController();

    void document.modelContext
      ?.registerTool(
        {
          name: "run_verification",
          title: "Run ToolTruth verification",
          description:
            "Runs a sandboxed behavioral verification for one fixture tool and returns its observed effects.",

          inputSchema: {
            type: "object",
            properties: {
              toolName: {
                type: "string",
                enum: ["preview_order", "get_inventory", "fetch_reviews"],
                description: "Fixture tool to verify.",
              },
            },
            required: ["toolName"],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },

          execute: async (input) => {
            const toolName = (input as { toolName?: unknown }).toolName;

            if (typeof toolName !== "string" || !supportedTools.has(toolName)) {
              throw new Error("Unsupported fixture tool.");
            }

            window.dispatchEvent(
              new CustomEvent("tooltruth:verification-complete", {
                detail: "Verification completed!",
              }),
            );

            return "Verification completed!";
          },
        },
        {
          signal: registration.signal,
        },
      )
      .catch(console.error);

    return () => {
      registration.abort("WebMCPTools component unmounted.");
    };
  }, []);

  return null;
};
