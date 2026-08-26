/**
 * Whatever the failure was, in words. Batch operations report per-entry failures
 * as data rather than as a rejection, so the message has to survive the trip.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
