import { describe, expect, test } from 'claude-code/testing'
import { beatTitle, folderName, ttyPath } from './register'

describe('tab-alert', () => {
  test('finds the terminal from ps output', () => {
    expect(ttyPath('ttys003\n')).toBe('/dev/ttys003')
    expect(ttyPath('pts/4')).toBe('/dev/pts/4')
    expect(ttyPath('??\nttys007\n')).toBe('/dev/ttys007')
    expect(ttyPath('?\n??\n')).toBeUndefined()
    expect(ttyPath('')).toBeUndefined()
  })

  test('the title alternates between the alert and the resting name', () => {
    expect(beatTitle(true, 'ultimate-status')).toBe('● Claude needs you')
    expect(beatTitle(false, 'ultimate-status')).toBe('ultimate-status')
  })

  test('resting name is the folder', () => {
    expect(folderName('/Users/me/Code/tab-alert')).toBe('tab-alert')
    expect(folderName('E:\\Code\\tab-alert\\')).toBe('tab-alert')
  })
})
