/** One bounded, non-overlapping poller per forum tab, shared by visible boards. */
export class VisiblePostMapSync {
  constructor(send, { isVisible = () => !document.hidden, interval = 5000,
    setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = id => clearTimeout(id) } = {}) {
    this.send = send;
    this.isVisible = isVisible;
    this.interval = interval;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.clients = new Set();
    this.timer = null;
    this.inFlight = false;
    this.failures = 0;
  }

  register(postId, consumer) {
    const client = { postId: String(postId), consumer, active: false };
    this.clients.add(client);
    return {
      setActive: active => { client.active = active; this.schedule(); },
      remove: () => { this.clients.delete(client); this.schedule(); },
    };
  }

  schedule(delay = Math.min(30000, this.interval * 2 ** this.failures)) {
    const needed = this.isVisible() && [...this.clients].some(c => c.active);
    if (!needed && this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!needed || this.inFlight || this.timer !== null) return;
    this.timer = this.setTimer(() => { this.timer = null; void this.tick(); }, delay);
  }

  wake() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.schedule(0);
  }

  async tick() {
    if (this.inFlight || !this.isVisible()) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.inFlight = true;
    let failed = false;
    try {
      const clients = [...this.clients].filter(c => c.active && !c.consumer.isBusy());
      const ids = [...new Set(clients.map(c => c.postId))];
      for (let start = 0; start < ids.length && this.isVisible(); start += 20) {
        const batch = ids.slice(start, start + 20);
        const targets = clients.filter(c => batch.includes(c.postId)).map(client => ({
          client, epoch: client.consumer.epoch(),
        }));
        const current = ({ client, epoch }) => this.isVisible() && this.clients.has(client)
          && client.active && !client.consumer.isBusy() && client.consumer.epoch() === epoch;
        try {
          const response = await this.send(batch);
          if (!Array.isArray(response?.data)) throw new Error('Invalid map snapshot');
          const snapshots = new Map(response.data.map(item => [String(item.id), item.attributes]));
          for (const target of targets) {
            if (!current(target)) continue;
            const snapshot = snapshots.get(target.client.postId);
            if (!snapshot || typeof snapshot.available !== 'boolean') throw new Error('Missing map snapshot');
            target.client.consumer.apply(snapshot);
          }
        } catch (error) {
          failed = true;
          for (const target of targets) if (current(target)) target.client.consumer.onError(error);
        }
      }
      this.failures = failed ? Math.min(3, this.failures + 1) : 0;
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }
}
