export class EventBus {
  #listeners = new Map();
  on(name, callback) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(callback);
    return () => this.#listeners.get(name)?.delete(callback);
  }
  emit(name, payload) { this.#listeners.get(name)?.forEach((callback) => callback(payload)); }
  clear() { this.#listeners.clear(); }
}
