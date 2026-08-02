import { buildSourceChanges, type RunPoint } from '@/lib/dashboard/data'

/**
 * 출처 상위 변화 — 도메인별 인용 답변 수, 직전 회차 대비 (스펙 ⑤).
 *
 * ★ **`comparableWithPrev`가 false면 `prev → curr` 화살표를 그리지 않는다.**
 *   추이 차트가 선을 끊는 것과 같은 이유다: 질의를 셋 더 넣은 다음 회차는
 *   인용 수가 당연히 늘고, 판정기가 바뀌면 무엇을 인용으로 셌는지가 바뀐다.
 *   "2 → 5"는 브랜드가 한 일이 아니라 설정 변경이다. 추이만 끊고 이 표가
 *   화살표를 그리면 같은 거짓말이 표 모양으로 나갈 뿐이다.
 *   (도메인이 사라진 건 아니므로 "새로 등장"으로 떨어뜨려서도 안 된다 —
 *    `prevAnswers`는 그대로 두고 화살표만 뺀다.)
 *
 * ★ `owner`는 `'self' | 'competitor' | 'third-party'`이고 **null이 아니다.**
 *   그리고 `selfDomainsKnown === false`인 회차의 `'third-party'`는 "남의
 *   사이트"가 아니라 "자사 도메인을 몰라 못 갈랐다"이다 — 그 회차에는
 *   소유 배지를 달지 않고, 왜 못 갈랐는지를 쓴다. "우리 사이트 인용 없음"을
 *   단정하지 않는 것은 `SelfCitationLine`과 같은 규칙이다.
 */
export function SourceChanges({ points }: { points: RunPoint[] }) {
  const rows = buildSourceChanges(points, 8)
  if (rows.length === 0) return null
  const incomparable = rows.some((r) => !r.comparableWithPrev && r.prevAnswers !== null)
  const selfDomainsKnown = rows.every((r) => r.selfDomainsKnown)
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {rows.map((row) => (
          <li key={row.domain} className="flex items-baseline justify-between gap-4 px-5 py-3">
            <span className="flex items-baseline gap-2 font-mono text-sm">
              {row.domain}
              {row.selfDomainsKnown && row.owner === 'self' && (
                <span className="text-[0.625rem] tracking-[0.08em] text-primary uppercase">우리</span>
              )}
              {row.owner === 'competitor' && (
                <span className="text-[0.625rem] tracking-[0.08em] text-incomplete-fg uppercase">경쟁사</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
              {row.prevAnswers === null ? (
                <>새로 등장 · {row.answers}개</>
              ) : !row.comparableWithPrev || row.prevAnswers === row.answers ? (
                <>{row.answers}개</>
              ) : (
                <>{row.prevAnswers} → {row.answers}</>
              )}
            </span>
          </li>
        ))}
      </ul>
      {incomparable && (
        <p className="mt-2 text-xs text-muted-foreground">
          직전 회차와 측정 조건(엔진 구성·질의 집합·판정기 버전)이 달라 증감을 표시하지
          않습니다 — 인용 수의 차이가 브랜드의 변화인지 설정의 변화인지 가를 수 없습니다.
        </p>
      )}
      {!selfDomainsKnown && (
        <p className="mt-2 text-xs text-muted-foreground">
          자사 도메인을 알려주시면 어느 도메인이 우리 사이트인지 갈라서 보여드립니다 —
          지금은 도메인 정보가 없어 우리 사이트 인용 여부를 가리지 못합니다.
        </p>
      )}
    </>
  )
}
