export type ModelState = 'idle' | 'loading' | 'ready' | 'failed';
export type ModelLoader<T> = () => Promise<T>;

/** Owns one model per session. Pending native loads cannot be cancelled. */
export class ModelLifecycle<T extends { close(): void }> {
  protected model: T | null = null;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private currentState: ModelState = 'idle';

  constructor(
    private readonly loader: ModelLoader<T>,
    readonly errorMessage: string,
  ) {}

  get state(): ModelState {
    return this.currentState;
  }

  load(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.currentState !== 'idle') return Promise.resolve();
    const generation = this.generation;
    this.currentState = 'loading';
    this.pending = Promise.resolve()
      .then(this.loader)
      .then(
        (model) => {
          if (generation !== this.generation) {
            this.dispose(model);
            return;
          }
          this.model = model;
          this.currentState = 'ready';
        },
        () => {
          if (generation === this.generation) this.currentState = 'failed';
        },
      )
      .finally(() => {
        if (generation === this.generation) this.pending = null;
      });
    return this.pending;
  }

  retry(): Promise<void> {
    if (this.currentState !== 'failed') return this.pending ?? Promise.resolve();
    this.currentState = 'idle';
    return this.load();
  }

  close(): void {
    this.generation++;
    const model = this.model;
    this.model = null;
    this.pending = null;
    this.currentState = 'idle';
    if (model) this.dispose(model);
  }

  private dispose(model: T): void {
    // Ownership is released before closing; even a throwing close is never retried.
    try {
      model.close();
    } catch {
      /* Continue closing the other trackers. */
    }
  }
}
