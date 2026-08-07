export class FakeClock {
  #listeners = new Set();
  #tickNumber = 0;
  subscribe(listener) { if (typeof listener !== "function") throw new TypeError("FakeClock listener must be a function."); this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  tick(delta = 1 / 60) {
    if (!(Number.isFinite(delta) && delta >= 0)) throw new TypeError("Clock delta must be a finite non-negative number.");
    this.#tickNumber += 1;
    for (const listener of [...this.#listeners]) listener({ tick: this.#tickNumber, delta });
    return this.#tickNumber;
  }
  get tickNumber() { return this.#tickNumber; }
  dispose() { this.#listeners.clear(); }
}
