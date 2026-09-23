export type ShutdownReason = 'close' | 'quit' | 'reload' | 'load';
export type ShutdownJoinerOrder = 'default' | 'last';
export type ShutdownResult = 'vetoed' | 'completed' | 'forced';

export interface ShutdownParticipantIdentity {
  id: string;
  label: string;
}

export interface BeforeShutdownEvent {
  readonly reason: ShutdownReason;
  veto(value: boolean | Promise<boolean>, participant: ShutdownParticipantIdentity): void;
}

export interface ShutdownJoiner extends ShutdownParticipantIdentity {
  order?: ShutdownJoinerOrder;
}

export interface WillShutdownEvent {
  readonly reason: ShutdownReason;
  readonly signal: AbortSignal;
  join(operation: Promise<void> | (() => Promise<void>), joiner: ShutdownJoiner): void;
  joiners(): readonly ShutdownJoiner[];
  report(id: string, detail: string): void;
}

export type ShutdownPhase = 'idle' | 'before' | 'vetoed' | 'will' | 'did' | 'forced';
export type ShutdownOperationPhase = 'before' | 'waiting' | 'complete' | 'failed';

export interface ShutdownOperationSnapshot extends ShutdownParticipantIdentity {
  phase: ShutdownOperationPhase;
  detail?: string;
}

export interface ShutdownSnapshot {
  phase: ShutdownPhase;
  reason?: ShutdownReason;
  operations: readonly ShutdownOperationSnapshot[];
}

type BeforeListener = (event: BeforeShutdownEvent) => void;
type WillListener = (event: WillShutdownEvent) => void;
type DidListener = (reason: ShutdownReason) => void;

interface RegisteredVeto extends ShutdownParticipantIdentity {
  value: boolean | Promise<boolean>;
}

interface RegisteredJoiner {
  joiner: ShutdownJoiner;
  operation: Promise<void> | (() => Promise<void>);
}

export class ShutdownLifecycle {
  readonly #beforeListeners = new Set<BeforeListener>();
  readonly #willListeners = new Set<WillListener>();
  readonly #didListeners = new Set<DidListener>();
  readonly #snapshotListeners = new Set<(snapshot: ShutdownSnapshot) => void>();
  #snapshot: ShutdownSnapshot = { phase: 'idle', operations: [] };
  #active: Promise<ShutdownResult> | undefined;
  #force: AbortController | undefined;

  onBeforeShutdown(listener: BeforeListener): () => void {
    this.#beforeListeners.add(listener);
    return () => this.#beforeListeners.delete(listener);
  }

  onWillShutdown(listener: WillListener): () => void {
    this.#willListeners.add(listener);
    return () => this.#willListeners.delete(listener);
  }

  onDidShutdown(listener: DidListener): () => void {
    this.#didListeners.add(listener);
    return () => this.#didListeners.delete(listener);
  }

  subscribe(listener: (snapshot: ShutdownSnapshot) => void): () => void {
    this.#snapshotListeners.add(listener);
    listener(this.snapshot());
    return () => this.#snapshotListeners.delete(listener);
  }

  snapshot(): ShutdownSnapshot {
    return {
      ...this.#snapshot,
      operations: this.#snapshot.operations.map((operation) => ({ ...operation })),
    };
  }

