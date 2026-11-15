import { StatusBar } from 'mvpfy';

const project = {
  id: 'p1',
  repos: [{ url: 'https://github.com/acme/billing', dir: '/Users/pm/.mvpfy/projects/billing' }],
  localPath: '/Users/pm/.mvpfy/projects/billing',
  basePort: 4101,
  status: 'running' as const,
  lastStoryId: null,
  generatedFiles: [],
};

const working = {
  r1: {
    handle: { runId: 'r1', kind: 'plan-story' as const, projectId: 'p1', storyId: 'US-02' },
    log: '',
    running: true,
    exitCode: null,
    prUrl: null,
  },
};

const noop = () => {};

export const Running = () => (
  <StatusBar
    project={project}
    runs={working}
    version="1.0.0-beta.49"
    update={null}
    onInstallUpdate={noop}
    onDownloadUpdate={noop}
  />
);

export const UpdateReady = () => (
  <StatusBar
    project={{ ...project, status: 'stopped' }}
    runs={{}}
    version="1.0.0-beta.49"
    update={{ kind: 'downloaded', version: '1.0.0-beta.50' }}
    onInstallUpdate={noop}
    onDownloadUpdate={noop}
  />
);
