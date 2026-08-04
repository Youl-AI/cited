'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  checkCustomQueries,
  normalizeQueryKey,
  type CustomQueryContext,
  type QueryVerdict,
} from '@/lib/audit/query-rules'
import { cn } from '@/lib/utils'
import { freezeQueriesAction, generateQueriesAction } from '../actions'

/**
 * 질의 에디터 (온보딩 2단계의 본체).
 *
 * ★ 검증은 서버와 **같은 함수**(`checkCustomQueries`)를 매 입력마다 돌린다 —
 *   순수 함수라 비용이 없고, 화면과 서버가 다른 말을 할 수 없다. import는 반드시
 *   `@/lib/audit/query-rules`여야 한다(`custom-queries`는 Anthropic SDK와
 *   server-only env를 끌고 와 클라이언트 빌드를 깬다 — query-rules.ts 상단 주석).
 *
 * ★ 생성 카운터는 **표시용**이다. 한도는 서버가 원자적 UPDATE로 강제한다
 *   (`takeGenerationCredit`). 거절 문구도 서버가 준 것을 그대로 보여준다 —
 *   여기서 번역하면 "한 번도 안 썼는데 소진됐다"는 예전 버그가 되살아난다.
 */

/** 한 번의 생성 호출로 받을 수 있는 최대 개수. `generateQueriesAction`의 서버 클램프와 같은 값 */
const MAX_PER_CALL = 10

interface QueryEditorProps {
  brandId: string
  /** `buildInitialQueries` 결과. quota 길이로 패딩되어 있다 */
  initial: string[]
  /** 이 브랜드가 쓸 수 있는 질의의 **상한**. 정확히 이만큼이 아니다 */
  quota: number
  /** 업종 공통 질의. 전부 포함되어야 동결이 통과한다 — 삭제·수정 불가 */
  templates: string[]
  generationsUsed: number
  generationLimit: number
  /**
   * `requiredCount`는 받지 않는다 — 제출 개수가 그때그때 달라지므로
   * 검증 직전에 채운다(서버 `freezeQueriesAction`과 같은 방식). 프롭으로 받으면
   * 화면이 서버와 다른 개수를 요구하게 된다.
   */
  ctx: Omit<CustomQueryContext, 'requiredCount'>
}

/**
 * 뒤쪽 빈 칸을 걷어낸다.
 *
 * ★ `buildInitialQueries`는 quota 길이로 패딩한다. 그대로 그리면 Business 첫
 *   브랜드에서 **빈 입력이 27줄** 늘어선다 — 브랜드 폼이 경쟁사 칸을 한도만큼
 *   미리 깔지 않기로 한 것과 같은 이유로(`brand-step-form.tsx` 주석) 필요한
 *   만큼만 그리고 [줄 추가]로 늘린다. quota는 상한이라 줄 수가 quota와 같을
 *   필요가 없다(3 ≤ n ≤ quota면 동결된다).
 */
function trimTrailingBlanks(rows: readonly string[]): string[] {
  const out = [...rows]
  while (out.length > 0 && (out.at(-1) ?? '').trim().length === 0) out.pop()
  return out
}

