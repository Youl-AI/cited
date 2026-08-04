import { Card } from '@/components/ui/card'
import { buildSourceChanges, type RunPoint } from '@/lib/dashboard/data'

/**
 * 출처 상위 변화 — 도메인별 인용 답변 수, 직전 회차 대비 (스펙 ⑤).
 *
 * ★ **`comparableWithPrev`가 false면 어떤 행도 직전 회차를 입에 올리지 않는다 —
 *   화살표도, "새로 등장"도.** 추이 차트가 선을 끊는 것과 같은 이유다: 질의를
 *   셋 더 넣은 다음 회차는 인용 수가 당연히 늘고, 판정기가 바뀌면 무엇을
 *   인용으로 셌는지가 바뀐다. "2 → 5"는 브랜드가 한 일이 아니라 설정 변경이다.
 *   그리고 "새로 등장"도 같은 부류다 — "직전 회차에는 없었다"는 직전 회차
 *   비교라서, 질의가 갈린 경계에서 상위 도메인이 물갈이되면 설정 변경이 만든
 *   물갈이가 브랜드의 성과처럼 나간다. 비교 불가 경계의 모든 행은 개수만 쓰고,
 *   왜 증감이 없는지는 캡션이 항상 말한다. 첫 회차(직전 회차 자체가 없음)도
 *   개수만 쓰되, 없는 회차와 조건이 달랐다는 캡션까지 쓰면 그게 또 거짓이라
 *   캡션은 직전 회차가 실제로 있을 때만 나온다.
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
  // `buildSourceChanges`의 prev와 같은 판정 — 직전 회차(스냅샷 있는 회차)가
  // 실제로 있는가. 캡션은 이때만 나온다: 첫 회차에 "직전 회차와 조건이 달라"를
  // 쓰면 없는 회차를 두고 말하는 것이다.
  const hasPrevRun = points.length >= 2
  const incomparable = hasPrevRun && rows.some((r) => !r.comparableWithPrev)
  const selfDomainsKnown = rows.every((r) => r.selfDomainsKnown)
  return (
    <>
      {/* 손으로 적던 카드 조합(`rounded-lg border border-border bg-card`)을
          `Card`(double-bezel)로 흡수했다 — 회차 목록·히트맵과 같은 처리다.
          세로 여백을 베젤까지 줄여 행이 내핵 가장자리에 붙게 한다. */}
      <Card className="gap-0 py-(--card-bezel)">
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--card-core-radius)]">
          {rows.map((row) => (
            <li key={row.domain} className="flex items-baseline justify-between gap-4 px-5 py-3">
              <span className="flex items-baseline gap-2 font-mono text-sm break-all">
                {row.domain}
                {row.selfDomainsKnown && row.owner === 'self' && (
                  <span className="text-[0.625rem] tracking-[0.08em] text-primary uppercase">우리</span>
                )}
                {/* ★ 경쟁사는 무채색이다 (§2: 상태색의 뜻은 하나 — incomplete는
                    "부분 완료"지 정체성이 아니다). 자기 브랜드=브랜드색, 경쟁사=무채색은
                    `answer-specimen.tsx`가 정한 구분이다. */}
                {row.owner === 'competitor' && (
                  <span className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">경쟁사</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {/* ★ 비교 불가면 "새로 등장"부터 걸러야 한다 — 그것도 직전 회차
                    비교라서, 순서를 바꾸면 물갈이 경계에서 성과처럼 나간다. */}
                {!row.comparableWithPrev ? (
                  <>{row.answers}개</>
                ) : row.prevAnswers === null ? (
                  <>새로 등장 · {row.answers}개</>
                ) : row.prevAnswers === row.answers ? (
                  <>{row.answers}개</>
                ) : (
                  <>{row.prevAnswers} → {row.answers}</>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {incomparable && (
        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          직전 회차와 측정 조건(엔진 구성·질의 집합·판정기 버전)이 달라 증감을 표시하지
          않습니다 — 인용 수의 차이가 브랜드의 변화인지 설정의 변화인지 가를 수 없습니다.
        </p>
      )}
      {!selfDomainsKnown && (
        <p className="mt-3 max-w-prose text-xs text-muted-foreground">
          자사 도메인을 알려주시면 어느 도메인이 우리 사이트인지 갈라서 보여드립니다 —
          지금은 도메인 정보가 없어 우리 사이트 인용 여부를 가리지 못합니다.
        </p>
      )}
    </>
  )
}
