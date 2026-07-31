import { redirect } from 'next/navigation'
import { loadOnboardingGate } from '@/lib/onboarding/gate'

export const metadata = { title: '온보딩 — 질의' }

/**
 * 온보딩 2단계 — 질의 에디터. **Task 5가 이 파일을 통째로 교체한다.**
 *
 * ★ 지금 여기 있는 이유는 하나다: 이 태스크가 `/onboarding`·`/dashboard`에
 *   "브랜드는 있는데 질의 미동결이면 이리로" 리다이렉트를 달았는데(state.ts
 *   `unfrozenBrandId` 주석), 라우트가 없으면 그 리다이렉트가 404로 끝난다.
 *   브랜드 폼도 저장 성공 후 이 주소로 온다(`brand-step-form.tsx`, Task 3).
 *   즉 이 주소는 이미 세 곳이 가리키는 목적지다 — 서버 로직(생성 한도·동결
 *   액션)은 준비됐고, 화면만 다음 태스크의 몫이다.
 *
 * ★ 게이트·소유 검증은 지금부터 건다. 화면이 비어 있다고 검증까지 미루면
 *   Task 5가 그것을 빠뜨렸을 때 아무도 눈치채지 못한다.
 *   requireUser는 loadOnboardingGate 안에서 호출된다 ((app) 그룹 규칙 충족).
 */
export default async function QueriesStepPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>
}) {
  const gate = await loadOnboardingGate()
  if (gate.state === 'no-plan') redirect('/dashboard')
  const { brand: brandId } = await searchParams
  // 자기 브랜드가 아니거나 이미 확정한 브랜드면 여기 머물 이유가 없다.
  if (!brandId || brandId !== gate.pendingBrandId) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">
        온보딩 2 / 3
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">측정할 질의</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        질의 편집 화면은 다음 단계에서 열립니다. 확정 전까지 이 브랜드는 측정되지 않습니다.
      </p>
    </div>
  )
}
