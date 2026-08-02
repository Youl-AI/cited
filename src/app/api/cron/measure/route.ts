import { handleMeasure } from '@/lib/cron/measure'
import { loadMeasureContext, measureBrand } from '@/lib/cron/measure-run'
import { sendEmail } from '@/lib/email/send'
import { measureFailureNotice } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

// cleanup-sessions와 같은 이유 — 프리렌더되면 크론이 캐시 응답만 받는다.
export const dynamic = 'force-dynamic'
// 실측 1브랜드 233초 (스펙 ③). Vercel Fluid Compute 상한 안이다.
export const maxDuration = 300

/** GitHub Actions cron이 POST로 호출한다 (`.github/workflows/measure.yml`). */
export async function POST(request: Request): Promise<Response> {
  return handleMeasure(request, {
    secret: env.CRON_SECRET,
    // 핸들러가 정한 시계를 그대로 넘긴다 — 어댑터가 따로 `new Date()`를 잡으면
    // KST 하루 경계를 두 번 계산하게 된다.
    loadDueContext: (now) => loadMeasureContext(now),
    measureBrand,
    notifyFailure: async ({ brandId, brandName, reason, attempt }) => {
      // OPERATOR_EMAIL은 배포에서 필수(env.ts superRefine). 로컬 미설정이면
      // 조용히 생략 — 알림 없는 로컬 실패는 콘솔 로그로 충분하다.
      if (!env.OPERATOR_EMAIL) return
      const sent = await sendEmail({
        to: env.OPERATOR_EMAIL,
        content: measureFailureNotice({ brandName, brandId, reason, attempt }),
      })
      // ★ `sendEmail`은 실패해도 던지지 않는다(send.ts 주석). 결과를 보지 않으면
      //   "측정 실패 + 메일도 실패"가 통째로 침묵한다 — 실패 신호가 메일뿐인데.
      if (!sent.ok) {
        logger.error('cron.measure.notice_send_failed', { brandId, reason: sent.reason })
      }
    },
  })
}
