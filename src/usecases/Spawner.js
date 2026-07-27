/**
 * Deterministic spawn orchestrator. Scheduling is injected, so production can
 * use gsap.ticker while tests use a fake clock. No requestAnimationFrame loop
 * is created here.
 */
export class Spawner {
  #factory;
  #clock;
  #interval;
  #maxAlive;
  #waveSize;
  #canSpawn;
  #onSpawn;
  #onComplete;
  #alive = 0;
  #spawned = 0;
  #elapsed = 0;
  #unsubscribe = null;
  #state = "idle";

  constructor({
    factory,
    clock,
    interval = 0,
    maxAlive = Infinity,
    waveSize = Infinity,
    canSpawn,
    onSpawn,
    onComplete,
  } = {}) {
    if (typeof factory !== "function")
      throw new TypeError("Spawner requires a factory function.");
    if (!clock || typeof clock.subscribe !== "function")
      throw new TypeError(
        "Spawner requires an injected clock with subscribe().",
      );
    this.#factory = factory;
    this.#clock = clock;
    this.#interval = Math.max(0, Number(interval) || 0);
    this.#maxAlive = Math.max(0, Number(maxAlive) || 0);
    this.#waveSize = Math.max(0, Number(waveSize) || 0);
    this.#canSpawn = canSpawn;
    this.#onSpawn = onSpawn;
    this.#onComplete = onComplete;
  }
  get state() {
    return this.#state;
  }
  get alive() {
    return this.#alive;
  }
  get spawned() {
    return this.#spawned;
  }
  start() {
    if (this.#state === "destroyed") throw new Error("Spawner is destroyed.");
    if (this.#state === "running") return;
    this.#state = "running";
    this.#subscribe();
  }
  #subscribe() {
    this.#unsubscribe?.();
    this.#unsubscribe = this.#clock.subscribe((delta = 0) => this.#tick(delta));
  }
  pause() {
    if (this.#state !== "running") return;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#state = "idle";
  }
  resume() {
    if (this.#state === "idle") this.start();
  }
  notifyRemoved(count = 1) {
    this.#alive = Math.max(0, this.#alive - Math.max(0, Number(count) || 0));
    if (this.#state === "draining" && this.#alive === 0) this.#finishWave();
  }
  resetWave() {
    if (this.#state === "destroyed") return;
    this.#spawned = 0;
    this.#elapsed = 0;
    this.#state = "idle";
  }
  #tick(delta) {
    if (this.#state !== "running") return;
    this.#elapsed += Math.max(0, Number(delta) || 0);
    if (this.#spawned >= this.#waveSize) {
      this.#state = "draining";
      if (this.#alive === 0) this.#finishWave();
      return;
    }
    if (this.#alive >= this.#maxAlive || this.#elapsed < this.#interval) return;
    if (this.#canSpawn && !this.#canSpawn()) return;
    this.#elapsed = 0;
    const entity = this.#factory({ index: this.#spawned });
    this.#spawned += 1;
    this.#alive += 1;
    this.#onSpawn?.(entity, this.#spawned);
    if (this.#spawned >= this.#waveSize) this.#state = "draining";
  }
  #finishWave() {
    if (this.#state === "complete" || this.#state === "destroyed") return;
    this.#state = "complete";
    this.#onComplete?.();
  }
  destroy() {
    if (this.#state === "destroyed") return;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#state = "destroyed";
    this.#alive = 0;
  }
}
