// 무료 진단 신청 접수와 이메일 인증의 본체.
//
// ★ 라우트 파일이 아니라 여기에 로직을 둔다 — `src/lib/cron/cleanup-sessions.ts`와
//   같은 이유다. 의존성을 주입하면 이 플로우를 **DB도 메일 서버도 없이** 테스트할
//   수 있고, 그래야 CI에서 돈 한 푼 없이 돈다. 라우트는 실제 의존성만 꽂는다.
//
// ★ **이 태스크의 유일한 보안 요구사항: 인증 전에는 어떤 외부 API도 호출하지
//   않는다.** 신청 접수는 DB 쓰기 1회 + 메일 1통이 전부다. 그래서 Turnstile도,
//   예산 킬스위치도 필요 없다 — 태울 돈이 없다. 이 성질을 깨는 변경(예: 접수
//   시점에 카테고리를 LLM으로 추론)은 그 방어를 같이 가져와야 한다.
import 'server-only'

import { z } from 'zod'
import { parseAuditRequest } from '@/lib/audit/request-schema'
import { createVerifyToken, readVerifyToken } from '@/lib/audit/token'
import type { CreateAuditArgs } from '@/lib/audit/repository'
import type { FreeAudit } from '@/lib/db/schema'
import type { SendEmailResult } from '@/lib/email/send'
import { auditRequestedNotice, auditVerificationEmail } from '@/lib/email/templates'
import type { EmailContent } from '@/lib/email/templates'
import { logger } from '@/lib/logger'

/**
 * 같은 IP의 24시간 신청 수 상한.
 *
 * ★ 이것은 **비용 방어가 아니다.** 인증 전에는 외부 API를 부르지 않으므로
 *   태울 돈이 없다. 신청 테이블이 스팸으로 차서 운영자 대기 목록이 못 쓰게
 *   되는 것만 막는다. 그래서 값이 넉넉하다 — 회사 NAT 뒤에서 여러 명이
 *   신청하는 정상 상황을 막으면 안 된다.
 */
export const IP_DAILY_LIMIT = 10

/** 상한을 세는 창. `countRecentByIpHash`에 그대로 넘어간다. */
export const IP_LIMIT_WINDOW_HOURS = 24

export type SendMail = (params: { to: string; content: EmailContent }) => Promise<SendEmailResult>

export interface AuditRequestDeps {
  createAuditRequest: (args: CreateAuditArgs) => Promise<FreeAudit>
  countRecentByIpHash: (ipHash: string, sinceHours: number) => Promise<number>
  hashIp: (ip: string) => string
  sendEmail: SendMail
  /** `env.NEXT_PUBLIC_APP_URL`. 인증 링크의 오리진이 된다. */
  appUrl: string
}

export interface AuditVerifyDeps {
  markVerified: (auditId: string, email: string) => Promise<FreeAudit | null>
  getAudit: (auditId: string) => Promise<FreeAudit | null>
  sendEmail: SendMail
  /** `env.OPERATOR_EMAIL`. 없으면 알림을 보내지 않는다(배포에서는 env가 막는다). */
  operatorEmail: string | undefined
  appUrl: string
}

