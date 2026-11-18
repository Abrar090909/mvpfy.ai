import { describe, expect, it } from 'vitest';
import { troubleReport } from './trouble';

const none = { failedLog: null, unresponsive: false, stoppedServices: [] };

describe('troubleReport', () => {
  it('says nothing when nothing is wrong', () => {
    // The Agent tab must not describe a problem that does not exist.
    expect(troubleReport(none)).toBe('');
  });

  it('names the services that stopped, and what they exited with', () => {
    const report = troubleReport({
      ...none,
      stoppedServices: [{ service: 'db', state: 'exited', exitCode: 1 }],
    });
    expect(report).toContain('db: exited (exit 1)');
    expect(report).toContain('NOT WORKING');
  });

  it('explains a silent app when every container is up', () => {
    const report = troubleReport({ ...none, unresponsive: true });
    expect(report).toContain('Every container is running');
    expect(report).toContain('different port');
  });

  it('prefers the stopped services over the generic explanation', () => {
    // Naming what died beats guessing about ports.
    const report = troubleReport({
      ...none,
      unresponsive: true,
      stoppedServices: [{ service: 'web', state: 'exited', exitCode: 137 }],
    });
    expect(report).toContain('web: exited (exit 137)');
    expect(report).not.toContain('Every container is running');
  });

  it('carries the log, which exists nowhere on disk for an agent to find', () => {
    expect(troubleReport({ ...none, failedLog: 'connection refused' })).toContain(
      'connection refused'
    );
  });

  it('leaves out an exit code of zero rather than printing (exit 0)', () => {
    expect(
      troubleReport({ ...none, stoppedServices: [{ service: 'w', state: 'exited', exitCode: 0 }] })
    ).toContain('w: exited\n');
  });
});

describe('troubleReport host advice', () => {
  it('reports the machine setup alongside the failure, and tells the agent whose it is', () => {
    // The commonest "it will not start" on a laptop is a start that was only
    // ever going to be slow, and an agent that cannot see that spends its
    // time rewriting the compose file.
    const report = troubleReport({
      failedLog: 'health check timed out',
      unresponsive: false,
      stoppedServices: [],
      hostAdvice: ['File sharing is not using VirtioFS.'],
    });
    expect(report).toContain('VirtioFS');
    expect(report).toContain("human's settings");
  });

  it('stays silent about the machine when nothing is wrong with the run', () => {
    // Standing advice is not a reason to declare the environment broken.
    expect(
      troubleReport({
        failedLog: null,
        unresponsive: false,
        stoppedServices: [],
        hostAdvice: ['File sharing is not using VirtioFS.'],
      })
    ).toBe('');
  });

  it('says nothing extra when there is no advice', () => {
    const report = troubleReport({
      failedLog: 'boom',
      unresponsive: false,
      stoppedServices: [],
    });
    expect(report).toContain('boom');
    expect(report).not.toContain('slower than it has to be');
  });
});
