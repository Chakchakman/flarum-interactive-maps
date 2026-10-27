import { currentConflictToken, terminalMoveError } from './tokenMoveConflict.mjs';

/**
 * Serialize writes for each token in one browser tab.
 *
 * Keeps only the most recent unsent target while a previous request is in
 * flight. A server reply never writes token coordinates to the page: the
 * current optimistic position belongs to the user's newest action.
 *
 * Every send uses the last acknowledged movement state. Conflicts stop the
 * queue instead of replaying stale local intent over another client.
 */
export class LatestTokenMoveQueue {
  constructor(send, { onSuccess = () => {}, onFailure = () => {}, onDrained = () => {} } = {}) {
    this.send = send;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.onDrained = onDrained;
    this.entries = new Map();
  }

  hasPending() {
    return this.entries.size > 0;
  }

  enqueue(id, target, initialConfirmed) {
    const key = String(id);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        pending: null,
        confirmed: { ...initialConfirmed },
        inFlight: false,
      };
      this.entries.set(key, entry);
    }
    // The latest unsent destination replaces older unsent destinations.
    entry.pending = { x: target.x, y: target.y };
    void this.flush(key, entry);
  }

  async flush(key, entry) {
    if (entry.inFlight) return;
    entry.inFlight = true;

    try {
      while (entry.pending) {
        const target = entry.pending;
        entry.pending = null;
        try {
          const reply = await this.send(key, target, { ...entry.confirmed });
          entry.confirmed = {
            x: Number(reply?.x ?? target.x),
            y: Number(reply?.y ?? target.y),
            ...(reply?.moveVersion ? { moveVersion: reply.moveVersion } :
              entry.confirmed.moveVersion ? { moveVersion: entry.confirmed.moveVersion } : {}),
          };
          this.onSuccess(key, reply);
        } catch (error) {
          if (terminalMoveError(error)) {
            entry.pending = null;
            const current = currentConflictToken(error);
            // A malformed response must never apply another token's state.
            if (current && String(current.id) === key) entry.confirmed = current;
            this.onFailure(key, { ...entry.confirmed }, error);
            break;
          }
          // If another target has been queued, it should get its own chance
          // to save; do not snap back to a stale position in the meantime.
          if (!entry.pending) {
            this.onFailure(key, { ...entry.confirmed }, error);
          }
        }
      }
    } finally {
      entry.inFlight = false;
      this.entries.delete(key);
      this.onDrained(key);
    }
  }
}
