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

  // ★ 아래는 전부 "조용히 틀리는" 사고를 막는 행이다. 부여는 무결과가 아니라
  //   틀린 결과를 만든다 — 돈 낸 고객이 팩 0개를 받거나, 크몽 연결이 끊긴 채
  //   부여가 성공한다. 증상은 몇 주 뒤 "빈 온보딩 폼"으로 처음 보인다.
  //   `--flag=값` 표기는 report-url.ts의 parseBaseUrlFlag가 같은 이유로 이미
  //   받고 있다(한쪽만 지원하면 조용히 기본값으로 떨어진다).
  test('--from-audit=aud_x1 — 등호 표기도 받는다', () => {
    const r = parseGrantArgs(['user@example.com', 'starter', '--from-audit=aud_x1'])
    expect(r).toEqual({
      ok: true,
      args: { email: 'user@example.com', plan: 'starter', queryPacks: 0, fromAuditId: 'aud_x1' },
    })
  })

  test('--packs=3 — 등호 표기도 받는다', () => {
    const r = parseGrantArgs(['user@example.com', 'starter', '--packs=3'])
    expect(r.ok && r.args.queryPacks).toBe(3)
  })

  test('--from-audit에 값이 없으면 거부 — null로 조용히 떨어지지 않는다', () => {
    const r = parseGrantArgs(['user@example.com', 'starter', '--from-audit'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('--from-audit')
  })

  test('--from-audit 값 자리에 다른 플래그가 오면 거부', () => {
    const r = parseGrantArgs(['user@example.com', 'starter', '--from-audit', '--packs', '2'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('--from-audit')
  })

  test('오타 옵션(--pack)은 무시하지 않고 이름을 대서 거부', () => {
    const r = parseGrantArgs(['user@example.com', 'starter', '--pack', '3'])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('--pack')
  })

  test('--packs 지수·16진 표기 거부 — Number()는 1e3을 1000으로 받는다', () => {
    for (const bad of ['1e3', '0x10', ' 3', '+3', '3.0']) {
      expect(parseGrantArgs(['a@b.co', 'starter', '--packs', bad]).ok).toBe(false)
    }
  })

  test('공백뿐인 이메일은 사용법 실패 — 빈 이름으로 조회까지 가지 않는다', () => {
    expect(parseGrantArgs(['   ', 'starter']).ok).toBe(false)
  })

  test('남는 위치 인자도 거부 — --packs를 빠뜨린 `... starter 3`', () => {
    expect(parseGrantArgs(['user@example.com', 'starter', '3']).ok).toBe(false)
  })
})
