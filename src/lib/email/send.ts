import { Resend } from 'resend'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import type { EmailContent } from './templates'

// ★ 모듈 최상위에서 `new Resend(...)`를 하지 않는다.
//
// Resend는 생성자에서 `Bearer <API key>`로 Headers를 만드는데, 키에 Latin-1을
// 벗어난 문자(예: 아직 채우지 않은 한글 플레이스홀더)가 있으면 그 자리에서
// TypeError를 던진다. 최상위에서 만들면 그 예외가 이 모듈 → auth.ts →
// /api/auth/[...all] 라우트의 모듈 평가를 통째로 깨서, 메일 설정 하나 때문에
// 인증 전체가 죽고 `next build`까지 실패한다 (실제로 겪은 실패다).
//
// 지연 생성 + try/catch로 "메일을 못 보냈다"는 사실을 발송 실패로만 가둔다.
let cachedClient: Resend | null = null

function getResend(): Resend {
  cachedClient ??= new Resend(env.RESEND_API_KEY)
  return cachedClient
}

/**
 * 발송 결과. **실패해도 예외를 던지지 않는다.**
 *
 * 이유 두 가지:
 *  1. Better Auth 1.6.25는 `emailVerification.sendVerificationEmail`에서 던진
 *     예외를 `runInBackgroundOrAwait`(node_modules/better-auth/dist/context/
 *     create-context.mjs)에서 try/catch로 삼킨다. 즉 여기서 던져 봐야 가입
 *     응답을 바꾸지 못하고 실패 "이유"만 소실된다.
 *  2. 주간 리포트처럼 배치로 여러 통을 보내는 이후 단계의 호출자는 한 통이
 *     실패해도 나머지를 계속 보내야 한다. 예외는 그 제어를 호출자에게서 뺏는다.
 *
 * 결과를 무시하면 타입 시스템이 잡아주지 못하므로, 호출자는 반드시 `ok`를 본다.
 */
export type SendEmailResult = { ok: true; id: string | null } | { ok: false; reason: string }

/** 로그·에러 문자열에서 이메일 주소를 마스킹한다. `reader@example.com` → `r***@e***.com` */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const tld = dot >= 0 ? domain.slice(dot) : ''
  return `${local[0] ?? ''}***@${domain[0] ?? ''}***${tld}`
}

// 외부(Resend) 에러 메시지에는 검증 실패한 수신자 주소가 그대로 실려 올 수 있다.
// 로그로 흘려보내기 전에 이메일처럼 생긴 문자열을 전부 마스킹한다.
const EMAIL_PATTERN = /[^\s<>@"]+@[^\s<>@"]+\.[^\s<>@".]+/g

function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, (m) => maskEmail(m))
}

export async function sendEmail(params: {
  to: string
  content: EmailContent
}): Promise<SendEmailResult> {
  // 이메일 원문은 절대 로그에 남기지 않는다 — 마스킹한 값만 쓴다.
  const to = maskEmail(params.to)

  let reason: string
  try {
    const { data, error } = await getResend().emails.send({
      from: env.EMAIL_FROM,
      to: params.to,
      subject: params.content.subject,
      html: params.content.html,
    })

    if (!error) {
      logger.info('email.sent', { id: data?.id ?? null, subject: params.content.subject, to })
      return { ok: true, id: data?.id ?? null }
    }
    reason = `${error.name}: ${error.message}`
  } catch (caught) {
    // 클라이언트 생성 실패(잘못된 API 키), 네트워크 장애·DNS 실패 등 SDK가
    // 던지는 모든 경우. 여기서도 밖으로 던지지 않는다.
    reason = caught instanceof Error ? caught.message : String(caught)
  }

  // 반환하는 reason도 마스킹한 것으로 통일한다. 호출자(auth.ts 등)가 이 값을
  // 그대로 로그에 넘기더라도 주소가 새지 않아야 한다 — 마스킹을 로그 직전에만
  // 하면 반환 경로가 뚫린다.
  const safeReason = redactEmails(reason)
  logger.error('email.send_failed', { subject: params.content.subject, to, reason: safeReason })
  return { ok: false, reason: safeReason }
}
