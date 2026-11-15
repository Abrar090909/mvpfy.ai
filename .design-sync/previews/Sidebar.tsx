import { Sidebar } from 'mvpfy';

const projects = [
  {
    id: 'p1',
    repos: [{ url: 'https://github.com/acme/billing', dir: '/Users/pm/.mvpfy/projects/billing' }],
    localPath: '/Users/pm/.mvpfy/projects/billing',
    basePort: 4101,
    status: 'running' as const,
    lastStoryId: null,
    generatedFiles: [],
    mode: 'managed' as const,
  },
  {
    id: 'p2',
    repos: [{ url: '/Users/pm/code/storefront', dir: '/Users/pm/code/storefront' }],
    localPath: '/Users/pm/code/storefront',
    basePort: 4102,
    status: 'stopped' as const,
    lastStoryId: null,
    generatedFiles: [],
    mode: 'linked' as const,
  },
  {
    id: 'p3',
    repos: [{ url: 'https://github.com/acme/admin', dir: '/Users/pm/.mvpfy/projects/admin' }],
    localPath: '/Users/pm/.mvpfy/projects/admin',
    basePort: 4103,
    status: 'error' as const,
    lastStoryId: null,
    generatedFiles: [],
    mode: 'managed' as const,
  },
];

// An agent implementing a story in the open project.
const runs = {
  r1: {
    handle: { runId: 'r1', kind: 'plan-story' as const, projectId: 'p1', storyId: 'US-02' },
    log: '',
    running: true,
    exitCode: null,
    prUrl: null,
  },
};

const noop = () => {};

export const WithAgentWorking = () => (
  <div style={{ height: 520, display: 'flex' }}>
    <Sidebar
      projects={projects}
      activeProjectId="p1"
      screen="project"
      runs={runs}
      tenantConnected
      tenantSlug="acme"
      onSelectProject={noop}
      onAddProject={noop}
      onOpenSettings={noop}
      theme="dark"
      onToggleTheme={noop}
    />
  </div>
);

export const Empty = () => (
  <div style={{ height: 520, display: 'flex' }}>
    <Sidebar
      projects={[]}
      activeProjectId={null}
      screen="add"
      runs={{}}
      tenantConnected={false}
      tenantSlug={null}
      onSelectProject={noop}
      onAddProject={noop}
      onOpenSettings={noop}
      theme="dark"
      onToggleTheme={noop}
    />
  </div>
);
