import assert from "node:assert/strict";
import test from "node:test";

import {
  eventsAfterSequence,
  shouldApplyEventSequence,
} from "./verification-event-order.ts";

test("replays only events after the acknowledged sequence", () => {
  const events = [1, 2, 3, 4].map((sequence) => ({
    sequence,
    event: `event-${sequence}`,
  }));
  assert.deepEqual(
    eventsAfterSequence(events, 2).map((event) => event.sequence),
    [3, 4],
  );
});

test("rejects duplicate or out-of-order sequenced events", () => {
  assert.equal(shouldApplyEventSequence(4, 4), false);
  assert.equal(shouldApplyEventSequence(4, 3), false);
  assert.equal(shouldApplyEventSequence(4, 5), true);
  assert.equal(shouldApplyEventSequence(4, 0), true);
});