  request(reason: ShutdownReason): Promise<ShutdownResult> {
    this.#active ??= this.#run(reason).finally(() => {
      this.#active = undefined;
    });
    return this.#active;
  }

  force(): boolean {
    if (this.#snapshot.phase !== 'will' || this.#force === undefined) return false;
    this.#force.abort();
    return true;
  }

  async #run(reason: ShutdownReason): Promise<ShutdownResult> {
    const vetos: RegisteredVeto[] = [];
    const beforeEvent: BeforeShutdownEvent = {
      reason,
      veto: (value, participant) => vetos.push({ ...participant, value }),
    };
    for (const listener of this.#beforeListeners) listener(beforeEvent);
    this.#setSnapshot({
      phase: 'before',
      reason,
      operations: vetos.map(({ id, label }) => ({ id, label, phase: 'before' })),
    });

    const vetoed = (await Promise.all(vetos.map((veto) => this.#settleVeto(veto))))
      .some(Boolean);
    if (vetoed) {
      this.#setSnapshot({ ...this.#snapshot, phase: 'vetoed' });
      return 'vetoed';
    }

    const joiners: RegisteredJoiner[] = [];
  const earlyReports = new Map<string, string>();
    this.#force = new AbortController();
    this.#setSnapshot({ phase: 'will', reason, operations: [] });
    const willEvent: WillShutdownEvent = {
      reason,
      signal: this.#force.signal,
      join: (operation, joiner) => {
        if (joiners.some(({ joiner: current }) => current.id === joiner.id)) {
          throw new Error(`Shutdown joiner "${joiner.id}" is already registered.`);
        }
        joiners.push({ joiner, operation });
        this.#setSnapshot({
          ...this.#snapshot,
          operations: [
            ...this.#snapshot.operations,
            {
              id: joiner.id,
              label: joiner.label,
              phase: 'waiting',
              detail: earlyReports.get(joiner.id),
            },
          ],
        });
        earlyReports.delete(joiner.id);
      },
      joiners: () => joiners.map(({ joiner }) => ({ ...joiner })),
      report: (id, detail) => {
        if (joiners.some(({ joiner }) => joiner.id === id)) {
          this.#updateOperation(id, { detail });
        } else {
          earlyReports.set(id, detail);
        }
      },
    };
    for (const listener of this.#willListeners) listener(willEvent);

    const defaults = joiners.filter(({ joiner }) => joiner.order !== 'last');
    const last = joiners.filter(({ joiner }) => joiner.order === 'last');
    const forced = await this.#settleJoiners(defaults);
    const forcedLast = forced ? true : await this.#settleJoiners(last);
    if (forcedLast) {
      this.#setSnapshot({ ...this.#snapshot, phase: 'forced' });
      this.#force = undefined;
      return 'forced';
    }

    this.#setSnapshot({ ...this.#snapshot, phase: 'did' });
    for (const listener of this.#didListeners) listener(reason);
    this.#force = undefined;
    return 'completed';
  }

  async #settleVeto(veto: RegisteredVeto): Promise<boolean> {
    try {
      const result = await veto.value;
      this.#updateOperation(veto.id, { phase: 'complete' });
      return result;
    } catch (error) {
      this.#updateOperation(veto.id, {
        phase: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  async #settleJoiners(joiners: RegisteredJoiner[]): Promise<boolean> {
    const pending = Promise.allSettled(joiners.map((joiner) => this.#settleJoiner(joiner)));
    const signal = this.#force?.signal;
    if (signal === undefined) return false;
    if (signal.aborted) return true;
    return new Promise<boolean>((resolve) => {
      const forced = (): void => resolve(true);
      signal.addEventListener('abort', forced, { once: true });
      void pending.then(() => {
        signal.removeEventListener('abort', forced);
        resolve(false);
      });
    });
  }

  async #settleJoiner({ joiner, operation }: RegisteredJoiner): Promise<void> {
    try {
      await (typeof operation === 'function' ? operation() : operation);
      this.#updateOperation(joiner.id, { phase: 'complete' });
    } catch (error) {
      this.#updateOperation(joiner.id, {
        phase: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #updateOperation(id: string, update: Partial<ShutdownOperationSnapshot>): void {
    this.#setSnapshot({
      ...this.#snapshot,
      operations: this.#snapshot.operations.map((operation) =>
        operation.id === id ? { ...operation, ...update } : operation,
      ),
    });
  }

  #setSnapshot(snapshot: ShutdownSnapshot): void {
    this.#snapshot = snapshot;
    const current = this.snapshot();
    for (const listener of this.#snapshotListeners) listener(current);
  }
}