/**
 * 클라이언트 IP.
 *
 * Vercel은 `x-forwarded-for`의 **첫 번째** 항목이 실제 클라이언트다 —
 * 뒤쪽은 프록시 체인이다. 마지막을 쓰면 전부 같은 값으로 뭉쳐 상한이
 * 사실상 전역 상한이 된다.
 *
 * 헤더는 클라이언트가 위조할 수 있다. 그래도 문제없다 — 이 값은 비용 방어가
 * 아니라 스팸 정리용이고, 위조 가능성 때문에 정상 사용자를 막는 쪽으로
 * 강화하면 손해가 더 크다.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export async function handleAuditRequest(
  request: Request,
  deps: AuditRequestDeps,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: '요청 형식이 올바르지 않습니다' }, 400)
  }

  let input: ReturnType<typeof parseAuditRequest>
  try {
    input = parseAuditRequest(body)
  } catch (error) {
    // ★ 첫 이슈의 메시지를 그대로 돌려준다. zod의 기본 메시지는 영어지만
    //   폼(Task 8)이 필드별로 자체 안내를 띄우고, 이 응답은 그 백업이다.
    const message =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? '입력값을 확인해 주세요')
        : '입력값을 확인해 주세요'
    return json({ ok: false, error: message }, 400)
  }

  const ipHash = deps.hashIp(clientIp(request))
  if ((await deps.countRecentByIpHash(ipHash, IP_LIMIT_WINDOW_HOURS)) >= IP_DAILY_LIMIT) {
    logger.warn('audit.rate_limited', { ipHash })
    return json(
      { ok: false, error: '오늘 신청 가능한 횟수를 초과했습니다. 내일 다시 시도해 주세요.' },
      429,
    )
  }

  // ★ 필드를 하나씩 적는다. `{ ...input, ipHash }`로 넘기면 `siteUrl`(컬럼이
  //   아니다 — `selfDomains`로 정규화되기 전의 원본 입력이다)이 그대로 따라가고,
  //   나중에 스키마에 필드가 늘 때마다 조용히 새어 들어간다.
  const audit = await deps.createAuditRequest({
    brandName: input.brandName,
    category: input.category,
    email: input.email,
    competitors: input.competitors,
    selfDomains: input.selfDomains,
    ipHash,
  })

  const token = createVerifyToken(audit.id, audit.email)
  const url = `${deps.appUrl}/api/audit/verify?token=${encodeURIComponent(token)}`
  const sent = await deps.sendEmail({
    to: audit.email,
    content: auditVerificationEmail({ url, brandName: audit.brandName }),
  })

  // ★ 메일 발송 실패를 200으로 숨기지 않는다. 사용자는 오지 않는 메일을
  //   기다리게 되고, 우리는 신청이 방치된 이유를 모른다.
  //   신청 행은 이미 만들어졌으므로 운영자가 수동으로 이어받을 수 있다.
  if (!sent.ok) {
    logger.error('audit.verification_email_failed', { auditId: audit.id, reason: sent.reason })
    return json(
      { ok: false, error: '확인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      502,
    )
  }

  logger.info('audit.requested', { auditId: audit.id })
  return json({ ok: true })
}

export async function handleAuditVerify(
  request: Request,
  deps: AuditVerifyDeps,
): Promise<Response> {
  const redirect = (state: string) =>
    Response.redirect(new URL(`/audit/requested?state=${state}`, deps.appUrl), 307)

  const token = new URL(request.url).searchParams.get('token')
  const payload = token ? readVerifyToken(token) : null
  if (!payload) {
    logger.warn('audit.verify_invalid_token', { present: Boolean(token) })
    return redirect('invalid')
  }

  const verified = await deps.markVerified(payload.auditId, payload.email)

  // ★ 이미 인증된 건을 눌러도 실패 화면을 보여주지 않는다. 메일 링크를 두 번
  //   누르는 것은 흔하고, 그게 오류처럼 보이면 사용자는 무언가 잘못됐다고 믿는다.
  if (!verified) {
    const existing = await deps.getAudit(payload.auditId)
    if (existing?.emailVerified) return redirect('already')
    return redirect('invalid')
  }

  // 운영자 알림. 실패해도 인증 자체는 성공으로 둔다 — 사용자 책임이 아니다.
  // 다만 로그에 남겨야 한다. **이 메일이 유일한 실행 트리거다.**
  if (deps.operatorEmail) {
    const notice = await deps.sendEmail({
      to: deps.operatorEmail,
      content: auditRequestedNotice({ audit: verified }),
    })
    if (!notice.ok) {
      logger.error('audit.operator_notice_failed', { auditId: verified.id, reason: notice.reason })
    }
  } else {
    // env가 배포에서 이걸 막지만, 로컬에서 이 경로를 밟는 것은 정상이다.
    // 그래도 남긴다 — 알림 없이 인증된 건은 운영자가 찾아야 한다.
    logger.warn('audit.operator_email_unset', { auditId: verified.id })
  }

  logger.info('audit.verified', { auditId: verified.id })
  return redirect('verified')
}
