import { AUDIT_FLOW } from '@/components/audit/flow'
import { Reveal } from '@/components/motion/reveal'

/**
 * "신청하면" 3단계 — 계측 레일.
 *
 * ## 왜 스택이 아니라 레일인가
 *
 * 처음에는 스티키 스택(카드가 핀된 채 다음 카드가 덮는 연출)이었다. 카드가
 * 불투명 전면이 아니라 투명 컨테이너 속 유리 패널이라, 전환 구간에서 다음
 * 패널이 이전 패널을 자르며 겹쳐 보였다 — 물러남을 강화해도 "겹치며 밀리는"
 * 인상이 남아 폐기했다. 이 페이지의 스크롤 연출은 아래 "실측 재현"(PinScene)
 * 하나로 충분하다 — 큰 모션은 한 곳에만 쓴다(frontend-design: 대담함은 한
 * 곳에 몰아라). 이 섹션은 조용하고 정확하게, 순서만 말한다.
 *
 * ## 레일이 말하는 것
 *
 * 노드(01→02→03)를 잇는 헤어라인이 "순서대로 진행된다"를 조판으로 말한다 —
 * 이 사이트의 계측 정체성(mono 숫자·헤어라인)과 같은 어휘다. 마지막 노드만
 * 프라이머리 틴트를 받는다: 앞 두 단계는 사용자의 일이고, 셋째가 우리가
 * 돌려주는 것(리포트)이다. 장식이 아니라 도착점 표시다.
 *
 * 나타나는 순서는 `Reveal` 스태거가 만든다(같은 그룹 0·1·2). 핀·스크럽이
 * 없으므로 GSAP을 켜지 않는다 — Motion 트리 하나로 끝난다(혼용 금지).
 *
 * ## 번호는 장식이 아니다
 *
 * 01/02/03은 실제 순서다(신청·메일 확인·리포트 수신이라는 실제 행위).
 * 눈에 보이는 숫자만으로는 스크린리더에 순서가 없으므로 `<ol>`/`<li>`로
 * 조판한다 — "목록, 항목 3개 중 1"이 읽힌다.
 *
 * 문구는 `components/audit/flow.tsx` 한 벌에서 온다 — 폼 안의 압축판과
 * 갈리면 "영업일 1일"이 한쪽에서만 사라진다.
 */
export function FlowSteps() {
  return (
    <ol className="grid sm:grid-cols-3">
      {AUDIT_FLOW.map((step, index) => {
        const last = index === AUDIT_FLOW.length - 1
        return (
          <li key={step.label}>
            {/* Reveal(div)은 li 안쪽에 둔다 — li 바깥을 감싸면 `ol > div > li`가
                되어 목록 시맨틱이 깨진다(스택 시절 pin-spacer가 낸 사고와 같은 꼴). */}
            <Reveal
              index={index}
              className="grid h-full grid-cols-[2rem_1fr] gap-x-4 sm:flex sm:flex-col"
            >
              {/* 노드 + 레일. 모바일은 세로(타임라인), sm부터 가로(3열 레일).
                  레일은 장식이 아니라 "다음으로 이어진다"라서 마지막 노드 뒤에는
                  없다 — 레일이 끝나는 곳이 도착점이다. */}
              <div className="flex flex-col items-center sm:flex-row sm:gap-4">
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums ${
                    last
                      ? 'border-primary/60 text-primary'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                {!last && (
                  <span aria-hidden className="w-px flex-1 bg-border sm:h-px sm:w-auto" />
                )}
              </div>
              <div className={last ? 'sm:mt-6' : 'pb-10 sm:mt-6 sm:pb-0 sm:pr-10'}>
                <h3 className="text-lg font-semibold tracking-tight">{step.label}</h3>
                <p className="mt-2 max-w-[30em] text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {step.body}
                </p>
              </div>
            </Reveal>
          </li>
        )
      })}
    </ol>
  )
}
