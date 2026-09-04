export type SequencedValue<Value> = {
  sequence: number;
  event: Value;
};

export const eventsAfterSequence = <Value>(
  events: SequencedValue<Value>[],
  sequence: number,
) => events.filter((event) => event.sequence > sequence);

export const shouldApplyEventSequence = (
  lastAppliedSequence: number,
  incomingSequence: number,
) => incomingSequence <= 0 || incomingSequence > lastAppliedSequence;
