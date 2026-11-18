import { ServiceState } from '../../shared/types';

/**
 * What is wrong with the environment right now, in a form an agent can act on.
 *
 * Shared by Diagnose & fix and by the Agent tab: asking "why will my app not
 * start?" should begin from the same evidence the diagnose button has, not
 * from nothing. The run log only exists in memory, so an agent sent to look
 * for it would find nothing at all.
 *
 * Empty when nothing is wrong — the caller then says nothing rather than
 * describing a problem that does not exist.
 */
export function troubleReport(input: {
  /** Tail of the run that failed, when one did. */
  failedLog: string | null;
  /** The app started but never answered: a failure with no failed run. */
  unresponsive: boolean;
  stoppedServices: ServiceState[];
  /**
   * Standing facts about this machine's Docker, not failures of this run.
   * Included because the commonest shape of "it will not start" on a laptop
   * is a start that was only ever going to be slow — a health check giving up
   * on a stack whose file access is several times slower than it needs to be.
   * An agent that cannot see that spends its time in the compose file.
   */
  hostAdvice?: string[];
}): string {
  const { failedLog, unresponsive, stoppedServices, hostAdvice = [] } = input;
  if (!failedLog && !unresponsive && stoppedServices.length === 0) return '';

  const parts: string[] = [];
  if (stoppedServices.length > 0) {
    parts.push(
      'These services are not running:\n' +
        stoppedServices
          .map((s) => `${s.service}: ${s.state}${s.exitCode ? ` (exit ${s.exitCode})` : ''}`)
          .join('\n') +
        '\nTheir container logs say why.'
    );
  } else if (unresponsive) {
    parts.push(
      'Every container is running, but nothing answers on the app port. The app is likely ' +
        'failing during startup, or listening on a different port than the compose file ' +
        'publishes.'
    );
  }
  if (failedLog) {
    parts.push(`Tail of the last environment run:\n---\n${failedLog}\n---`);
  }
  if (hostAdvice.length > 0) {
    // Last, and labelled as the machine's setup: it explains slowness, it is
    // rarely the whole cause, and an agent that reads it first will change
    // Docker Desktop's settings instead of fixing the stack.
    parts.push(
      "This machine's Docker setup is also making everything here slower than it has to " +
        `be:\n${hostAdvice.map((line) => `• ${line}`).join('\n')}\n` +
        "These are the human's settings to change, not yours — mention them, do not try " +
        'to work around them in the compose file.'
    );
  }
  return `THE ENVIRONMENT IS NOT WORKING RIGHT NOW.\n\n${parts.join('\n\n')}`;
}
