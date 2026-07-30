import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * 신청 → 인증 → 대기 사이의 안내 화면.
 *
 * ★ 즉시 결과를 포기했으므로 **이 화면이 이탈을 막는 유일한 장치다.** 지금 무슨
 *   일이 일어났고 다음에 무엇이 오는지 한 화면에서 말한다.
 *
 * ★ `already`를 오류로 보여주지 않는 것이 중요하다. 메일 링크를 두 번 누르는
 *   것은 흔하고, 그게 오류처럼 보이면 사용자는 무언가 잘못됐다고 믿는다.
 */

export const metadata = { title: '진단 신청' }

const STATES = {
  sent: {
    step: '1 / 2',
    eyebrow: '',
    title: '메일함을 확인해 주세요',
    body: '방금 보낸 확인 메일의 링크를 눌러야 진단이 시작됩니다. 확인하지 않으면 아무것도 실행되지 않습니다.',
    note: '몇 분 안에 도착하지 않으면 스팸함을 확인해 주세요. 그래도 없으면 다시 신청해 주세요.',
    tone: 'neutral',
    action: { href: '/', label: '다시 신청하기' },
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
    action: { href: '/', label: '다시 신청하기' },
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

  return (
    <section className="mx-auto w-full max-w-xl px-6 py-20 sm:py-28">
      {/* mono를 쓰지 않는다 — 한글 글리프가 없어서 "단계"만 시스템 서체로
          떨어지고 한 줄 안에서 서체가 갈린다. 숫자만 mono로 감싼다. */}
      <p
        className={[
          'text-sm font-medium tracking-wide',
          view.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
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

      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{view.title}</h1>

      <p className="mt-5 text-base leading-relaxed text-muted-foreground">{view.body}</p>

      <p className="mt-4 border-l-2 border-border pl-4 text-sm text-muted-foreground">
        {view.note}
      </p>

      {view.action && (
        <Button variant="outline" className="mt-8" asChild>
          <Link href={view.action.href}>{view.action.label}</Link>
        </Button>
      )}
    </section>
  )
}
