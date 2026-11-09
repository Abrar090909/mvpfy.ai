import type { AgentKind, RunSession } from '../../shared/types';

/**
 * Which conversation a feature's next run should use.
 *
 * Pulled out of the hook because it was being decided from React state that
 * had not settled yet. When a run failed because its conversation did not
 * exist, the repair forgot the id and immediately started another run — in
 * a microtask, before the update committed — so the retry read the same
 * dead id out of a stale closure and failed in exactly the same way. The
 * one automatic retry was spent achieving nothing, and the feature sat
 * saying it had stopped part-way.
 *
 * So "start a new conversation" is now something a caller asks for, rather
 * than something inferred from whether state has caught up.
 */
export interface SessionChoice {
  agent: AgentKind;
  /** The id recorded for this feature, if any. May be known-dead. */
  existing?: string | undefined;
  /** This run opens the feature's conversation (planning, or a pull). */
  open: boolean;
  /** The previous run's conversation was gone. Do not reuse the id. */
  reopen?: boolean;
  /** Supplied so the decision stays pure and testable. */
  newId: () => string;
}

export function sessionPlan(choice: SessionChoice): RunSession | undefined {
  const { agent, existing, open, reopen, newId } = choice;

  if (agent === 'codex') {
    // Codex cannot be handed an id for a thread that does not exist: its
    // first run opens one unasked and mvpfy reads the id back out. So a
    // reopen is simply "do not resume", and the next run starts a thread.
    if (reopen) return undefined;
    return existing ? { id: existing, resume: true } : undefined;
  }

  // Claude is given the id it will open, so a reopen mints a new one. The
  // dead id is never reused, whatever the stored state still says.
  if (reopen) return { id: newId(), resume: false };
  if (existing && !open) return { id: existing, resume: true };
  return { id: existing && open ? existing : newId(), resume: false };
}

/** True when this choice mints an id the project has to remember. */
export function mintsNewId(session: RunSession | undefined, existing?: string): boolean {
  return Boolean(session && !session.resume && session.id !== existing);
}
