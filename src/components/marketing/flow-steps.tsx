'use client'

import { useCallback, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import { AUDIT_FLOW } from '@/components/audit/flow'
import { PinScene } from '@/components/motion/pin-scene'

/**
 * "신청하면" 3단계 — 자막 핀 스크럽.
 *
 * ## 이력: 스택 → 레일 → 자막
 *
 * 1. **스티키 스택**(카드 겹침) — 투명 패널이 서로를 자르며 겹쳐 보여 폐기.
 * 2. **계측 레일**(3열 동시 + 스태거) — 조용하지만, 세 단계가 결국 나란히
 *    한 화면에 서 있어 "순서"가 배치로만 남았다.
 * 3. **자막**(이 구현, 2026-08-05 사용자·팀원 확정) — 한 번에 **한 단계만**
 *    보인다. 1이 나타나고, 사라지고, 2가 나타나고… 스크롤 진행률이 자막을
 *    넘긴다. 순서 자체가 메시지인 섹션이라, 순서를 시간축으로 강제하는 것이
 *    배치보다 정확하다.
 *
 * 동기 한 문장(Motion Motivated): **순서** — 신청·메일 확인·리포트 수신은
 * 동시에 일어나는 옵션이 아니라 하나씩 통과하는 관문이다.
 *
 * ## 재현 장면과 같은 골격, 같은 규칙
 *
 * `PinScene` 재사용 — 스크럽 로직·핀 사고 대응(래퍼 두 겹)·reduced-motion
 * 처리를 다시 만들지 않는다. "큰 스크롤 연출은 한 곳" 원칙은 이 페이지에서
 * 두 곳(자막·재현)으로 늘어난다 — 2026-08-05 사용자 명시 결정이고, 둘 다
 * **같은 물리**(핀 + 진행률 스크럽)라 페이지에 법칙이 둘 생기는 것은 아니다.
 *
 * 진행률 소비 규칙도 재현 장면과 같다: `useState` 금지(티커 빈도로 리렌더),
 * ref로 잡은 DOM에 opacity·translate만 직접 쓴다(GPU 합성).
 *
 * ## 초기 상태: 1번만 보인다 (재현 장면과 반대 트레이드오프)
 *
 * 자막 스택은 세 li가 같은 그리드 칸에 겹친다. 재현 장면처럼 "전부 보이는
 * 상태"를 기본값으로 두면 JS가 죽은 브라우저에서 세 문단이 **글자째 겹쳐**
 * 못 읽는다. 그래서 여기는 1번만 보이는 초기 상태를 인라인 스타일로 박는다 —
 * JS가 죽으면 첫 단계만 보이지만 읽을 수는 있고, 스크린리더는 세 항목을
 * 전부 읽는다(opacity는 접근성 트리에서 숨기지 않는다). 인쇄도 같은 상태다.
 *
 * ## reduced-motion: 정적 3열
 *
 * 핀·스크럽 없이 세 단계가 나란히 선다(2번 레일 조판). `PinScene`의
 * `onProgress(1)` 폴백을 쓰면 3번만 남아 1·2가 사라지므로, 장면 자체를
 * 갈아끼운다.
 *
 * ## 번호는 장식이 아니다
 *
 * 01/02/03은 실제 순서다. `<ol>`/`<li>`로 조판해 스크린리더가 "목록, 항목
 * 3개 중 1"을 읽는다. 노드 레일은 눈에게 주는 진행 표시라 aria-hidden이다.
 * 문구는 `components/audit/flow.tsx` 한 벌에서 온다.
 */

/** 전체 진행률 → 구간 [from, to)의 지역 진행률 0..1 (재현 장면과 같은 훅) */
function span(p: number, from: number, to: number): number {
  if (p <= from) return 0
  if (p >= to) return 1
  return (p - from) / (to - from)
}

/** 자막 하나가 창 안에서 쓰는 비율: 앞 35%는 들어오고, 뒤 25%는 나간다. */
const FADE_IN_END = 0.35
const FADE_OUT_START = 0.75

/** 장면이 먹는 스크롤 거리(px). 단계당 ~333px — 재현 장면(1500)보다 짧다.
 *  1350 → 1000 (2026-08-18 UI 점검): 자막 하나에 450px는 무대(레일 + 자막
 *  한 덩이)의 정보량 대비 길어서, 핀 중반부터 "스크롤이 안 나간다"는 감각만
 *  남았다. 전환 창(FADE_IN_END/FADE_OUT_START)은 비율이라 그대로 탄다. */
const FLOW_SCENE_LENGTH = 1000

export function FlowSteps() {
  const reduce = useReducedMotion()
  const items = useRef<(HTMLLIElement | null)[]>([])
  const nodes = useRef<(HTMLSpanElement | null)[]>([])
  const fills = useRef<(HTMLSpanElement | null)[]>([])

  const apply = useCallback((p: number) => {
    const count = AUDIT_FLOW.length
    AUDIT_FLOW.forEach((_, index) => {
      const from = index / count
      const to = (index + 1) / count
      const t = span(p, from, to)
      const last = index === count - 1

      const item = items.current[index]
      if (item) {
        const enter = Math.min(t / FADE_IN_END, 1)
        // 마지막 자막은 나가지 않는다 — 핀이 풀릴 때 "리포트 수신"이 남아
        // 다음 섹션으로 이어진다. 빈 무대로 끝나면 장면이 실패한 것처럼 읽힌다.
        const exit = last ? 0 : span(t, FADE_OUT_START, 1)
        item.style.opacity = String(enter * (1 - exit))
        // 들어올 때는 아래에서 16px, 나갈 때는 위로 12px — 자막이 "넘어가는"
        // 방향을 눈이 따라간다. translate 프로퍼티(재현 장면과 같은 이유:
        // Tailwind v4 translate 유틸과 합성 충돌 방지).
        item.style.translate = `0 ${(1 - enter) * 16 - exit * 12}px`
      }

      // ── 레일 — 선이 자막과 같은 속도로 뻗는다 (2026-08-05 사용자 요청).
      // 연결선 index(노드 index → index+1)는 단계 index의 창을 그대로 탄다:
      // 자막 1이 도는 동안 01→02 선이 자라고, 선이 도착해야(창의 마지막 12%)
      // 다음 노드가 나타난다. "선이 뻗어나가면서 2가 생기고"를 그대로 옮긴 것.
      // scaleX(GPU 합성)이고, 트랙은 반투명 가이드로 깔려 있어 어디까지 갈지는
      // 미리 보인다.
      const fill = fills.current[index]
      if (fill && !last) fill.style.transform = `scaleX(${t})`

      const node = nodes.current[index]
      if (node) {
        // 노드 0은 장면 시작부터 서 있다. 나머지는 앞 연결선이 도착할 때
        // 나타나서(앞 창의 88%~100% 구간), 지나간 뒤에도 밝게 남는다.
        const prev = span(p, (index - 1) / count, index / count)
        const appeared = index === 0 ? 1 : span(prev, 0.88, 1)
        node.style.opacity = String(appeared)
      }
    })
  }, [])

  // ── reduced-motion: 정적 3열 레일 ─────────────────────────
  if (reduce) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">신청하면</h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-3">
          {AUDIT_FLOW.map((step, index) => (
            <li key={step.label} className="grid grid-cols-[2rem_1fr] gap-x-4 sm:block">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-none border border-border font-mono text-xs tabular-nums text-muted-foreground"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="sm:mt-5">
                <h3 className="text-lg font-semibold tracking-tight">{step.label}</h3>
                <p className="mt-2 max-w-[30em] text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <PinScene length={FLOW_SCENE_LENGTH} onProgress={apply}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center px-6 py-16 sm:py-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">신청하면</h2>

        {/* 노드 레일 — 진행 표시. 시맨틱 순서는 아래 ol이 말하므로 장식이다.
            초기 상태(인라인): 01만 서 있고 선은 0으로 접혀 있다 — 자막 스택의
            "1번만 보인다"와 같은 상태에서 출발해야 레일과 자막이 한 장면으로
            읽힌다. JS가 죽으면 01 + 가이드 트랙만 남는다(자막도 1번만 남는
            것과 같은 트레이드오프). */}
        <div aria-hidden className="mt-12 flex items-center gap-4">
          {AUDIT_FLOW.map((step, index) => (
            <span key={step.label} className="contents">
              <span
                ref={(el) => {
                  nodes.current[index] = el
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-none border border-border font-mono text-xs tabular-nums text-foreground"
                style={{ opacity: index === 0 ? 1 : 0 }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              {index < AUDIT_FLOW.length - 1 && (
                <span className="relative h-px flex-1 overflow-hidden bg-border/40">
                  <span
                    ref={(el) => {
                      fills.current[index] = el
                    }}
                    className="absolute inset-0 origin-left bg-foreground/70"
                    style={{ transform: 'scaleX(0)' }}
                  />
                </span>
              )}
            </span>
          ))}
        </div>

        {/* 자막 스택 — 세 li가 같은 그리드 칸에 겹치고 진행률이 하나씩 보여준다.
            컨테이너 높이는 그리드가 가장 긴 자막에 맞춰 잡는다(절대배치였다면
            높이가 0이 되어 아래 섹션이 파고든다). */}
        <ol className="mt-12 grid">
          {AUDIT_FLOW.map((step, index) => (
            <li
              key={step.label}
              ref={(el) => {
                items.current[index] = el
              }}
              className="col-start-1 row-start-1"
              // 초기 상태: 1번만 보인다 — 이유는 머리말 "초기 상태" 참고.
              style={{ opacity: index === 0 ? 1 : 0 }}
            >
              <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground tabular-nums">
                {String(index + 1).padStart(2, '0')} / {String(AUDIT_FLOW.length).padStart(2, '0')}
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {step.label}
              </h3>
              <p className="mt-4 max-w-[34em] text-base leading-relaxed text-muted-foreground sm:text-lg">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </PinScene>
  )
}
