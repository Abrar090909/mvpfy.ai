import { describe, expect, it } from 'vitest';
import {
  IS_WIN,
  forgetLoginEnv,
  mergePosixPath,
  mergeWindowsPath,
  resolveUserEnvironment,
  cdTo,
  killProcessTree,
  openTerminalCommand,
  parseEnvDump,
  parseRegistryPath,
  resolveLoginEnv,
  shellQuote,
  spawnShell,
  spawnShellSync,
  winShellArgs,
} from './shell';

describe('shellQuote', () => {
  describe.runIf(!IS_WIN)('posix', () => {
    it('wraps plain values in single quotes', () => {
      expect(shellQuote('hello')).toBe("'hello'");
      expect(shellQuote('/Users/pm/projects/my app')).toBe("'/Users/pm/projects/my app'");
    });

    it('neutralizes shell metacharacters', () => {
      expect(shellQuote('$(rm -rf ~)')).toBe("'$(rm -rf ~)'");
      expect(shellQuote('a && b; c | d > e')).toBe("'a && b; c | d > e'");
      expect(shellQuote('`whoami`')).toBe("'`whoami`'");
    });

    it('escapes embedded single quotes', () => {
      expect(shellQuote("o'brien")).toBe("'o'\\''brien'");
      expect(shellQuote("'; rm -rf /; '")).toBe("''\\''; rm -rf /; '\\'''");
    });

    it('quotes the empty string', () => {
      expect(shellQuote('')).toBe("''");
    });
  });

  describe.runIf(IS_WIN)('windows', () => {
    it('wraps values in double quotes and doubles embedded quotes', () => {
      expect(shellQuote('hello')).toBe('"hello"');
      expect(shellQuote('say "hi"')).toBe('"say ""hi"""');
    });
  });
});

// Runs on every platform on purpose: the Windows quoting bug this guards
// against was invisible to a macOS-only test run.
describe('winShellArgs', () => {
  /** What cmd.exe /s does to the command line: drop the outer quote pair. */
  const afterCmdParses = (args: string[]): string => args[3].replace(/^"|"$/g, '');

  it('hands cmd.exe the command with its quoting intact', () => {
    const command = 'git clone "https://example.com/a.git" "C:\\Users\\pm\\.mvpfy\\projects\\a"';
    expect(afterCmdParses(winShellArgs(command))).toBe(command);
  });

  it('keeps quote characters out of a clone destination path', () => {
    const dest = 'C:\\Users\\mudas\\.mvpfy\\projects\\satorixr-backend-stack-2\\satorixr-backend';
    const parsed = afterCmdParses(winShellArgs(`git clone "https://x/y.git" "${dest}"`));
    // The literal path token cmd passes on must be the path and nothing else.
    expect(parsed.endsWith(`"${dest}"`)).toBe(true);
    expect(parsed).not.toContain('\\"');
  });

  it('passes /d and /s so no autorun script or stray quote interferes', () => {
    expect(winShellArgs('echo hi').slice(0, 3)).toEqual(['/d', '/s', '/c']);
  });
});

describe('parseRegistryPath', () => {
  const output = (value: string, type = 'REG_EXPAND_SZ') =>
    `\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    ${type}    ${value}\r\n\r\n`;

  it('reads the directories a user added to PATH', () => {
    const dirs = parseRegistryPath(output('C:\\Users\\mudas\\.local\\bin;C:\\tools'));
    expect(dirs).toEqual(['C:\\Users\\mudas\\.local\\bin', 'C:\\tools']);
  });

  it('expands %VAR% references, which is why the value is REG_EXPAND_SZ', () => {
    process.env.MVPFY_TEST_APPDATA = 'C:\\Users\\mudas\\AppData\\Roaming';
    try {
      expect(parseRegistryPath(output('%MVPFY_TEST_APPDATA%\\npm'))).toEqual([
        'C:\\Users\\mudas\\AppData\\Roaming\\npm',
      ]);
    } finally {
      delete process.env.MVPFY_TEST_APPDATA;
    }
  });

  it('leaves an unset variable alone rather than emitting a broken path', () => {
    expect(parseRegistryPath(output('%NOPE_NOT_SET%\\bin'))).toEqual(['%NOPE_NOT_SET%\\bin']);
  });

  it('handles REG_SZ and drops empty segments from a trailing semicolon', () => {
    expect(parseRegistryPath(output('C:\\a;;C:\\b;', 'REG_SZ'))).toEqual(['C:\\a', 'C:\\b']);
  });

  it('does not mistake PATHEXT for PATH', () => {
    const stdout =
      '\r\nHKEY_CURRENT_USER\\Environment\r\n    PATHEXT    REG_SZ    .COM;.EXE;.CMD\r\n\r\n';
    expect(parseRegistryPath(stdout)).toEqual([]);
  });

  it('returns nothing when the value is absent', () => {
    expect(parseRegistryPath('ERROR: The system was unable to find the specified value.')).toEqual(
      []
    );
  });
});

