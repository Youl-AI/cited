import { NO_ACCOUNT_NOTE } from '@/components/audit/flow'
import { CtaLink } from '@/components/marketing/cta-link'

/**
 * 신청 → 인증 → 대기 사이의 안내 화면.
 *
 * ★ 즉시 결과를 포기했으므로 **이 화면이 이탈을 막는 유일한 장치다.** 지금 무슨
 *   일이 일어났고 다음에 무엇이 오는지 한 화면에서 말한다.
 *
 * ★ `already`를 오류로 보여주지 않는 것이 중요하다. 메일 링크를 두 번 누르는
 *   것은 흔하고, 그게 오류처럼 보이면 사용자는 무언가 잘못됐다고 믿는다.
 *
 * ## 여기에 카드를 만들지 않는다
 *
 * 이 화면은 제목 하나와 문단 셋이다. 유리 패널에 담으면 "무언가 조작할 것이
 * 있다"는 신호가 되는데 실제로는 읽고 나가는 화면이다(§14 "Cards omitted in
 * favor of spacing"). 신청 폼(`/audit/new`, 패널 안)과 레이아웃 계열이 갈리는
 * 것도 의도다.
 */

export const metadata = { title: '진단 신청' }

const STATES = {
  sent: {
    step: '1 / 2',
    eyebrow: '',
    title: '메일함을 확인해 주세요',
    // ★ "가입 인증이 아니다"를 여기서 말한다. 이 화면 위에 머리글이 함께
    //   보이므로, 안 밝히면 방금 한 것이 회원가입인지 아닌지 판단할 근거가
    //   없다 — 실제로 헷갈렸다.
    body: '방금 보낸 확인 메일의 링크를 눌러야 진단이 시작됩니다. 확인하지 않으면 아무것도 실행되지 않습니다. 가입 인증이 아니라 본인 확인입니다.',
    note: '몇 분 안에 도착하지 않으면 스팸함을 확인해 주세요. 그래도 없으면 다시 신청해 주세요.',
    tone: 'neutral',
    action: { href: '/audit/new', label: '다시 신청하기' },
  },
  verified: {
    step: '2 / 2',
    eyebrow: '',
    title: '확인됐습니다',
    body: '영업일 1일 이내에 진단 리포트를 메일로 보내드립니다. 측정은 실제 AI 서비스에 직접 질문해 수행하므로 시간이 걸립니다.',
    note: '이 창은 닫아도 됩니다. 결과는 메일로 갑니다.',
    tone: 'done',
    action: null,
  },
  already: {
    // ★ 오류가 아니다. 같은 링크를 두 번 누른 것이고, 상태는 정상이다.
    step: '2 / 2',
    eyebrow: '',
    title: '이미 확인된 신청입니다',
    body: '리포트를 준비하고 있습니다. 영업일 1일 이내에 메일로 보내드립니다.',
    note: '이 창은 닫아도 됩니다. 결과는 메일로 갑니다.',
    tone: 'done',
    action: null,
  },
  invalid: {
    step: null,
    eyebrow: '확인 실패',
    title: '링크가 만료되었거나 올바르지 않습니다',
    body: '확인 링크는 발송 후 7일간 유효합니다. 링크가 메일 클라이언트에서 잘렸을 수도 있습니다.',
    note: '다시 신청하시면 새 확인 메일을 보내드립니다.',
    tone: 'error',
    action: { href: '/audit/new', label: '다시 신청하기' },
  },
} as const

type StateKey = keyof typeof STATES

function resolveState(value: string | undefined): StateKey {
  return value === 'verified' || value === 'already' || value === 'invalid' ? value : 'sent'
}

export default async function AuditRequestedPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const view = STATES[resolveState(state)]
  const isError = view.tone === 'error'

  return (
    // `pt-24`는 떠 있는 유리 알약 머리글(72px)의 자리다.
    <section className="mx-auto w-full max-w-2xl px-6 pt-24 pb-28 md:pb-40">
      {/* mono를 쓰지 않는다 — 한글 글리프가 없어서 "단계"만 시스템 서체로
          떨어지고 한 줄 안에서 서체가 갈린다. 숫자만 mono로 감싼다. */}
      <p
        className={[
          'enter-rise text-sm font-medium tracking-wide',
          isError ? 'text-destructive' : 'text-muted-foreground',
        ].join(' ')}
      >
        {view.step ? (
          <>
            <span className="font-mono tabular-nums">{view.step}</span> 단계
          </>
        ) : (
          view.eyebrow
        )}
      </p>

      <h1 className="enter-rise mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl [animation-delay:60ms]">
        {view.title}
      </h1>

      <p className="enter-rise mt-6 text-lg leading-relaxed text-muted-foreground [animation-delay:120ms]">
        {view.body}
      </p>

      {/* 인용 규칙(랜딩의 표본 각주와 같다): 왼쪽 한 줄만 긋는다. 위아래로
          두르지 않는다(§9.F). 실패 상태에서만 그 선이 색을 갖는다 — 색이
          붙는 유일한 조건이 실제 상태라는 뜻이다. */}
      <p
        className={[
          'enter-rise mt-8 border-l-2 pl-5 text-sm leading-relaxed text-muted-foreground [animation-delay:180ms]',
          isError ? 'border-destructive' : 'border-border',
        ].join(' ')}
      >
        {view.note}
      </p>

      {/* ★ 계정이 없다는 사실을 모든 상태에서 말한다. 머리글에 로그인 버튼이
          있으므로, 안 밝히면 "로그인해야 결과를 보나?"가 남는다. */}
      <p className="enter-rise mt-8 text-sm text-muted-foreground [animation-delay:240ms]">
        {NO_ACCOUNT_NOTE}
      </p>

      {view.action && (
        <div className="enter-rise mt-10 [animation-delay:300ms]">
          {/* 마케팅 표면에서 누르는 것은 전부 알약이다(Task 3 §2.8 모서리 규칙).
              보조 행동이므로 ghost다 — 이 화면의 주된 일은 기다리는 것이다. */}
          <CtaLink href={view.action.href} tone="ghost">
            {view.action.label}
          </CtaLink>
        </div>
      )}
    </section>
  )
}
