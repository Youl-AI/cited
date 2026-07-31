import { describe, expect, test } from 'vitest'
import { parseGrantArgs } from './grant-args'

describe('parseGrantArgs', () => {
  test('기본형: 이메일 + 플랜', () => {
    const r = parseGrantArgs(['user@example.com', 'starter'])
    expect(r).toEqual({
      ok: true,
      args: { email: 'user@example.com', plan: 'starter', queryPacks: 0, fromAuditId: null },
    })
  })

  test('--packs와 --from-audit', () => {
    const r = parseGrantArgs(['user@example.com', 'business', '--from-audit', 'aud_x1', '--packs', '2'])
    expect(r).toEqual({
      ok: true,
      args: { email: 'user@example.com', plan: 'business', queryPacks: 2, fromAuditId: 'aud_x1' },
    })
  })

  test('이메일은 소문자로 정규화한다 — user 테이블 unique 매칭', () => {
    const r = parseGrantArgs(['User@Example.COM', 'starter'])
    expect(r.ok && r.args.email).toBe('user@example.com')
  })

  test('free는 부여할 수 없다 — 부여는 유료 플랜만', () => {
    const r = parseGrantArgs(['user@example.com', 'free'])
    expect(r.ok).toBe(false)
  })

  test('--packs 음수·소수·NaN 거부', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(parseGrantArgs(['a@b.co', 'starter', '--packs', bad]).ok).toBe(false)
    }
  })

  test('인자 부족이면 사용법 안내용 실패', () => {
    expect(parseGrantArgs(['user@example.com']).ok).toBe(false)
  })
})
