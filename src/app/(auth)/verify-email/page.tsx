import Link from 'next/link'

// 문구 주의: 이 화면은 메일이 "도착했다"고 단정하지 않는다.
// 발송은 가입 요청 뒤에 비동기로 일어나고 실패할 수 있는데(Resend 장애·설정 오류),
// Better Auth가 그 실패를 가입 응답에 실어 주지 않으므로 이 페이지는 결과를 알 수 없다.
// 그래서 "보냈습니다"가 아니라 "보내는 중"이라고 쓰고, 도착하지 않았을 때의
// 복구 경로(재로그인 → 확인 메일 재발송)를 함께 안내한다.
export default function VerifyEmailPage() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-16 outline-none">
      <div className="space-y-3">
        <Link
          href="/"
          className="group inline-flex items-baseline gap-px rounded-sm text-base font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Cited
          <span
            aria-hidden="true"
            className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
          >
            [1]
          </span>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">메일함을 확인해 주세요</h1>
      </div>
      <p className="text-muted-foreground">
        가입을 마치려면 이메일 확인이 필요합니다. 입력하신 주소로 확인 링크를 보내는 중입니다.
        링크를 누르면 가입이 완료됩니다.
      </p>
      <p className="text-sm text-muted-foreground">
        몇 분이 지나도 메일이 보이지 않으면 스팸함을 확인해 주세요. 그래도 없다면{' '}
        <Link href="/sign-in" className="text-foreground underline underline-offset-4">
          로그인
        </Link>
        을 다시 시도하시면 확인 메일이 새로 발송됩니다.
      </p>
    </main>
  )
}
