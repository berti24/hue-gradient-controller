// Shared per-entity serial lanes also order edits from two cards/popups.
const lanes = new Map();
export function serialize(entity, operation) {
  const previous = lanes.get(entity) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  lanes.set(entity, next);
  next.finally(() => { if (lanes.get(entity) === next) lanes.delete(entity); }).catch(() => {});
  return next;
}

export class LiveWriter {
  constructor(entity, send, settled, delay = 120) {
    this.entity = entity; this.send = send; this.settled = settled; this.delay = delay;
    this.revision = 0; this.disposed = false;
  }
  enqueue(command, immediate = false) {
    if (this.disposed) return;
    this.pending ??= new Map();
    const key = command.key ?? `${command.domain}.${command.service}`;
    // Retain each control's latest value in interaction order. A later color
    // edit must not run before an older pending power-off command.
    this.pending.delete(key);
    this.pending.set(key, command);
    this.revision++;
    clearTimeout(this.timer);
    if (immediate) return this.flush();
    // Coalesce within a bounded interval: continuous drags still update live.
    if (!this.due) this.due = Date.now() + this.delay;
    this.timer = setTimeout(() => this.flush(), Math.max(0, this.due - Date.now()));
  }
  async flush() {
    clearTimeout(this.timer); this.timer = undefined; this.due = undefined;
    if (!this.pending?.size || this.disposed) return;
    if (this.running) { this.finalRequested = true; return this.running; }
    const commands = [...this.pending.values()], revision = this.revision;
    this.pending.clear();
    this.running = serialize(this.entity, async () => {
      for (const command of commands) {
        if (this.disposed) return;
        await this.send(command);
      }
    });
    let error;
    try { await this.running; } catch (caught) { error = caught; }
    this.running = undefined;
    if (!this.disposed && revision === this.revision) this.settled(error, revision);
    if (!this.disposed && this.pending?.size) {
      this.finalRequested = false;
      return this.flush();
    }
  }
  get busy() { return Boolean(this.pending?.size || this.running); }
  cancelPending() { clearTimeout(this.timer); this.timer = undefined; this.pending = undefined; this.due = undefined; }
  dispose() { this.disposed = true; this.cancelPending(); }
}