export function QueryEditor({
  brandId,
  initial,
  quota,
  templates,
  generationsUsed,
  generationLimit,
  ctx,
}: QueryEditorProps) {
  const router = useRouter()
  const [queries, setQueries] = useState<string[]>(() =>
    trimTrailingBlanks(initial).slice(0, quota),
  )
  const [used, setUsed] = useState(generationsUsed)
  const [busyRow, setBusyRow] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const templateKeys = useMemo(
    () => new Set(templates.map((t) => normalizeQueryKey(t))),
    [templates],
  )
  /**
   * 같은 글자의 질의 중 **첫 줄**의 자리. 잠금이 값 기준이라 필요하다.
   *
   * ★ 값으로만 잠그면 템플릿과 글자가 같은 줄이 **둘** 생겼을 때 둘 다 잠긴다.
   *   그런데 그 둘은 동시에 중복이라 `checkCustomQueries`가 `중복 질의`로 막는다 —
   *   읽기 전용이라 고칠 수 없고 [삭제]도 없어 확정이 영구히 막히는 막다른 골목이
   *   된다(빠져나갈 길은 새로고침뿐이고, 그러면 편집이 통째로 날아간다).
   *   둘째 줄이 생기는 경로는 특이하지 않다: 고객이 직접 같은 문장을 치거나,
   *   AI 생성이 템플릿과 겹치는 후보를 돌려준다(생성기는 템플릿을 모르고,
   *   템플릿은 그 업종에서 가장 전형적인 질문이다).
   *   그래서 **각 템플릿마다 첫 줄 하나만** 잠근다. 자리로 판정하지 않는다는
   *   원래 이유(재배치·재생성에도 어긋나지 않는다)는 그대로 유지된다 —
   *   여기서 쓰는 자리는 "같은 값 중 몇 번째인가"이지 고정된 슬롯이 아니다.
   */
  const firstRowOfKey = useMemo(() => {
    const first = new Map<string, number>()
    queries.forEach((q, i) => {
      const key = normalizeQueryKey(q)
      if (q.trim().length > 0 && !first.has(key)) first.set(key, i)
    })
    return first
  }, [queries])
  /** 지금 이 줄이 업종 공통 질의인가 — 값으로 판정하되 같은 값의 첫 줄만 잠근다 */
  const isTemplateRow = (value: string, index: number): boolean => {
    if (value.trim().length === 0) return false
    const key = normalizeQueryKey(value)
    return templateKeys.has(key) && firstRowOfKey.get(key) === index
  }

  const cleaned = useMemo(
    () => queries.map((q) => q.trim()).filter((q) => q.length > 0),
    [queries],
  )
  const minCount = templates.length

  // ★ 서버(`freezeQueriesAction`)와 같은 순서로 판정한다: 빈 칸 제거 → 범위 →
  //   나머지 규칙. 범위만 여기서 따로 보는 이유는 `checkCustomQueries`가 상한을
  //   모르기 때문이다(그 함수는 "정확히 requiredCount개"만 안다).
  const verdict: QueryVerdict = useMemo(() => {
    if (cleaned.length < minCount) {
      return {
        ok: false,
        reason: `질의는 ${minCount}개 이상이어야 합니다 (지금 ${cleaned.length}개).`,
      }
    }
    // ★ **도달 불가능한 서버 미러다.** 줄 수는 세 곳에서 이미 quota로 막힌다
    //   (초기 `slice(0, quota)` · `addRow` · 생성 결과 `slice(0, quota)`)이고
    //   `cleaned.length ≤ queries.length`이므로 이 분기는 참이 될 수 없다.
    //   "살아 있는 방어"라고 적지 않는 이유는 N-1과 같다 — 못 터지는 방어에
    //   방어라고 써 두면 다음 사람이 그 보장을 믿고 위쪽 상한을 푼다.
    //   그럼에도 남겨 두는 것은 판정 순서를 서버(`freezeQueriesAction`)와 눈으로
    //   맞춰 읽기 위해서다. 상한 로직을 고칠 때 여기가 실제 방어가 된다.
    if (cleaned.length > quota) {
      return {
        ok: false,
        reason: `이 브랜드에 쓸 수 있는 질의는 ${quota}개까지입니다 (지금 ${cleaned.length}개).`,
      }
    }
    return checkCustomQueries(cleaned, { ...ctx, requiredCount: cleaned.length })
  }, [cleaned, ctx, minCount, quota])

  const missingTemplates = useMemo(
    () => templates.filter((t) => !cleaned.some((q) => normalizeQueryKey(q) === normalizeQueryKey(t))),
    [cleaned, templates],
  )
  const blankIndexes = queries
    .map((q, i) => (q.trim().length === 0 ? i : -1))
    .filter((i) => i >= 0)
  const roomLeft = quota - queries.length
  const creditsLeft = Math.max(0, generationLimit - used)
  const busy = pending || busyRow !== null

  function setQuery(index: number, value: string) {
    setConfirming(false)
    setActionError(null)
    setQueries((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  function removeRow(index: number) {
    setConfirming(false)
    setActionError(null)
    setQueries((prev) => prev.filter((_, i) => i !== index))
  }

  function addRow() {
    setConfirming(false)
    setQueries((prev) => (prev.length < quota ? [...prev, ''] : prev))
  }

  /**
   * 빠진 업종 공통 질의를 되돌린다.
   *
   * ★ 크몽 전환 계정은 동결 질의를 그대로 프리필받는데(연속성), 브랜드 단계에서
   *   업종이나 지역을 바꿨다면 그 질의들에는 **지금 업종의 템플릿이 없다.**
   *   그러면 [확정]에서만 "템플릿이 빠져 있습니다"로 막히고 고칠 방법이 화면에
   *   없다 — 되돌릴 버튼을 그 자리에 둔다. 빈 칸부터 채우고, 모자라면 줄을
   *   늘린다. 그래도 자리가 없으면(상한) 버튼을 막고 줄을 지우라고 말한다.
   *   사용자가 쓴 줄을 말없이 덮어쓰지 않는다.
   */
  function restoreTemplates() {
    setConfirming(false)
    setActionError(null)
    setQueries((prev) => {
      const next = [...prev]
      const queue = [...missingTemplates]
      for (let i = 0; i < next.length && queue.length > 0; i++) {
        if ((next[i] ?? '').trim().length === 0) next[i] = queue.shift() as string
      }
      while (queue.length > 0 && next.length < quota) next.push(queue.shift() as string)
      return next
    })
  }

  /** 생성 호출 1회 = 크레딧 1개. 결과를 어디에 넣을지는 호출부가 정한다. */
  function generate(count: number, apply: (generated: string[]) => void, row: number | null) {
    if (count <= 0) return
    setActionError(null)
    setConfirming(false)
    setBusyRow(row ?? -1)
    startTransition(async () => {
      // ★ 지금 화면에 있는 질의를 같이 보낸다 — 겹치는 후보로 크레딧을 태우지
      //   않기 위해서다. 걸러 내는 것이 아니라 **애초에 다르게 만들라**고
      //   말하는 것이다: 받아 놓고 화면에서 지우면 슬롯이 조용히 비고, 그때는
      //   이미 5회 중 1회가 나간 뒤다 (custom-queries.ts `existing` 주석).
      const result = await generateQueriesAction({ brandId, count, existing: cleaned })
      setBusyRow(null)
      if (!result.ok) {
        // 서버 문구를 그대로 보여준다 — 원인 구분은 서버가 이미 했다.
        setActionError(result.reason)
        return
      }
      setUsed(result.value.used)
      apply(result.value.queries)
    })
  }

  function regenerateRow(index: number) {
    generate(
      1,
      (generated) => {
        const candidate = generated[0]
        if (candidate === undefined) return
        setQueries((prev) => prev.map((q, i) => (i === index ? candidate : q)))
      },
      index,
    )
  }

  /** 빈 칸이 있으면 채우고, 없으면 남은 상한만큼 줄을 늘려 채운다. */
  function generateMore() {
    if (blankIndexes.length > 0) {
      const slots = blankIndexes.slice(0, MAX_PER_CALL)
      generate(
        slots.length,
        (generated) => {
          setQueries((prev) => {
            const next = [...prev]
            slots.forEach((slot, i) => {
              const candidate = generated[i]
              if (candidate !== undefined) next[slot] = candidate
            })
            return next
          })
        },
        null,
      )
      return
    }
    const count = Math.min(roomLeft, MAX_PER_CALL)
    generate(
      count,
      (generated) => {
        setQueries((prev) => [...prev, ...generated].slice(0, quota))
      },
      null,
    )
  }

  function freeze() {
    if (!verdict.ok) return
    setActionError(null)
    startTransition(async () => {
      const result = await freezeQueriesAction({ brandId, queries: cleaned })
      if (result.ok) {
        router.push('/onboarding/done')
        return
      }
      setActionError(result.reason)
      setConfirming(false)
    })
  }

  /**
   * 지금 이 줄에 AI 결과가 도착하는 중인가 — **파생값이다. 새 상태가 아니다.**
   *
   * ★ 두 갈래를 그대로 되짚는다: `regenerateRow`는 `busyRow`에 그 줄 번호를
   *   넣고, `generateMore`는 `busyRow = -1`로 두고 **빈 칸 앞에서부터
   *   MAX_PER_CALL개**를 채운다(`blankIndexes.slice(0, MAX_PER_CALL)`).
   * ★ 요청이 도는 동안 `queries`는 바뀌지 않는다(모든 입력이 `disabled={busy}`).
   *   그래서 `blankIndexes`도 그대로이고, 클릭 시점의 대상 슬롯을 상태로
   *   따로 들고 있을 필요가 없다 — 들고 있으면 두 곳이 갈라질 수 있다.
   * ★ 빈 칸이 없어 **줄을 늘려** 채우는 경우에는 해당하는 줄이 아직 없다.
   *   그때는 어느 줄도 표시되지 않는 것이 맞다(없는 줄에 도착 표시를 할 수 없다).
   */
  const rowIsFilling = (index: number): boolean => {
    if (busyRow === index) return true
    if (busyRow !== -1) return false
    const slot = blankIndexes.indexOf(index)
    return slot >= 0 && slot < MAX_PER_CALL
  }

  const generateLabel =
    blankIndexes.length > 0
      ? `AI 후보 생성 — 빈 칸 ${Math.min(blankIndexes.length, MAX_PER_CALL)}개 채우기`
      : `AI 후보 ${Math.min(roomLeft, MAX_PER_CALL)}개 만들기`

  return (
    <div className="space-y-5">
      {/* 계측 띠 — 이 화면에서 소진되는 두 자원(질의 자리·생성 크레딧)을 한 줄에
          모아 둔다. 트레이 배경과 헤어라인은 카드 어휘와 같은 가족이다(회색
          안료 --border가 아니라 --foreground 알파라 표면을 따라 뒤집힌다).
          계측값은 mono — sans는 말, mono는 계측값. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-foreground/[0.07] bg-muted/50 px-4 py-2.5">
        <p className="text-sm text-muted-foreground">
          질의{' '}
          <span className="font-mono tabular-nums text-foreground">
            {cleaned.length}/{quota}
          </span>{' '}
          <span className="text-xs">(최대 {quota}개, 최소 {minCount}개)</span>
        </p>
        <p className="text-sm text-muted-foreground">
          AI 생성{' '}
          <span className="font-mono tabular-nums text-foreground">
            {used}/{generationLimit}회
          </span>
        </p>
      </div>

      <ul className="space-y-2">
        {queries.map((value, i) => {
          const locked = isTemplateRow(value, i)
          const filling = rowIsFilling(i)
          return (
            <li key={i} className="flex items-start gap-2" aria-busy={filling || undefined}>
              <span className="mt-2 w-7 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                q{i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                {/* ★ 생성 중에는 입력도 잠근다. 결과가 빈 칸에 들어가므로(`generateMore`),
                    기다리는 동안 그 칸에 친 글자는 결과가 도착하는 순간 말없이 덮인다 —
                    버튼만 막고 입력을 열어 두면 "쓰던 문장이 사라졌다"가 된다. */}
                <div className="relative">
                  <Input
                    className="h-9"
                    value={value}
                    readOnly={locked}
                    disabled={busy}
                    aria-label={`질의 ${i + 1}`}
                    aria-readonly={locked || undefined}
                    onChange={(e) => setQuery(i, e.target.value)}
                    placeholder="소비자가 AI에게 묻는 말투로"
                  />
                  {/* ★ 생성 중 표시는 **결과가 들어올 그 칸 위**에 있다. 화면
                      어딘가의 스피너가 아니라 "여기에 문장 한 줄이 도착한다"를
                      칸의 모양 그대로 말한다(redesign-skill Interactivity:
                      "skeleton loaders that match the layout shape").
                      셔머가 무한 루프인 것은 생성이 실제 비동기이고 언제 끝날지
                      모르기 때문이다 — 멈추면 고장난 화면으로 읽힌다
                      (globals.css `.skeleton` 주석). reduced-motion에서는
                      전역 킬 스위치가 빛을 즉시 오른쪽 끝으로 보내 무채색 판만
                      남긴다.
                      ★ 재생성 줄에서는 **옛 문장을 덮는다.** 그게 사실이다 —
                        그 문장은 곧 사라진다. 덮지 않으면 도착하는 순간 글자가
                        말없이 갈린다.
                      ★ 상태 낭독은 이 판이 아니라 줄의 `aria-busy`가 한다
                        (`Skeleton` 주석의 분업). 시각 요소는 aria-hidden이다. */}
                  {filling && (
                    <span
                      aria-hidden="true"
                      className="skeleton pointer-events-none absolute inset-0 rounded-lg"
                    />
                  )}
                </div>
                {locked && (
                  <p className="font-mono text-[0.7rem] tracking-[0.08em] text-muted-foreground uppercase">
                    업종 공통 · 고정
                  </p>
                )}
              </div>
              {locked ? (
                // ★ 템플릿 줄에는 [재생성]·[삭제]를 아예 그리지 않는다. 지울 수 있게
                //   두면 실패가 [확정]에서야 드러나고, 그때는 무엇을 지웠는지 기억에
                //   없다 (`validateCustomQueries`의 템플릿 포함 검사).
                <span className="mt-2 w-[7.5rem] shrink-0" aria-hidden="true" />
              ) : (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-0.5"
                    disabled={busy || creditsLeft === 0}
                    onClick={() => regenerateRow(i)}
                    aria-label={`질의 ${i + 1} 재생성`}
                  >
                    {busyRow === i ? '…' : '재생성'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-0.5"
                    disabled={busy}
                    onClick={() => removeRow(i)}
                    aria-label={`질의 ${i + 1} 삭제`}
                  >
                    삭제
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || creditsLeft === 0 || (blankIndexes.length === 0 && roomLeft <= 0)}
          onClick={generateMore}
        >
          {busyRow === -1 ? '생성 중…' : generateLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || roomLeft <= 0}
          onClick={addRow}
        >
          줄 추가
        </Button>
        {creditsLeft === 0 && (
          <p className="text-xs text-muted-foreground">
            AI 생성 한도를 다 썼습니다. 남은 질의는 직접 써 주세요.
          </p>
        )}
      </div>

      {missingTemplates.length > 0 && (
        <div className="instrument-enter space-y-2 rounded-xl border border-incomplete/40 bg-incomplete/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-incomplete-fg">
            업종 공통 질의 {missingTemplates.length}개가 빠져 있습니다. 무료 진단과 같은 질문이라
            반드시 포함해야 합니다.
          </p>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {missingTemplates.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
          {blankIndexes.length + roomLeft >= missingTemplates.length ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={restoreTemplates}>
              업종 공통 질의 되돌리기
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              자리가 부족합니다 — 질의를 {missingTemplates.length - blankIndexes.length - roomLeft}개
              삭제한 뒤 되돌려 주세요.
            </p>
          )}
        </div>
      )}

      {/* 실시간 검증 — 서버와 같은 함수의 이유를 그 자리에서 보여준다.
          ★ 이 판은 **글자마다 다시 마운트되지 않는다.** 통과/실패가 오갈 때
            사라졌다 나타나면 한 글자 칠 때마다 화면이 깜박인다. 그래서 등장
            모션이 아니라 **색 전이**로 상태를 바꾼다 — 테두리·배경·글자색이
            --motion-state(240ms) 동안 건너간다. 지속시간이 --motion-micro가
            아닌 이유: 이건 손끝 반응(누름)이 아니라 판정이 뒤집힌 사건이다.
          ★ 앞의 점은 색만으로 상태를 말하지 않기 위한 것이 아니다(문장이 이미
            말한다). 훑는 눈이 문단 전체를 읽기 전에 통과/실패를 잡게 하는
            앵커이고, 그래서 `aria-hidden`에 글자가 없다 — 라이브 리전이
            읽어야 할 것은 문장뿐이다. */}
      <p
        role="status"
        className={cn(
          'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm leading-relaxed',
          'transition-[color,background-color,border-color] duration-[var(--motion-state)] ease-instrument',
          verdict.ok
            ? 'border-metric-up/30 bg-metric-up/5 text-metric-up-fg'
            : 'border-incomplete/40 bg-incomplete/5 text-incomplete-fg',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-[0.5em] size-1.5 shrink-0 rounded-full',
            'transition-colors duration-[var(--motion-state)] ease-instrument',
            verdict.ok ? 'bg-metric-up' : 'bg-incomplete',
          )}
        />
        <span>
          {verdict.ok
            ? `질의 ${cleaned.length}개가 규칙을 통과했습니다 — 확정할 수 있습니다.`
            : verdict.reason}
        </span>
      </p>

      {actionError && (
        <p
          role="alert"
          className="instrument-enter rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive"
        >
          {actionError}
        </p>
      )}

      {confirming ? (
        /* ── 동결 확인 ────────────────────────────────────────────
           ★ 이 화면에서 **되돌릴 수 없는 유일한 동작**이다. 그래서 여기만
             다른 무게로 온다. 무게를 만드는 것은 셋이고, 전부 표면 언어다
             (문구는 한 글자도 더하지 않는다 — 경고를 글자로 더 쓰면 화면이
             겁을 주는 것이지 무게가 생기는 것이 아니다):
             1. **elevation 2단.** 앱의 기본은 1단이고(card.tsx: "뜨는 것은
                상호작용하는 것뿐이다") 2단은 호버·툴팁 급이다. 확인 패널이
                뜨는 순간 이 페이지에서 가장 앞에 있는 판이 된다.
             2. **헤어라인이 브랜드색으로 바뀐다.** design-language §3에서
                --primary의 자리는 "UI 크롬과 강조"다. 회색 헤어라인 하나만
                바뀌어도 그 판이 다른 종류라는 것이 읽힌다.
             3. **등장.** 조건부 마운트라 `.instrument-enter`가 매번 재생된다 —
                [확정하기]를 누른 것이 화면에서 일어난 사건으로 보인다.
           ★ 손으로 적던 `rounded-lg border border-border bg-card`는 걷어냈다.
             그 조합이 redesign-skill이 지목하는 제네릭 카드 룩이고, 이 저장소는
             이미 `Card`(트레이+유리판)로 통일했다. */
        <Card className="instrument-enter shadow-elevation-2 ring-primary/25 [--card-spacing:--spacing(5)]">
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">
              확정하면 질의 <span className="font-mono tabular-nums">{cleaned.length}</span>개가{' '}
              <strong className="font-semibold">동결</strong>됩니다. 회차끼리 비교할 수 있으려면
              질의가 같아야 하므로, 동결 후에는 바꾸지 않습니다 — 수정이 꼭 필요하면 운영자에게
              문의해 주세요.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" disabled={busy || !verdict.ok} onClick={freeze}>
                {pending ? '동결 중…' : '확정하고 동결'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                더 고치기
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          type="button"
          size="lg"
          disabled={busy || !verdict.ok}
          onClick={() => setConfirming(true)}
        >
          확정하기
        </Button>
      )}
    </div>
  )
}
