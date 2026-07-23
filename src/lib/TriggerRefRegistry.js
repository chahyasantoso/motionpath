export class TriggerRefRegistry {
  #refs = new Map();

  register(id, ref) {
    this.#refs.set(id, ref);
  }

  unregister(id, ref) {
    if (ref === undefined || this.#refs.get(id) === ref) {
      this.#refs.delete(id);
    }
  }

  resolveElement = (id) => {
    const ref = this.#refs.get(id);
    const element = ref && typeof ref === 'object' && 'current' in ref ? ref.current : ref;
    if (!element) {
      throw new Error(
        `MotionPath: trigger ref '${id}' is not registered. Mount useMotionTrigger('${id}', ref) before this project's motions are built.`
      );
    }
    return element;
  };
}
