import { describe, expect, test } from 'bun:test'
import { versionFromGitDescribe } from './build-info'

describe('versionFromGitDescribe', () => {
  test('keeps an exact tag', () => {
    expect(versionFromGitDescribe('v1.0.0')).toBe('v1.0.0')
  })

  test('drops the hash from a long description', () => {
    expect(versionFromGitDescribe('v1.0.0-2-g62a752e')).toBe('v1.0.0-2')
    expect(versionFromGitDescribe('v1.2.3-10-gabcdef0')).toBe('v1.2.3-10')
  })

  test('drops a dirty suffix along with the hash', () => {
    expect(versionFromGitDescribe('v1.0.0-2-g62a752e-dirty')).toBe('v1.0.0-2')
  })

  test('keeps a prerelease tag plus commit increment', () => {
    expect(versionFromGitDescribe('v1.0.0-rc.1-2-gabcdef0')).toBe('v1.0.0-rc.1-2')
  })

  test('leaves a bare object name unchanged', () => {
    expect(versionFromGitDescribe('62a752e')).toBe('62a752e')
  })
})
