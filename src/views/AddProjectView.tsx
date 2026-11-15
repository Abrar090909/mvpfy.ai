import { BlankProjectRemote, MvpfyState } from '../../shared/types';
import { UpdateState } from '../hooks/useProjectController';
import { useAddProject } from '../hooks/useAddProject';

interface Props {
  state: MvpfyState;
  updateState: UpdateState;
  onCreated: (projectId: string) => void;
}

const STEPS = [
  ['01', 'Add & inspect', 'Detects services, ports and dependencies.'],
  ['02', 'Bootstrap', 'Starts on its own: writes mvpfy.yml, a compose file and demo logins.'],
  ['03', 'Run', 'Brings the app up and hands you a link and a demo login to try it.'],
] as const;

export default function AddProjectView({ state, updateState, onCreated }: Props) {
  const {
    text,
    setText,
    cloning,
    inPlace,
    setInPlace,
    error,
    setError,
    source,
    setSource,
    newName,
    setNewName,
    remoteKind,
    setRemoteKind,
    remoteUrl,
    setRemoteUrl,
    notice,
    firstRun,
    looksLocal,
    add,
    startFromScratch,
    browse,
  } = useAddProject(state, updateState, onCreated);

  return (
    <div className="mx-auto grid w-full max-w-[1080px] items-start gap-10 px-6 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-16">
      <div className="lg:sticky lg:top-10">
        <span className="chip">Your product workspace</span>
        <h2 className="mt-5 text-[34px] font-semibold leading-[1.08] tracking-display xl:text-[40px]">
          From idea to
          <br />
          your next release.
        </h2>
        <p className="mt-5 max-w-[360px] text-[15px] leading-relaxed text-body">
          Bring your code or start fresh. Plan features, build with your agent, and test your app in
          one place.
        </p>
        <div className="mt-8 space-y-6">
          {(source === 'existing'
            ? STEPS
            : [
                ['01', 'Create your workspace', 'Choose a name and where to keep your code.'],
                [
                  '02',
                  'Plan your first feature',
                  'Describe your idea and review the product spec.',
                ],
                ['03', 'Build & try it', 'Let your agent implement it, then test the running app.'],
              ]
          ).map(([n, title, desc]) => (
            <div key={n} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-[11px] text-brand">
                {n}
              </span>
              <div>
                <div className="text-sm font-medium">{title}</div>
                <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-muted">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <section className="card p-6 sm:p-8">
        <h1 className="mb-5 text-[24px] font-semibold tracking-[-0.02em]">
          {firstRun ? 'Add your first project' : 'Add a project'}
        </h1>
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-sunken p-1">
          {(
            [
              ['existing', 'I have code already'],
              ['new', 'Start something new'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={source === key}
              disabled={cloning}
              onClick={() => {
                setSource(key);
                setError(null);
              }}
              className={`h-[34px] rounded-md px-3.5 text-[13px] ${
                source === key
                  ? 'bg-surface font-medium text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'new' ? (
          <NewProductPane
            name={newName}
            onName={setNewName}
            remoteKind={remoteKind}
            onRemoteKind={setRemoteKind}
            remoteUrl={remoteUrl}
            onRemoteUrl={setRemoteUrl}
            busy={cloning}
            onCreate={() => void startFromScratch()}
          />
        ) : (
          <>
            <p className="mb-7 text-sm leading-relaxed text-body [text-wrap:pretty]">
              Add a GitHub repository or a local folder. On Replit or Lovable? Push your project to
              GitHub first, then paste its URL here. Setup takes a few minutes on your agent
              subscription.
            </p>

            <label htmlFor="project-repositories" className="section-label mb-1.5 block">
              Repository URLs or folder paths
            </label>
            <textarea
              id="project-repositories"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'https://github.com/org/frontend\nhttps://github.com/org/backend\n~/code/local-service'
              }
              disabled={cloning}
              className="h-[104px] w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-3 font-mono text-[13px] leading-[1.7] outline-none placeholder:text-faint focus:border-muted"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => void add()}
                disabled={cloning || !text.trim()}
                className="btn-primary h-[38px] px-4 text-sm disabled:opacity-50"
              >
                {cloning ? 'Adding…' : 'Add & bootstrap'}
              </button>
              <button
                onClick={browse}
                disabled={cloning}
                className="btn-secondary h-[38px] px-4 text-sm disabled:opacity-50"
              >
                Browse local folders…
              </button>
              <span className="ml-auto text-xs text-muted">One per line</span>
            </div>
            {looksLocal && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-sunken px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={inPlace}
                  onChange={(e) => setInPlace(e.target.checked)}
                  className="mt-0.5 accent-ink"
                />
                <span className="text-[12.5px] leading-relaxed text-body">
                  <span className="font-medium text-ink">
                    Use this folder in place — don&apos;t copy.
                  </span>{' '}
                  mvpfy works directly in your folder: the agent edits your working copy, and
                  everything mvpfy generates stays inside a{' '}
                  <span className="font-mono">.mvpfy/</span> subfolder. Removing the project later
                  only removes that subfolder and the containers — never your code.
                </span>
              </label>
            )}
          </>
        )}
        {error && <p className="mt-3 whitespace-pre-wrap text-[13px] text-danger">{error}</p>}
        {notice && (
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-warn-border bg-warn-bg px-3.5 py-3 text-[12.5px] text-warn-text">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Starting a product that does not exist yet.
 *
 * Deliberately one field. Everything else about a new product — what it is
 * built with, how it is run — is decided later by the people and the code that
 * can actually answer it, not by a form asked before anything exists.
 */
function NewProductPane({
  name,
  onName,
  remoteKind,
  onRemoteKind,
  remoteUrl,
  onRemoteUrl,
  busy,
  onCreate,
}: {
  name: string;
  onName: (v: string) => void;
  remoteKind: BlankProjectRemote['kind'];
  onRemoteKind: (v: BlankProjectRemote['kind']) => void;
  remoteUrl: string;
  onRemoteUrl: (v: string) => void;
  busy: boolean;
  onCreate: () => void;
}) {
  const ready = name.trim() !== '' && (remoteKind !== 'existing' || remoteUrl.trim() !== '');
  const options: Array<[BlankProjectRemote['kind'], string, string]> = [
    [
      'create',
      'Create one for me',
      'A new private GitHub repository, using the CLI you are signed in to.',
    ],
    [
      'existing',
      'Use a repository I already have',
      'For the empty repository you have just made. mvpfy pushes the first commit to it.',
    ],
    [
      'none',
      'No remote for now',
      'Everything works except raising a pull request, which has nowhere to push.',
    ],
  ];
  return (
    <>
      <p className="mb-7 text-sm leading-relaxed text-body [text-wrap:pretty]">
        No repository, no code — just an idea. mvpfy makes the repository, then you plan the first
        feature and it writes the product to match. The environment is set up once there is
        something to run.
      </p>

      <label htmlFor="project-name" className="section-label mb-1.5 block">
        What are you building?
      </label>
      <input
        id="project-name"
        value={name}
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ready) onCreate();
        }}
        placeholder="Invoice tracker"
        disabled={busy}
        className="h-[38px] w-full rounded-lg border border-line bg-surface px-3.5 text-[13.5px] outline-none placeholder:text-faint focus:border-muted"
      />

      <label className="section-label mb-1.5 mt-5 block">Where should it push?</label>
      <div className="flex flex-col gap-1.5">
        {options.map(([kind, label, note]) => (
          <label
            key={kind}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-3 ${
              remoteKind === kind ? 'border-muted bg-surface' : 'border-line bg-sunken'
            }`}
          >
            <input
              type="radio"
              name="blank-remote"
              checked={remoteKind === kind}
              onChange={() => onRemoteKind(kind)}
              disabled={busy}
              className="mt-0.5 accent-ink"
            />
            <span className="text-[12.5px] leading-relaxed text-body">
              <span className="font-medium text-ink">{label}.</span> {note}
            </span>
          </label>
        ))}
      </div>

      {remoteKind === 'existing' && (
        <input
          aria-label="Existing GitHub repository URL"
          value={remoteUrl}
          onChange={(e) => onRemoteUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) onCreate();
          }}
          placeholder="https://github.com/acme/invoice-tracker.git"
          disabled={busy}
          spellCheck={false}
          className="mt-2 h-[38px] w-full rounded-lg border border-line bg-surface px-3.5 font-mono text-[12.5px] outline-none placeholder:text-faint focus:border-muted"
        />
      )}

      <div className="mt-4 flex items-center gap-2.5">
        <button
          onClick={onCreate}
          disabled={busy || !ready}
          className="btn-primary h-[38px] px-4 text-sm disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create project'}
        </button>
      </div>
    </>
  );
}
