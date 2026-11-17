// Long enough to leave one call and join the next without Integrations restoring and applying again in between.
const BACK_TO_BACK_WINDOW_MS = 30_000;

/**
 * State an Integration saves when it applies, kept in the Integration Ledger until it restores.
 */
export type RestoreState = string | number | boolean | null | RestoreState[] | { [key: string]: RestoreState };

/**
 * A system side effect tied to being in a call.
 */
export interface Integration {
  /** Names the Integration in the Integration Ledger, so it must stay the same between releases. */
  readonly id: string;

  /** Names the Integration in status the user sees. */
  readonly label: string;

  readonly enabled: boolean;

  /**
   * Applies the side effect, resolving to the state `restore` needs to undo it.
   */
  apply(): Promise<RestoreState>;

  restore(saved: RestoreState): Promise<void>;
}

/**
 * The applied Integrations, by id, with the state each needs to restore.
 */
export type LedgerEntries = Record<string, RestoreState>;

/**
 * Persists the Integration Ledger, so Integrations left applied by a crash can be restored on the next launch.
 */
export interface IntegrationLedgerPort {
  read(): LedgerEntries;
  write(entries: LedgerEntries): void;
}

export interface Clock {
  /**
   * Calls `callback` after `delayMs`, unless the returned function is called first.
   */
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface IntegrationLifecycle {
  /**
   * Describes, for the user, each Integration whose last apply or restore failed.
   */
  readonly failures: string[];

  /**
   * Calls `listener` with the new failures each time they change.
   */
  onFailuresChange(listener: (failures: string[]) => void): void;

  enteredCall(): void;
  leftCall(): void;

  /**
   * Restores every applied Integration straight away, resolving once they have all finished.
   */
  quit(): Promise<void>;
}

/**
 * Applies the enabled Integrations for a call and restores them afterwards, each independently of the others, keeping
 * the Integration Ledger up to date. Restores whatever the ledger lists straight away, since leftover entries mean
 * the last launch crashed during a call.
 */
export function startIntegrationLifecycle({
  integrations,
  ledger,
  clock,
}: {
  integrations: Integration[];
  ledger: IntegrationLedgerPort;
  clock: Clock;
}): IntegrationLifecycle {
  const entries = { ...ledger.read() };
  const queues = new Map<string, Promise<void>>();
  const failures = new Map<string, string>();
  const failureListeners: Array<(failures: string[]) => void> = [];
  let applied = false;
  let cancelRestore: (() => void) | undefined;

  /**
   * Runs `step` after every step queued before it for the same Integration, so an apply and its restore never overlap.
   */
  const enqueue = (integration: Integration, step: () => Promise<void>) => {
    queues.set(integration.id, (queues.get(integration.id) ?? Promise.resolve()).then(step));
  };

  /**
   * Runs one Integration's apply or restore, reporting how it went, without letting a failure reach the call.
   */
  const attempt = async (integration: Integration, turned: "on" | "off", work: () => Promise<void>) => {
    const before = failures.get(integration.id);

    try {
      await work();
      failures.delete(integration.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.set(integration.id, `${integration.label} wasn't turned ${turned}: ${reason}`);
    }

    if (failures.get(integration.id) !== before) {
      const current = [...failures.values()];
      failureListeners.forEach((listener) => listener(current));
    }
  };

  const applyAll = () => {
    applied = true;

    for (const integration of integrations.filter((integration) => integration.enabled)) {
      enqueue(integration, () =>
        attempt(integration, "on", async () => {
          entries[integration.id] = await integration.apply();
          ledger.write({ ...entries });
        }),
      );
    }
  };

  const restoreAll = () => {
    cancelRestore?.();
    cancelRestore = undefined;
    applied = false;

    for (const integration of integrations) {
      enqueue(integration, async () => {
        // Read once earlier steps have run, since an apply still running adds the entry when it finishes.
        const saved = entries[integration.id];
        if (saved === undefined) {
          return;
        }

        await attempt(integration, "off", async () => {
          await integration.restore(saved);
          delete entries[integration.id];
          ledger.write({ ...entries });
        });
      });
    }
  };

  restoreAll();

  return {
    get failures() {
      return [...failures.values()];
    },

    onFailuresChange(listener) {
      failureListeners.push(listener);
    },

    enteredCall() {
      cancelRestore?.();
      cancelRestore = undefined;

      if (!applied) {
        applyAll();
      }
    },

    leftCall() {
      if (applied && cancelRestore === undefined) {
        cancelRestore = clock.schedule(BACK_TO_BACK_WINDOW_MS, restoreAll);
      }
    },

    async quit() {
      restoreAll();

      await Promise.all(queues.values());
    },
  };
}
