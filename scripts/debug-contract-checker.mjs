import assert from "node:assert/strict";

const baseUrl = process.env.TOOLTRUTH_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.TOOLTRUTH_ACCESS_PASSWORD;
assert.ok(password, "TOOLTRUTH_ACCESS_PASSWORD is required");

const readEvents = async (response) => {
  assert.equal(response.ok, true, `Event stream returned ${response.status}`);
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
};

const createResponse = await fetch(`${baseUrl}/api/inspection`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: "https://tooltruth-agentmart.vercel.app",
    password,
  }),
});
assert.equal(createResponse.status, 201, "Inspection run was not created");
const { runId } = await createResponse.json();

const discoveryEvents = await readEvents(
  await fetch(`${baseUrl}/api/inspection/${encodeURIComponent(runId)}/events`),
);
const readyEvent = discoveryEvents.find((event) => event.kind === "tools.ready");
assert.ok(readyEvent, "Tool discovery did not complete");
const tool = readyEvent.data.find((candidate) => candidate.name === "add_to_cart");
assert.ok(tool, "add_to_cart was not discovered");

const probeResponse = await fetch(
  `${baseUrl}/api/inspection/${encodeURIComponent(runId)}/probe`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toolId: tool.id }),
  },
);
assert.equal(probeResponse.status, 201, "Probe was not created");
const { eventsUrl } = await probeResponse.json();
const probeEvents = await readEvents(await fetch(`${baseUrl}${eventsUrl}`));
const analysisEvent = probeEvents.find((event) => event.kind === "analysis.ready");
assert.ok(analysisEvent, "Verification analysis was not returned");
const evaluators = analysisEvent.data.evaluators.map(
  ({ evaluator, status, error }) => ({
    evaluator,
    status,
    error: error ? "<REDACTED ERROR DETAIL>" : null,
  }),
);
console.log(JSON.stringify(evaluators));
const contractChecker = analysisEvent.data.evaluators.find(
  (result) => result.evaluator === "contract_checker",
);
assert.equal(
  contractChecker?.status,
  "completed",
  "The contract checker failed with both configured model attempts",
);
