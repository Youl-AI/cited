import Link from 'next/link'
import { Button } from '@/components/ui/button'

// 이 화면은 셸이다. 요금제·근거·사례 같은 마케팅 섹션은 3단계(Task 8)에서
// 무료 진단 흐름과 함께 들어온다. 지금은 구조와 조판만 자리를 잡는다.
export default function HomePage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        한국어 GEO 모니터링
      </p>
      <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        AI 답변에 우리 브랜드가 얼마나 인용되는지
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        ChatGPT · Gemini · 네이버 AI 브리핑 · Google AI Overviews에서 브랜드 언급을 매주 자동
        추적합니다.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button size="lg" className="h-10 px-5" asChild>
          <Link href="/sign-up">시작하기</Link>
        </Button>
        <Button size="lg" variant="outline" className="h-10 px-5" asChild>
          <Link href="/sign-in">로그인</Link>
        </Button>
      </div>
    </section>
  )
}
