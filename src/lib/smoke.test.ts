import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs typescript with path aliases', async () => {
    const mod = await import('@/lib/version')
    expect(mod.APP_NAME).toBe('Cited')
  })
})
