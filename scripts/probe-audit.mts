/**
 * 진단 신청 리포지토리를 **실제 DB**에 왕복시킨다.
 *
 *   pnpm probe:audit
 *
 * 단위 테스트는 DB 없이 도는 것(토큰·질의·검증)만 덮는다. 여기서 확인하는 것은
 * 그 밖의 것이다 — jsonb 왕복, CHECK 제약, 상태 전이 조건, `.returning()`이
 * 실제로 행을 돌려주는가.
 *
 * ★ API를 부르지 않으므로 돈이 들지 않는다.
 * ★ 만든 행을 마지막에 지운다. 프로브 데이터가 운영자 대기 목록에 남으면
 *   실제 신청과 섞인다.
 */
import { createVerifyToken, readVerifyToken } from '@/lib/audit/token'
import {
  countRecentByIpHash, createAuditRequest, createVerifiedAudit, getAudit,
  hashIp, listPendingAudits, markFailed, markRunning, markSent, markVerified,
} from '@/lib/audit/repository'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

const EMAIL = `probe+${Date.now()}@cited-probe.invalid`
const ipHash = hashIp('203.0.113.7')
let ok = true
const check = (label: string, pass: boolean) => {
  console.log(`${pass ? '  OK  ' : '  FAIL'} ${label}`)
  if (!pass) ok = false
}

// 1. 폼 경로
const a = await createAuditRequest({
  brandName: '프로브브랜드', category: '패션', email: EMAIL,
  competitors: ['29CM'], selfDomains: ['probe.example.com'], ipHash,
})
check(`신청 생성 · id=${a.id.slice(0, 12)}…`, a.status === 'requested' && !a.emailVerified)
check('source 기본값이 web', a.source === 'web')
check('jsonb 왕복', a.competitors[0] === '29CM' && a.selfDomains[0] === 'probe.example.com')

// 2. 토큰 왕복
const token = createVerifyToken(a.id, a.email)
check('토큰 왕복', readVerifyToken(token)?.auditId === a.id)

// 3. 인증 — 다른 이메일로는 실패해야 한다
check('다른 이메일로 인증 거부', (await markVerified(a.id, 'wrong@x.com')) === null)
const v = await markVerified(a.id, EMAIL)
check('인증 성공', v?.status === 'verified' && v.emailVerified === true && v.verifiedAt !== null)
check('재인증은 무해 (이미 verified라 대상 없음)', (await markVerified(a.id, EMAIL)) === null)

// 4. 대기 목록
check('대기 목록에 뜬다', (await listPendingAudits()).some((x) => x.id === a.id))

// 5. 실행 → 실패 → 재실행 → 발송
await markRunning(a.id)
await markFailed(a.id, '프로브 실패 사유')
check('실패 기록', (await getAudit(a.id))?.failureReason === '프로브 실패 사유')
check('실패도 대기 목록에 남는다', (await listPendingAudits()).some((x) => x.id === a.id))
await markRunning(a.id)
check('재실행 시 실패 사유가 지워진다', (await getAudit(a.id))?.failureReason === null)
await markSent(a.id, { version: 1, brandName: '프로브브랜드' }, ['PROBE'])
const sent = await getAudit(a.id)
check('발송 기록', sent?.status === 'sent' && sent.sentAt !== null)
check('result jsonb 왕복', (sent?.result as { brandName?: string })?.brandName === '프로브브랜드')
check('aliases 저장', sent?.aliases[0] === 'PROBE')
check('발송된 건은 대기 목록에서 빠진다', !(await listPendingAudits()).some((x) => x.id === a.id))
check(
  // ★ sentAt은 납기 지표다 — 두 번째 markSent(중복 publish·run 경합)가 던져야 한다.
  '이미 발송된 건의 markSent는 거부된다 (sentAt 덮어쓰기 방지)',
  await markSent(a.id, { version: 1 }, []).then(
    () => false,
    () => true,
  ),
)

// 6. 운영자 경로
const k = await createVerifiedAudit({
  brandName: '크몽프로브', category: '화장품', email: EMAIL,
  competitors: [], selfDomains: [], source: 'kmong', ipHash,
})
check('운영자 등록은 즉시 verified', k.status === 'verified' && k.emailVerified === true)
check("source=kmong 기록", k.source === 'kmong')
let rejected = false
try {
  await createVerifiedAudit({ ...k, source: 'web' as never })
} catch { rejected = true }
check("source='web' 거부", rejected)

// 7. IP 카운트
check('IP 해시 카운트', (await countRecentByIpHash(ipHash, 24)) >= 2)

// 정리
await db.delete(schema.freeAudits).where(eq(schema.freeAudits.email, EMAIL))
check('정리 완료', (await getAudit(a.id)) === null && (await getAudit(k.id)) === null)

console.log(ok ? '\n전부 통과' : '\n실패 있음')
process.exit(ok ? 0 : 1)
