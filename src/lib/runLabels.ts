/** What each kind of run is called, for someone reading their own logs. */
export const RUN_LABELS: Record<string, string> = {
  'bootstrap-plan': 'Working out what the app needs',
  bootstrap: 'Setting the app up',
  'docker-up': 'Starting the environment',
  'docker-down': 'Stopping the environment',
  'ide-up': 'Starting the editor',
  'ide-down': 'Stopping the editor',
  migrate: 'Applying database migrations',
  seed: 'Adding the demo login and sample data',
  triage: 'Diagnosing a failure',
  instruct: 'Making a change',
  chat: 'Answering in the App tab',
  sync: 'Syncing repositories',
  readiness: 'Checking launch readiness',
  'readiness-fix': 'Fixing a readiness finding',
  'launch-plan': 'Pricing a launch',
  'plan-spec': 'Writing a product spec',
  'plan-story': 'Implementing a story',
  ship: 'Shipping a pull request',
  'raise-pr': 'Raising pull requests',
  'auto-merge': 'Asking GitHub to merge when checks pass',
  'run-client': 'Starting the app on your machine',
  'push-feature': 'Pushing the feature to Feature1',
  'sync-feature': 'Syncing the feature with Feature1',
  share: 'Sharing the app',
  'feature-change': 'Changing the feature',
  'resolve-merge': 'Resolving merge conflicts',
  'install-tools': 'Installing the required tools',
  'git-auth': 'Connecting git to GitHub',
};

/** A run kind as a person would say it; the raw kind when there is no label. */
export function runLabel(kind: string): string {
  return RUN_LABELS[kind] ?? kind;
}
