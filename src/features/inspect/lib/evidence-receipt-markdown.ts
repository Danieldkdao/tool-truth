import type { EvidenceReceipt } from "@/features/inspect/lib/evidence-receipt";
import type {
  SafeJsonObject,
  SafeJsonValue,
} from "@/features/inspect/lib/report-redaction";

const asObject = (value: SafeJsonValue | undefined): SafeJsonObject | null =>
  value && !Array.isArray(value) && typeof value === "object" ? value : null;

const asArray = (value: SafeJsonValue | undefined): SafeJsonValue[] =>
  Array.isArray(value) ? value : [];

const displayValue = (value: SafeJsonValue | undefined) => {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const escapeMarkdown = (value: SafeJsonValue | undefined) =>
  displayValue(value)
    .replaceAll("\\", "\\\\")
    .replace(/([`*_{}\[\]<>#+!|])/g, "\\$1");

const escapeTableCell = (value: SafeJsonValue | undefined) =>
  escapeMarkdown(value).replaceAll("\n", "<br>");

const titleCase = (value: SafeJsonValue | undefined) =>
  displayValue(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const createTable = (
  headings: string[],
  rows: Array<Array<SafeJsonValue | undefined>>,
) => {
  if (rows.length === 0) return "_None recorded._";

  return [
    `| ${headings.join(" | ")} |`,
    `| ${headings.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) => `| ${row.map((value) => escapeTableCell(value)).join(" | ")} |`,
    ),
  ].join("\n");
};

const createDefinitionTable = (entries: Array<[string, SafeJsonValue | undefined]>) =>
  createTable(
    ["Field", "Value"],
    entries.map(([label, value]) => [label, value]),
  );

const createJsonBlock = (value: SafeJsonValue | EvidenceReceipt) => {
  const json = JSON.stringify(value, null, 2);
  const longestBacktickRun = Math.max(
    0,
    ...([...json.matchAll(/`+/g)].map((match) => match[0].length)),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}json\n${json}\n${fence}`;
};

const createList = (values: SafeJsonValue[]) => {
  if (values.length === 0) return "_None recorded._";
  return values.map((value) => `- ${escapeMarkdown(value)}`).join("\n");
};

const createFindingsSection = (
  findingsValue: SafeJsonValue | undefined,
) => {
  const findings = asObject(findingsValue);
  if (!findings || Object.keys(findings).length === 0) {
    return "_No findings were recorded._";
  }

  return Object.entries(findings)
    .map(([toolId, value]) => {
      const finding = asObject(value);
      if (!finding) return `### ${escapeMarkdown(toolId)}\n\n${escapeMarkdown(value)}`;

      return [
        `### ${escapeMarkdown(finding.title ?? toolId)}`,
        "",
        createDefinitionTable([
          ["Tool ID", toolId],
          ["Severity", titleCase(finding.severity)],
          ["Input parameter", finding.parameter],
          ["Test value", finding.value],
        ]),
        "",
        "**Declared behavior**",
        "",
        escapeMarkdown(finding.declared),
        "",
        "**Observed behavior**",
        "",
        escapeMarkdown(finding.observed),
      ].join("\n");
    })
    .join("\n\n");
};

const createRequirementsTable = (evaluation: SafeJsonObject) => {
  const rows = asArray(evaluation.requirements).flatMap((value) => {
    const requirement = asObject(value);
    if (!requirement) return [];
    const evidenceIds = asArray(requirement.evidenceIds)
      .map((id) => displayValue(id))
      .join(", ");

    return [[
      requirement.requirement,
      titleCase(requirement.status),
      evidenceIds || "None",
      requirement.reason,
    ]];
  });

  return createTable(
    ["Requirement", "Status", "Evidence IDs", "Reason"],
    rows,
  );
};

const createEvaluationSection = (
  heading: string,
  evaluation: SafeJsonObject,
  metadata: Array<[string, SafeJsonValue | undefined]> = [],
) => {
  return [
    `### ${heading}`,
    "",
    createDefinitionTable([
      ...metadata,
      ["Verdict", titleCase(evaluation.verdict)],
      [
        "Confidence",
        typeof evaluation.confidence === "number"
          ? `${Math.round(evaluation.confidence * 100)}%`
          : evaluation.confidence,
      ],
    ]),
    "",
    "**Summary**",
    "",
    escapeMarkdown(evaluation.summary),
    "",
    "**Requirement evidence**",
    "",
    createRequirementsTable(evaluation),
    "",
    "**Uncertainties**",
    "",
    createList(asArray(evaluation.uncertainties)),
    "",
    "**Suggested repair**",
    "",
    escapeMarkdown(evaluation.suggestedRepair),
  ].join("\n");
};

const createEvaluatorsSection = (analysis: SafeJsonObject) => {
  const evaluators = asArray(analysis.evaluators);
  if (evaluators.length === 0) return "_Semantic evaluation was not required._";

  return evaluators
    .map((value, index) => {
      const evaluator = asObject(value);
      if (!evaluator) return `### Evaluator ${index + 1}\n\n${escapeMarkdown(value)}`;
      const evaluation = asObject(evaluator.evaluation);
      const heading = titleCase(evaluator.evaluator ?? `Evaluator ${index + 1}`);

      if (!evaluation) {
        return [
          `### ${heading}`,
          "",
          createDefinitionTable([
            ["Model", evaluator.model],
            ["Status", titleCase(evaluator.status)],
            ["Error", evaluator.error],
          ]),
        ].join("\n");
      }

      return createEvaluationSection(heading, evaluation, [
        ["Model", evaluator.model],
        ["Status", titleCase(evaluator.status)],
      ]);
    })
    .join("\n\n");
};

const createTimelineSection = (evidence: SafeJsonObject) => {
  const rows = asArray(evidence.timeline).flatMap((value) => {
    const entry = asArray(value);
    return entry.length >= 3 ? [[entry[0], entry[1], entry[2]]] : [];
  });
  return createTable(["Time", "Event", "Detail"], rows);
};

const createStateChangesSection = (evidence: SafeJsonObject) => {
  const rows = asArray(evidence.stateChanges).flatMap((value) => {
    const entry = asArray(value);
    return entry.length >= 3 ? [[entry[0], entry[1], entry[2]]] : [];
  });
  return createTable(["State path", "Before", "After"], rows);
};

const createNetworkSection = (evidence: SafeJsonObject) => {
  const rows = asArray(evidence.network).flatMap((value) => {
    const entry = asObject(value);
    return entry
      ? [[entry.method, entry.path, entry.status, entry.duration]]
      : [];
  });
  return createTable(["Method", "Path", "Status", "Duration"], rows);
};

const createScreenshotsSection = (evidence: SafeJsonObject) => {
  const rows = asArray(evidence.screenshots).flatMap((value) => {
    const screenshot = asObject(value);
    return screenshot
      ? [[screenshot.label, screenshot.bytes, screenshot.hash, screenshot.sourceUrl]]
      : [];
  });
  return createTable(["Label", "Bytes", "SHA-256", "Source"], rows);
};

const createLogsSection = (evidence: SafeJsonObject) => {
  const rows = asArray(evidence.logs).flatMap((value) => {
    const entry = asObject(value);
    return entry
      ? [[entry.time, titleCase(entry.source), titleCase(entry.level), entry.message]]
      : [];
  });
  return createTable(["Time", "Source", "Level", "Message"], rows);
};

const createStatisticsSection = (evidence: SafeJsonObject) => {
  const statistics = asObject(evidence.statistics);
  if (!statistics) return "_Statistics were not available._";

  const metrics = Object.entries(statistics).filter(
    ([key, value]) =>
      key !== "browserbase" &&
      key !== "operationalLogs" &&
      (value === null || typeof value !== "object"),
  );
  const browserbase = asObject(statistics.browserbase);
  const operationalLogs = asArray(statistics.operationalLogs);

  return [
    createDefinitionTable(
      metrics.map(([key, value]) => [titleCase(key), value]),
    ),
    "",
    "### Browser provider details",
    "",
    browserbase
      ? createDefinitionTable(
          Object.entries(browserbase).map(([key, value]) => [
            titleCase(key),
            value,
          ]),
        )
      : "_No external browser provider details were recorded._",
    "",
    "### Operational logs",
    "",
    createTable(
      ["Time", "Source", "Level", "Message"],
      operationalLogs.flatMap((value) => {
        const entry = asObject(value);
        return entry
          ? [[entry.time, titleCase(entry.source), titleCase(entry.level), entry.message]]
          : [];
      }),
    ),
  ].join("\n");
};

const createDiscoveredToolsSection = (receipt: EvidenceReceipt) => {
  const rows = receipt.discoveredTools.map((tool) => [
    tool.id,
    tool.name,
    tool.description,
    tool.result,
  ]);

  return [
    createTable(["ID", "Name", "Description", "Result"], rows),
    "",
    "### Complete sanitized tool definitions",
    "",
    createJsonBlock(receipt.discoveredTools),
  ].join("\n");
};

export const serializeEvidenceReceiptMarkdown = (receipt: EvidenceReceipt) => {
  const analysis = receipt.verification.analysis;
  const evidence = receipt.verification.evidence;
  const findingCount = Object.keys(asObject(analysis.findings) ?? {}).length;
  const deterministic = asObject(analysis.deterministic);
  const facts = asArray(deterministic?.facts);
  const adjudication = asObject(analysis.adjudication);
  const regression = asObject(analysis.regression);
  const regressionExpectation = asObject(regression?.expectation);
  const regressionActual = asObject(regression?.actual);
  const regressionFixture = asObject(regression?.fixture);
  const regressionChecks = asArray(regression?.checks);

  return [
    "# ToolTruth WebMCP Evidence Receipt",
    "",
    `> ${escapeMarkdown(titleCase(analysis.verdict ?? receipt.inspection.status))} — generated ${escapeMarkdown(receipt.generatedAt)}`,
    "",
    "## Receipt overview",
    "",
    createDefinitionTable([
      ["Schema version", receipt.schemaVersion],
      ["Run ID", receipt.inspection.runId],
      ["Probe ID", receipt.inspection.probeId],
      ["Attempt", receipt.inspection.attempt],
      ["Verification status", titleCase(receipt.inspection.status)],
      ["Selected tool", receipt.selectedTool.name],
      ["Detected tools", receipt.inspection.discoveredToolCount],
      ["Findings", findingCount],
      ["Evidence status", titleCase(analysis.evidenceStatus)],
      ["Decision basis", titleCase(analysis.decisionBasis)],
      ["Consensus", titleCase(analysis.consensus)],
      ["Regression status", titleCase(regression?.status)],
    ]),
    "",
    "## Executive summary",
    "",
    escapeMarkdown(
      asObject(asObject(analysis.findings)?.[receipt.inspection.selectedToolId])
        ?.observed ?? "See the detailed findings and evidence below.",
    ),
    "",
    "**Suggested repair**",
    "",
    escapeMarkdown(analysis.suggestedRepair),
    "",
    "## Selected tool contract",
    "",
    createDefinitionTable([
      ["ID", receipt.selectedTool.id],
      ["Name", receipt.selectedTool.name],
      ["Description", receipt.selectedTool.description],
      ["Discovery result", receipt.selectedTool.result],
      ["Frame ID", receipt.selectedTool.frameId],
    ]),
    "",
    "### Input schema",
    "",
    createJsonBlock(receipt.selectedTool.inputSchema ?? null),
    "",
    "### Annotations",
    "",
    createJsonBlock(receipt.selectedTool.annotations ?? null),
    "",
    "## Findings",
    "",
    createFindingsSection(analysis.findings),
    "",
    "## Deterministic evidence",
    "",
    createDefinitionTable([
      ["Hard verdict", titleCase(deterministic?.hardVerdict)],
      ["Unexpected state changes", analysis.unexpectedStateChanges],
      ["Sandbox", analysis.sandboxLabel],
    ]),
    "",
    facts.length === 0
      ? "_No deterministic facts were recorded._"
      : facts
          .map((value) => {
            const fact = asObject(value);
            return fact
              ? `- **${escapeMarkdown(fact.id)}:** ${escapeMarkdown(fact.statement)}`
              : `- ${escapeMarkdown(value)}`;
          })
          .join("\n"),
    "",
    "## Semantic evaluators",
    "",
    createEvaluatorsSection(analysis),
    "",
    "## Conditional adjudication",
    "",
    adjudication
      ? createEvaluationSection("Adjudicated result", adjudication)
      : "_Conditional adjudication was not required or was unavailable._",
    "",
    "## Fixture regression check",
    "",
    regression
      ? createDefinitionTable([
          ["Fixture", regressionFixture?.name],
          ["Fixture version", regressionFixture?.version],
          ["Manifest version", regression.manifestVersion],
          ["Status", titleCase(regression.status)],
          ["Expected outcome", regressionExpectation?.label],
          ["Actual verdict", titleCase(regressionActual?.verdict)],
          ["Actual decision basis", titleCase(regressionActual?.decisionBasis)],
          ["Actual evidence status", titleCase(regressionActual?.evidenceStatus)],
        ])
      : "_This verification was not associated with a known regression fixture._",
    "",
    regressionChecks.length > 0
      ? createTable(
          ["Check", "Result", "Expected", "Actual"],
          regressionChecks.map((value) => {
            const check = asObject(value);
            return [
              check?.label,
              check?.passed ? "Matched" : "Mismatch",
              check?.expected,
              check?.actual,
            ];
          }),
        )
      : "",
    "",
    "## Execution evidence",
    "",
    createDefinitionTable([
      ["Run label", evidence.runLabel],
      ["Timeline events", asArray(evidence.timeline).length],
      ["State changes", asArray(evidence.stateChanges).length],
      ["Network requests", asArray(evidence.network).length],
      ["Log entries", asArray(evidence.logs).length],
      ["Screenshots", asArray(evidence.screenshots).length],
    ]),
    "",
    "### Timeline",
    "",
    createTimelineSection(evidence),
    "",
    "### State changes",
    "",
    createStateChangesSection(evidence),
    "",
    "### Network activity",
    "",
    createNetworkSection(evidence),
    "",
    "### Screenshot integrity",
    "",
    createScreenshotsSection(evidence),
    "",
    "### Runtime and analysis logs",
    "",
    createLogsSection(evidence),
    "",
    "## Verification statistics",
    "",
    createStatisticsSection(evidence),
    "",
    "## Browser context",
    "",
    "### Page preview",
    "",
    receipt.browser.preview
      ? createDefinitionTable(
          Object.entries(receipt.browser.preview).map(([key, value]) => [
            titleCase(key),
            value,
          ]),
        )
      : "_No page preview metadata was available._",
    "",
    "### Verification session",
    "",
    receipt.browser.session
      ? createDefinitionTable(
          Object.entries(receipt.browser.session).map(([key, value]) => [
            titleCase(key),
            value,
          ]),
        )
      : "_No browser session metadata was available._",
    "",
    "## Discovered WebMCP tools",
    "",
    createDiscoveredToolsSection(receipt),
    "",
    "## Privacy and integrity",
    "",
    escapeMarkdown(receipt.privacy.policy),
    "",
    receipt.privacy.intentionallyExcluded
      .map((item) => `- ${escapeMarkdown(item)}`)
      .join("\n"),
    "",
    `Redacted values are marked as \`${receipt.privacy.redactionMarker}\`. Screenshot hashes are retained so evidence can be checked without exporting transient access URLs.`,
    "",
    "## Appendix: complete sanitized receipt",
    "",
    "This appendix contains the complete machine-readable record represented by the sections above.",
    "",
    createJsonBlock(receipt),
    "",
  ].join("\n");
};
