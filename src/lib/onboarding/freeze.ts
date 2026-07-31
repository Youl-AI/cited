import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * 질의 동결의 **선점(claim)과 되돌리기(release)**.
 *
 * ★ 왜 별도 모듈인가 — 이 두 UPDATE의 WHERE 절이 전후 비교 불변식을 혼자
 *   떠받친다. `freezeQueriesAction` 안에 인라인으로 두면 SQL을 못 박는
 *   회귀 테스트를 붙일 수가 없다(액션 테스트는 db를 통째로 가짜로 쓴다).
 *   `freeze.test.ts`가 여기서 나가는 SQL 문자열을 직접 검사한다.
 */

/**
 * 동결 자리를 **먼저** 잡는다. true면 이 요청이 승자다.
 *
 * ★ 순서가 핵심이다. 원래 코드는 delete → insert → 조건부 동결 UPDATE 순서라
 *   동시 제출 두 건 중 **진 쪽이 이긴 쪽의 동결 질의를 지우고 자기 것을 넣은 뒤**
 *   "이미 확정된 질의입니다"를 돌려줬다. 고객 화면에는 실패가 뜨는데 DB는 조용히
 *   바뀐 상태다. 동결 질의는 PREMIUM 전후 비교의 불변식이고, `answers.query_id`에는
 *   FK가 없어 옛 답변이 사라진 질의 id를 가리킨 채 남는다.
 *   선점을 앞에 두면 진 쪽은 질의를 **한 줄도 건드리지 않고** 끝난다.
 *
 * ★ `WHERE queries_frozen_at IS NULL`이 검사와 쓰기를 한 문장으로 묶는다 —
 *   SELECT 후 UPDATE로 나누면 경합이 그대로 뚫린다.
 */
export async function claimQueryFreeze(args: {
  brandId: string
  userId: string
  frozenAt: Date
  queryQuota: number
}): Promise<boolean> {
  const rows = await db
    .update(schema.brands)
    .set({
      queriesFrozenAt: args.frozenAt,
      // 이 브랜드가 계정 한도에서 실제로 가져간 몫. 다음 브랜드의 `loadEditorQuota`가
      // 빼고 계산한다(schema.ts `query_quota` 주석 — Business가 나눠 쓰는 근거 값).
      queryQuota: args.queryQuota,
      updatedAt: args.frozenAt,
    })
    .where(
      and(
        eq(schema.brands.id, args.brandId),
        eq(schema.brands.userId, args.userId),
        isNull(schema.brands.queriesFrozenAt),
      ),
    )
    .returning({ id: schema.brands.id })
  return rows.length > 0
}

/**
 * 선점은 성공했는데 질의 저장이 실패했을 때 되돌린다 (보상 UPDATE).
 *
 * ★ neon-http에는 트랜잭션이 없다 — 선점과 질의 저장을 원자적으로 묶을 수단이
 *   없으므로, 실패하면 손으로 되돌리는 수밖에 없다. 최악의 결과가
 *   "남의 동결 질의가 덮어써짐"에서 **"내 브랜드가 미동결로 되돌아감"**으로
 *   바뀐다. 후자는 재시도가 복구하고, cron은 미동결 브랜드를 건드리지 않는다.
 *
 * ★ `queries_frozen_at = <내가 쓴 시각>`까지 건다. 이 조건이 없으면 되돌리기가
 *   늦게 도착했을 때 그 사이에 성공한 **다른** 동결을 풀어 버린다.
 */
export async function releaseQueryFreeze(args: {
  brandId: string
  userId: string
  frozenAt: Date
}): Promise<void> {
  await db
    .update(schema.brands)
    .set({ queriesFrozenAt: null, queryQuota: 0, updatedAt: new Date() })
    .where(
      and(
        eq(schema.brands.id, args.brandId),
        eq(schema.brands.userId, args.userId),
        eq(schema.brands.queriesFrozenAt, args.frozenAt),
      ),
    )
}
