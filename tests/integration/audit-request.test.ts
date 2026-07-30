import { beforeEach, describe, expect, it } from 'vitest'
import {
  IP_DAILY_LIMIT,
  clientIp,
  handleAuditRequest,
  handleAuditVerify,
} from '@/lib/audit/handlers'
import type { AuditRequestDeps, AuditVerifyDeps } from '@/lib/audit/handlers'
import type { CreateAuditArgs } from '@/lib/audit/repository'
import { createVerifyToken } from '@/lib/audit/token'
import type { EmailContent } from '@/lib/email/templates'
import type { FreeAudit } from '@/lib/db/schema'

/**
 * 신청 → 인증 플로우가 실제로 이어지는지 증명한다.
 *
 * ★ DB도 메일 서버도 붙이지 않는다. 리포지토리와 발송기를 주입하므로 CI에서
 *   자격증명 없이 돌고 돈이 나가지 않는다. 실제 DB 왕복은 `pnpm probe:audit`이
 *   덮는다 — 두 검증의 역할이 다르다:
 *     - 여기: 라우트 본체의 **결정**(상태 코드, 리다이렉트, 발송 여부, 상한)
 *     - probe:audit: 리포지토리의 **SQL과 제약**
 *
 * ★ 토큰은 모조하지 않는다. `createVerifyToken`/`readVerifyToken`을 실제로
 *   태워야 "메일 본문의 링크를 그대로 눌렀을 때 통한다"를 증명할 수 있다.
 */

const APP_URL = 'https://cited.co.kr'

// ─────────────────────────────────────────────────────────────
// 가짜 저장소 — 실제 스키마의 기본값을 흉내낸다
// ─────────────────────────────────────────────────────────────

const sent: { to: string; content: EmailContent }[] = []
let rows: FreeAudit[] = []
let idCounter = 0
/** 발송 실패를 시뮬레이션한다 */
let sendFails = false

function makeAudit(args: CreateAuditArgs): FreeAudit {
  idCounter += 1
  return {
    id: `aud_test_${idCounter}`,
    brandName: args.brandName,
    category: args.category,
    email: args.email,
    emailVerified: false,
    competitors: args.competitors,
    selfDomains: args.selfDomains,
    aliases: [],
    tier: 'free',
    region: null,
    queries: null,
    guideMd: null,
    parentId: null,
    status: 'requested',
    source: 'web',
    result: null,
    failureReason: null,
    ipHash: args.ipHash,
    verifiedAt: null,
    sentAt: null,
    convertedSignupAt: null,
    createdAt: new Date(),
  } as FreeAudit
}

const sendEmail: AuditRequestDeps['sendEmail'] = async (params) => {
  if (sendFails) return { ok: false, reason: 'stub failure' }
  sent.push(params)
  return { ok: true, id: 'stub' }
}

const requestDeps: AuditRequestDeps = {
  createAuditRequest: async (args) => {
    const row = makeAudit(args)
    rows.push(row)
    return row
  },
  countRecentByIpHash: async (ipHash) => rows.filter((r) => r.ipHash === ipHash).length,
  // 실제 hashIp는 해시지만, 여기서 중요한 것은 "같은 IP가 같은 키로 뭉치는가"다.
  hashIp: (ip) => `h:${ip}`,
  sendEmail,
  appUrl: APP_URL,
}

const verifyDeps: AuditVerifyDeps = {
  markVerified: async (auditId, email) => {
    // 실제 SQL의 WHERE와 같은 조건: id·email이 맞고 아직 requested인 행만.
    const row = rows.find(
      (r) => r.id === auditId && r.email === email && r.status === 'requested',
    )
    if (!row) return null
    row.status = 'verified'
    row.emailVerified = true
    row.verifiedAt = new Date()
    return row
  },
  getAudit: async (auditId) => rows.find((r) => r.id === auditId) ?? null,
  sendEmail,
  operatorEmail: 'ops@example.com',
  appUrl: APP_URL,
}

beforeEach(() => {
  sent.length = 0
  rows = []
  idCounter = 0
  sendFails = false
})

