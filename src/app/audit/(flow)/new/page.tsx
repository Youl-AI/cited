import Link from 'next/link'
import { RequestSheet } from '@/components/audit/request-sheet'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 무료 진단 신청 — **유일한** 신청 지점.
 *
 * ## 랜딩의 폼을 대체한다 (2026-08-04 사용자 확정)
 *
 * 원래 랜딩 히어로 바로 아래에도 같은 폼이 있었다. 히어로 CTA가 "한 화면
 * 스크롤" 버튼이 되고, 버튼과 폼이 연달아 보여 중복으로 읽혔다. 지금은
 * 랜딩의 CTA 세 개(머리글·히어로·마감)가 전부 여기로 온다. 여기가:
 * - 머리글·히어로·마감 `무료 진단 받기` 버튼이 갈 곳
 * - 요금제 화면의 마감 버튼이 갈 곳
 * - 크몽 프로필·광고·메신저에 붙일 수 있는 링크
 *
 * 조판은 랜딩에서 쓰던 신청서 한 장(`RequestSheet`) 그대로다 — 접수 안내
 * 레일(경쟁사 분모·질의 미리보기·측정 규격·방침/문의) + 기입란.
 *
 * ## 등장은 `Reveal`이 아니라 `.enter-rise`다
 *
 * 이 페이지에서 폼은 첫 화면 콘텐츠다. `Reveal`(Motion `whileInView`)은
 * 프리렌더 HTML에 인라인 `opacity:0`을 박고 하이드레이션 뒤에야 푼다 — 첫
 * 화면에 걸면 LCP가 JS 뒤로 밀리고, 청크 하나가 실패하면 신청 폼이 통째로
 * 빈 화면이 된다. 이 페이지의 유일한 목적이 그 폼이므로 그 위험을 지지
 * 않는다. CSS 키프레임은 스타일시트가 오는 즉시 시작한다(globals.css 주석).
 * 스태거 값은 랜딩 히어로와 같은 `--motion-stagger`(120ms)의 배수다.
 */

export const metadata = {
  title: '무료 진단 신청',
  description:
    'ChatGPT와 Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 메일로 보내드립니다. 카드 정보는 받지 않습니다.',
}

export default function NewAuditPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pt-24 pb-28 md:pb-40">
      <h1 className="enter-rise text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        무료 진단 신청
      </h1>
      <p className="enter-rise mt-6 max-w-[38em] text-lg leading-relaxed text-muted-foreground [animation-delay:calc(var(--motion-stagger)*1)]">
        {engineLabels(PLANS.free.engines).join('와 ')}에 소비자가 할 법한 질문{' '}
        <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를 직접 던지고,
        답변에 브랜드가 나왔는지 세어 메일로 보내드립니다.
      </p>
      {/* ★ 질의에 브랜드명을 넣지 않는다는 것이 이 제품의 핵심이다. 신청
          화면에서 말해야 "우리 이름을 넣고 물어본 거 아니야?"가 안 나온다. */}
      <p className="enter-rise mt-4 max-w-[38em] text-sm leading-relaxed text-muted-foreground [animation-delay:calc(var(--motion-stagger)*2)]">
        질문에는 브랜드명을 넣지 않습니다. 이름을 대고 물으면 AI는 당연히 그 브랜드를 말합니다.
        재는 것은{' '}
        <strong className="font-medium text-foreground">이름을 대지 않았을 때도 불리는가</strong>
        입니다.
      </p>

      <div className="enter-rise mt-12 [animation-delay:calc(var(--motion-stagger)*3)]">
        <RequestSheet />
      </div>

      <p className="enter-rise mt-8 text-sm text-muted-foreground [animation-delay:calc(var(--motion-stagger)*4)]">
        무료 진단으로 알 수 없는 것과 유료 플랜의 차이는{' '}
        <Link
          href="/pricing"
          className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-[var(--motion-micro)] ease-instrument hover:decoration-foreground"
        >
          요금제
        </Link>
        에 적어 두었습니다.
      </p>
    </section>
  )
}
