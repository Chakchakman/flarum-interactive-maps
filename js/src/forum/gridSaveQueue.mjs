/**
 * Debounces the slider's optimistic edits and serializes map PATCH requests.
 *
 * Patches contain only changed fields. Responses never overwrite a newer
 * local edit. Failures are reported along with the unsaved field snapshot.
 */
export class DebouncedGridSaveQueue {
  constructor(send, { delay = 400, onSuccess = () => {}, onFailure = () => {}, onDrained = () => {} } = {}) {
    this.send = send;
    this.delay = delay;
    this.onSuccess = onSuccess;
    this.onFailure = onFailure;
    this.onDrained = onDrained;
    this.pending = {};
    this.timer = null;
    this.inFlight = false;
  }

  hasPending() {
    return this.inFlight || this.timer !== null || Object.keys(this.pending).length !== 0;
  }

  pendingChanges() {
    return { ...this.pending };
  }

  queue(changes) {
    Object.assign(this.pending, changes);
    this.reschedule();
  }

  reschedule() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.delay);
  }

  async flushNow() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  async flush() {
    if (this.inFlight || Object.keys(this.pending).length === 0) return;
    const batch = this.pending;
    this.pending = {};
    this.inFlight = true;
    try {
      const response = await this.send(batch);
      this.onSuccess(response, batch);
    } catch (error) {
      this.onFailure(error, batch, this.pendingChanges());
    } finally {
      this.inFlight = false;
      if (Object.keys(this.pending).length) {
        // A later edit may have arrived during the network request. Its own
        // 400ms debounce applies, unless it has already elapsed.
        if (this.timer === null) void this.flush();
      } else if (this.timer === null) {
        this.onDrained();
      }
    }
  }
}
