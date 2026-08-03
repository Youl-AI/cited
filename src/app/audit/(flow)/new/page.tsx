import Link from 'next/link'
import { RequestForm } from '@/components/audit/request-form'
import { GlassPanel } from '@/components/marketing/glass-panel'
import { PLANS, engineLabels } from '@/lib/plans'

/**
 * 무료 진단 신청 — 독립 페이지.
 *
 * ## 랜딩의 폼을 대체하지 않는다
 *
 * 랜딩은 히어로에서 실제 AI 답변을 보여주고, 바로 아래 섹션에 폼을 둔다.
 * 답변을 보고 "어 우리 브랜드는?"이 되는 그 순간에 폼이 손 닿는 곳에 있어야
 * 한다. 폼을 여기로 **옮기면** 그 순간과 행동 사이에 클릭이 하나 들어가고,
 * GEO를 모르는 사람일수록 거기서 샌다.
 *
 * 이 페이지가 있는 이유는 **주소가 필요해서**다:
 * - 머리글의 `무료 진단 받기` 버튼이 갈 곳 (랜딩에 있으면 눌러도 제자리다)
 * - 요금제 화면의 마감 버튼이 갈 곳
 * - 크몽 프로필·광고·메신저에 붙일 수 있는 링크
 *
 * `RequestForm`은 이미 분리된 컴포넌트라 두 곳에 두는 비용이 없다. 순서 안내와
 * "계정을 만들지 않는다"는 폼 **안에** 있으므로 여기서도 자동으로 따라온다.
 *
 * ## 등장은 `Reveal`이 아니라 `.enter-rise`다
 *
 * 이 페이지에서 폼은 첫 화면 콘텐츠다. `Reveal`(Motion `whileInView`)은
 * 프리렌더 HTML에 인라인 `opacity:0`을 박고 하이드레이션 뒤에야 푼다 — 첫
 * 화면에 걸면 LCP가 JS 뒤로 밀리고, 청크 하나가 실패하면 신청 폼이 통째로
 * 빈 화면이 된다. 이 페이지의 유일한 목적이 그 폼이므로 그 위험을 지지
 * 않는다. CSS 키프레임은 스타일시트가 오는 즉시 시작한다(globals.css 주석).
 * 스태거 값은 랜딩 히어로와 같은 `--motion-stagger`(60ms)의 배수다.
 */

export const metadata = {
  title: '무료 진단 신청',
  description:
    'ChatGPT와 Gemini에 직접 물어보고, 답변에 브랜드가 나왔는지 세어 메일로 보내드립니다. 카드 정보는 받지 않습니다.',
}

export default function NewAuditPage() {
  return (
    // `pt-24`는 떠 있는 유리 알약 머리글(72px)의 자리다.
    <section className="mx-auto w-full max-w-2xl px-6 pt-24 pb-28 md:pb-40">
      <h1 className="enter-rise text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        무료 진단 신청
      </h1>
      <p className="enter-rise mt-6 text-lg leading-relaxed text-muted-foreground [animation-delay:60ms]">
        {engineLabels(PLANS.free.engines).join('와 ')}에 소비자가 할 법한 질문{' '}
        <span className="font-mono tabular-nums">{PLANS.free.maxQueries}</span>개를 직접 던지고,
        답변에 브랜드가 나왔는지 세어 메일로 보내드립니다.
      </p>
      {/* ★ 질의에 브랜드명을 넣지 않는다는 것이 이 제품의 핵심이다. 신청
          화면에서 말해야 "우리 이름을 넣고 물어본 거 아니야?"가 안 나온다.
          ★ 원래 이 문장은 em-dash로 이어져 있었다(tasteskill §9.G 위반).
            Task 3의 스윕이 랜딩·요금제만 훑어서 여기가 남아 있었다. */}
      <p className="enter-rise mt-4 text-sm leading-relaxed text-muted-foreground [animation-delay:120ms]">
        질문에는 브랜드명을 넣지 않습니다. 이름을 대고 물으면 AI는 당연히 그 브랜드를 말합니다.
        재는 것은{' '}
        <strong className="font-medium text-foreground">이름을 대지 않았을 때도 불리는가</strong>
        입니다.
      </p>

      <div className="enter-rise mt-12 [animation-delay:180ms]">
        <GlassPanel>
          <div className="p-6 sm:p-8">
            <RequestForm />
          </div>
        </GlassPanel>
      </div>

      <p className="enter-rise mt-8 text-sm text-muted-foreground [animation-delay:240ms]">
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