describe('cdTo', () => {
  it('quotes the directory', () => {
    expect(cdTo('/Users/pm/my app')).toContain(shellQuote('/Users/pm/my app'));
  });

  it.runIf(IS_WIN)('switches drive as well as directory on windows', () => {
    expect(cdTo('D:\\work\\repo')).toBe('cd /d "D:\\work\\repo"');
  });

  it.runIf(!IS_WIN)('is a plain cd on posix, where /d is not a flag', () => {
    expect(cdTo('/Users/pm/repo')).toBe("cd '/Users/pm/repo'");
  });
});

describe('killProcessTree', () => {
  it('does nothing for a missing child or a child with no pid', () => {
    expect(() => killProcessTree(undefined)).not.toThrow();
    expect(() => killProcessTree({ pid: undefined } as never)).not.toThrow();
  });

  it.runIf(!IS_WIN)('really does stop a spawned shell and its child', async () => {
    const child = spawnShell('sleep 30', {});
    const exited = new Promise<void>((resolve) => child.on('close', () => resolve()));
    killProcessTree(child);
    await exited;
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });

  it.runIf(!IS_WIN)('stops the grandchildren too, not just the shell', async () => {
    // A backgrounded `sleep` is a real grandchild — the shape of
    // `cd x && claude …` or `docker compose up` — which a signal to the shell
    // alone left running after Stop.
    const child = spawnShell('sleep 30 & echo $!; wait', {});
    const grandchild = await new Promise<number>((resolve) =>
      child.stdout?.once('data', (d: Buffer) => resolve(Number(String(d).trim())))
    );
    const exited = new Promise<void>((resolve) => child.on('close', () => resolve()));
    killProcessTree(child);
    await exited;
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await expect.poll(() => alive(grandchild), { timeout: 3_000 }).toBe(false);
  });
});

