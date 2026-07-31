'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  checkCustomQueries,
  normalizeQueryKey,
  type CustomQueryContext,
  type QueryVerdict,
} from '@/lib/audit/query-rules'
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
  /** 지금 이 줄이 업종 공통 질의인가 — 값으로 판정한다(자리로 판정하면 재배치에 어긋난다) */
  const isTemplateRow = (value: string): boolean =>
    value.trim().length > 0 && templateKeys.has(normalizeQueryKey(value))

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
      const result = await generateQueriesAction({ brandId, count })
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

  const generateLabel =
    blankIndexes.length > 0
      ? `AI 후보 생성 — 빈 칸 ${Math.min(blankIndexes.length, MAX_PER_CALL)}개 채우기`
      : `AI 후보 ${Math.min(roomLeft, MAX_PER_CALL)}개 만들기`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* 계측값은 mono — sans는 말, mono는 계측값 */}
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
          const locked = isTemplateRow(value)
          return (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 w-7 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                q{i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  className="h-9"
                  value={value}
                  readOnly={locked}
                  aria-label={`질의 ${i + 1}`}
                  aria-readonly={locked || undefined}
                  onChange={(e) => setQuery(i, e.target.value)}
                  placeholder="소비자가 AI에게 묻는 말투로"
                />
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
        <div className="space-y-2 rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3">
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

      {/* 실시간 검증 — 서버와 같은 함수의 이유를 그 자리에서 보여준다 */}
      <p
        role="status"
        className={
          verdict.ok
            ? 'rounded-lg border border-metric-up/30 bg-metric-up/5 px-4 py-3 text-sm leading-relaxed text-metric-up-fg'
            : 'rounded-lg border border-incomplete/40 bg-incomplete/5 px-4 py-3 text-sm leading-relaxed text-incomplete-fg'
        }
      >
        {verdict.ok
          ? `질의 ${cleaned.length}개가 규칙을 통과했습니다 — 확정할 수 있습니다.`
          : verdict.reason}
      </p>

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive"
        >
          {actionError}
        </p>
      )}

      {confirming ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5">
          <p className="text-sm leading-relaxed">
            확정하면 질의 <span className="font-mono tabular-nums">{cleaned.length}</span>개가{' '}
            <strong className="font-semibold">동결</strong>됩니다. 회차끼리 비교할 수 있으려면
            질의가 같아야 하므로, 동결 후에는 바꾸지 않습니다 — 수정이 꼭 필요하면 운영자에게
            문의해 주세요.
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={busy || !verdict.ok} onClick={freeze}>
              {pending ? '동결 중…' : '확정하고 동결'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              더 고치기
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" disabled={busy || !verdict.ok} onClick={() => setConfirming(true)}>
          확정하기
        </Button>
      )}
    </div>
  )
}