function post(body: unknown, ip = '203.0.113.9'): Promise<Response> {
  return handleAuditRequest(
    new Request(`${APP_URL}/api/audit/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
    requestDeps,
  )
}

function verify(token: string): Promise<Response> {
  return handleAuditVerify(
    new Request(`${APP_URL}/api/audit/verify?token=${encodeURIComponent(token)}`),
    verifyDeps,
  )
}

/** 마지막으로 보낸 인증 메일 본문에서 토큰을 뽑는다 — 사용자가 하는 일과 같다. */
function tokenFromLastMail(): string {
  const html = sent.at(-1)?.content.html ?? ''
  const matched = /verify\?token=([^"&]+)/.exec(html)
  if (!matched?.[1]) throw new Error('메일 본문에 인증 링크가 없다')
  return decodeURIComponent(matched[1])
}

const valid = { brandName: '통합테스트', category: '패션', email: 'a@example.com' }

describe('진단 신청 → 인증 플로우', () => {
  it('신청하면 행이 생기고 확인 메일이 나간다', async () => {
    const res = await post(valid)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('requested')
    expect(rows[0]?.emailVerified).toBe(false)
    expect(sent.at(-1)?.to).toBe('a@example.com')
  })

  it('메일 본문의 링크를 그대로 눌러도 통한다', async () => {
    // ★ 이 테스트가 이 파일의 존재 이유다. 링크 조립(encodeURIComponent),
    //   HTML 이스케이프, 토큰 서명이 한 군데라도 어긋나면 여기서만 잡힌다.
    await post(valid)
    const res = await verify(tokenFromLastMail())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('state=verified')
    expect(rows[0]?.status).toBe('verified')
    expect(rows[0]?.verifiedAt).toBeInstanceOf(Date)
  })

  it('인증되면 운영자 알림이 나간다', async () => {
    await post(valid)
    const before = sent.length
    await verify(tokenFromLastMail())
    expect(sent.length).toBe(before + 1)
    expect(sent.at(-1)?.to).toBe('ops@example.com')
    // 운영자가 바로 실행할 수 있어야 한다 — 이 메일이 유일한 실행 트리거다.
    expect(sent.at(-1)?.content.html).toContain(`pnpm audit:run ${rows[0]?.id ?? ''}`)
  })

  it('운영자 알림에 신청자 주소가 원문으로 들어가지 않는다', async () => {
    await post(valid)
    await verify(tokenFromLastMail())
    expect(sent.at(-1)?.content.html).not.toContain('a@example.com')
  })

  it('같은 링크를 다시 눌러도 오류 화면을 보여주지 않는다', async () => {
    await post(valid)
    const token = tokenFromLastMail()
    await verify(token)
    const res = await verify(token)
    expect(res.headers.get('location')).toContain('state=already')
  })

  it('두 번째 클릭에는 운영자 알림을 다시 보내지 않는다', async () => {
    // 중복 알림은 운영자가 같은 건을 두 번 실행하게 만든다 — 원가가 두 배다.
    await post(valid)
    const token = tokenFromLastMail()
    await verify(token)
    const after = sent.length
    await verify(token)
    expect(sent.length).toBe(after)
  })

  it('위조 토큰은 invalid로 보낸다', async () => {
    for (const bad of ['forged.sig', '', 'a.b.c']) {
      const res = await verify(bad)
      expect(res.headers.get('location'), bad).toContain('state=invalid')
    }
  })

  it('없는 진단의 유효한 토큰도 invalid다', async () => {
    // 서명은 맞지만 행이 없다. 삭제된 신청의 링크를 누르는 경우다.
    const res = await verify(createVerifyToken('aud_nonexistent', 'a@example.com'))
    expect(res.headers.get('location')).toContain('state=invalid')
  })

  it('토큰의 이메일이 행과 다르면 인증되지 않는다', async () => {
    await post(valid)
    const id = rows[0]?.id ?? ''
    const res = await verify(createVerifyToken(id, 'attacker@example.com'))
    expect(res.headers.get('location')).toContain('state=invalid')
    expect(rows[0]?.status).toBe('requested')
  })

  it('리다이렉트가 우리 오리진으로만 간다', async () => {
    await post(valid)
    const res = await verify(tokenFromLastMail())
    expect(res.headers.get('location')?.startsWith(`${APP_URL}/`)).toBe(true)
  })
})

describe('입력 검증', () => {
  it('잘못된 입력은 400', async () => {
    expect((await post({ ...valid, brandName: '' })).status).toBe(400)
    expect((await post({ ...valid, email: 'not-an-email' })).status).toBe(400)
    expect((await post({ ...valid, competitors: ['a', 'b', 'c', 'd'] })).status).toBe(400)
    expect((await post({ ...valid, siteUrl: '무신사' })).status).toBe(400)
  })

  it('본문이 JSON이 아니면 400', async () => {
    const res = await handleAuditRequest(
      new Request(`${APP_URL}/api/audit/request`, { method: 'POST', body: 'not json' }),
      requestDeps,
    )
    expect(res.status).toBe(400)
  })

  it('검증 실패에는 행도 메일도 만들지 않는다', async () => {
    await post({ ...valid, email: 'nope' })
    expect(rows).toHaveLength(0)
    expect(sent).toHaveLength(0)
  })

  it('사이트 주소를 넣으면 호스트명만 저장된다', async () => {
    await post({ ...valid, siteUrl: 'https://www.Musinsa.com/kr/main' })
    expect(rows[0]?.selfDomains).toEqual(['musinsa.com'])
  })
})

describe('IP 상한', () => {
  it(`같은 IP는 ${IP_DAILY_LIMIT}건까지 받고 그 뒤로 429`, async () => {
    for (let i = 0; i < IP_DAILY_LIMIT; i += 1) {
      expect((await post(valid)).status, `${i + 1}번째`).toBe(200)
    }
    const res = await post(valid)
    expect(res.status).toBe(429)
    expect(rows).toHaveLength(IP_DAILY_LIMIT)
  })

  it('다른 IP는 상한에 걸리지 않는다', async () => {
    for (let i = 0; i < IP_DAILY_LIMIT; i += 1) await post(valid)
    expect((await post(valid, '198.51.100.1')).status).toBe(200)
  })

  it('상한에 걸리면 메일을 보내지 않는다', async () => {
    for (let i = 0; i < IP_DAILY_LIMIT; i += 1) await post(valid)
    const before = sent.length
    await post(valid)
    expect(sent.length).toBe(before)
  })
})

describe('발송 실패', () => {
  it('확인 메일 실패를 200으로 숨기지 않는다', async () => {
    // 숨기면 사용자는 오지 않는 메일을 기다리고 우리는 이유를 모른다.
    sendFails = true
    const res = await post(valid)
    expect(res.status).toBe(502)
  })

  it('확인 메일이 실패해도 신청 행은 남는다', async () => {
    // 운영자가 수동으로 이어받을 수 있어야 한다.
    sendFails = true
    await post(valid)
    expect(rows).toHaveLength(1)
  })

  it('운영자 알림이 실패해도 인증은 성공으로 둔다', async () => {
    await post(valid)
    const token = tokenFromLastMail()
    sendFails = true
    const res = await verify(token)
    expect(res.headers.get('location')).toContain('state=verified')
    expect(rows[0]?.status).toBe('verified')
  })

  it('OPERATOR_EMAIL이 없어도 인증은 성공한다', async () => {
    await post(valid)
    const res = await handleAuditVerify(
      new Request(`${APP_URL}/api/audit/verify?token=${encodeURIComponent(tokenFromLastMail())}`),
      { ...verifyDeps, operatorEmail: undefined },
    )
    expect(res.headers.get('location')).toContain('state=verified')
  })
})

describe('clientIp', () => {
  it('x-forwarded-for의 첫 항목을 쓴다', () => {
    // 뒤쪽은 프록시 체인이다. 마지막을 쓰면 전부 같은 값으로 뭉쳐
    // IP 상한이 사실상 전역 상한이 된다.
    const request = new Request(`${APP_URL}/x`, {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' },
    })
    expect(clientIp(request)).toBe('203.0.113.9')
  })

  it('헤더가 없으면 unknown', () => {
    expect(clientIp(new Request(`${APP_URL}/x`))).toBe('unknown')
  })

  it('빈 헤더도 unknown', () => {
    // 빈 문자열을 그대로 쓰면 해시 키가 되어 "헤더 없는 모든 요청"이
    // 한 통에 들어가는 것과 같아진다. 그건 unknown과 같은 취급이면 된다.
    const request = new Request(`${APP_URL}/x`, { headers: { 'x-forwarded-for': '  ' } })
    expect(clientIp(request)).toBe('unknown')
  })
})
