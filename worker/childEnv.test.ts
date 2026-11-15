import { describe, expect, it } from 'vitest';
import { agentEnv, checkEnv } from './childEnv';

const env = {
  PATH: '/usr/local/bin:/usr/bin',
  HOME: '/home/mvpfy',
  MVPFY_RUNNER_TOKEN: 'runner',
  MVPFY_FEATURE1_URL: 'https://feature1.example',
  GH_TOKEN: 'gh',
  GITHUB_TOKEN: 'github',
  ANTHROPIC_API_KEY: 'anthropic',
  OPENAI_API_KEY: 'openai',
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
};

describe('agentEnv', () => {
  it("keeps what the agent signs in with and drops the worker's own credentials", () => {
    expect(agentEnv(env)).toEqual({
      PATH: '/usr/local/bin:/usr/bin',
      HOME: '/home/mvpfy',
      ANTHROPIC_API_KEY: 'anthropic',
      OPENAI_API_KEY: 'openai',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
    });
  });

  it('matches names regardless of case', () => {
    expect(agentEnv({ gh_token: 'x', mvpfy_runner_token: 'y' })).toEqual({});
  });
});

describe('checkEnv', () => {
  it("leaves a repository's scripts no credentials at all", () => {
    expect(checkEnv(env)).toEqual({ PATH: '/usr/local/bin:/usr/bin', HOME: '/home/mvpfy' });
  });
});