describe('openTerminalCommand', () => {
  it('opens in the project directory, quoted', () => {
    const command = openTerminalCommand('/Users/pm/my project');
    expect(command).toContain('my project');
    // A path with a space must survive as one argument, not two.
    expect(command).not.toMatch(/[^'"]\/Users\/pm\/my project/);
  });

  it.runIf(!IS_WIN && process.platform !== 'darwin')(
    'quotes the path inside the shell command too, not only as an argument',
    () => {
      // Linux falls back to `xterm -e <shell command>`, which puts the path
      // through a shell a second time. A folder named with a `;` or a `$(…)`
      // would otherwise run as a command — the folder is one the user picked,
      // so its name is not something to pass to a shell unquoted.
      const command = openTerminalCommand('/home/pm/weird; touch /tmp/pwned');
      expect(command).not.toContain('xterm -e "cd /home/pm/weird; touch');
      expect(command).toContain("'/home/pm/weird; touch /tmp/pwned'");
    }
  );

  it.runIf(IS_WIN)('uses cmd, and /d so another drive is followed', () => {
    expect(openTerminalCommand('D:\\work\\shop')).toContain('cd /d');
  });

  it.runIf(process.platform === 'darwin')('drives Terminal.app through osascript', () => {
    const command = openTerminalCommand('/Users/pm/shop');
    expect(command).toContain('osascript');
    expect(command).toContain('do script');
  });

  it.runIf(process.platform === 'linux')('tries several terminals, falling through', () => {
    // No single terminal exists on Linux, so the first that does wins.
    expect(openTerminalCommand('/home/pm/shop')).toContain('||');
  });
});

describe('resolving the profile once instead of per command', () => {
  // Every command used to run through `zsh -lc`, which sources the user's
  // profile — nvm and all — before the command starts. Measured on a
  // developer's machine: `git rev-parse` is 11ms on its own and 101ms that
  // way, and a refresh fires twenty to thirty of them. The profile is read
  // once now and reused.
  it('reads NUL-separated entries, splitting on the first =', () => {
    expect(parseEnvDump('PATH=/usr/bin\0HOME=/Users/pm\0')).toEqual({
      PATH: '/usr/bin',
      HOME: '/Users/pm',
    });
  });

  it('keeps a value that itself contains an =', () => {
    // A DSN or a connection string routinely does.
    expect(parseEnvDump('DSN=postgres://u:p@h/db?a=1&b=2\0').DSN).toBe(
      'postgres://u:p@h/db?a=1&b=2'
    );
  });

  it('keeps a value containing a newline, which a line parser would cut', () => {
    // The reason for -0: a line parser silently truncates these.
    expect(parseEnvDump('KEY=line one\nline two\0OTHER=x\0')).toEqual({
      KEY: 'line one\nline two',
      OTHER: 'x',
    });
  });

  it('ignores anything that is not an assignment', () => {
    expect(parseEnvDump('')).toEqual({});
    expect(parseEnvDump('\0\0')).toEqual({});
    expect(parseEnvDump('=orphan\0OK=1\0')).toEqual({ OK: '1' });
  });

  // The login shell is a POSIX thing; Windows reads PATH from the registry.
  it.runIf(!IS_WIN)('finds the tools a GUI app would otherwise miss', () => {
    // The whole reason the login shell was there. If this fails, the fix
    // has broken every command rather than merely slowed it.
    const env = resolveLoginEnv();
    expect(env.PATH, 'a PATH is the point').toBeTruthy();
    const found = spawnShellSync('command -v git', { encoding: 'utf8', timeout: 10_000 });
    expect(found.status, 'git must still be findable').toBe(0);
    expect(String(found.stdout).trim()).toMatch(/git/);
  });

  it.runIf(!IS_WIN)('lets a caller override what the profile said', () => {
    // Callers ask for specific things — a Docker context, a git prompt
    // turned off — and those must win over the inherited value.
    const res = spawnShellSync('echo "$MVPFY_TEST_MARKER"', {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, MVPFY_TEST_MARKER: 'from-the-caller' },
    });
    expect(String(res.stdout).trim()).toBe('from-the-caller');
  });
});

describe('resolving the user environment without blocking', () => {
  it.runIf(!IS_WIN)('puts the shell PATH first, then the inherited one, without duplicates', () => {
    const merged = mergePosixPath('/opt/x/bin:/usr/bin', '/usr/bin:/bin').split(':');
    expect(merged.slice(0, 3)).toEqual(['/opt/x/bin', '/usr/bin', '/bin']);
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged).toContain('/opt/homebrew/bin');
  });

  it('adds the registry and install folders to the Windows PATH, trimmed and once', () => {
    const merged = mergeWindowsPath('C:\\a; C:\\b', ['C:\\b', 'C:\\c ']).split(';');
    expect(merged.slice(0, 3)).toEqual(['C:\\a', 'C:\\b', 'C:\\c']);
    expect(new Set(merged).size).toBe(merged.length);
  });

  it.runIf(!IS_WIN)(
    'leaves the login environment ready, so commands need no second shell',
    async () => {
      forgetLoginEnv();
      await resolveUserEnvironment();
      expect(resolveLoginEnv().PATH).toBeTruthy();
      const found = spawnShellSync('command -v git', { encoding: 'utf8', timeout: 10_000 });
      expect(found.status).toBe(0);
    },
    // An interactive login shell with no terminal can take its full 10 s.
    30_000
  );
});
