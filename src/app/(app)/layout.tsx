import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { requireUser } from '@/lib/session'

/**
 * 로그인 필수 구간의 셸.
 *
 * ★ 이 레이아웃의 requireUser()를 **유일한 방어선으로 믿으면 안 된다.**
 *   Next는 같은 레이아웃을 공유하는 라우트끼리 클라이언트 내비게이션할 때
 *   레이아웃을 다시 렌더링하지 않는다. /dashboard에서 /settings로 넘어가는
 *   동안 이 함수는 한 번도 다시 돌지 않으므로, 그 사이에 세션이 만료·취소된
 *   사용자에게도 다음 페이지가 그려진다. 여기서 걸리는 것은 하드 로드뿐이다.
 *
 *   그래서 **이 그룹 안의 모든 page.tsx는 자기 자신도 requireUser()를 호출한다.**
 *   (dashboard·settings·billing 전부 그렇게 되어 있다. 새 라우트를 추가할 때도
 *   같은 줄을 넣어라. 빼먹어도 화면은 멀쩡히 뜨기 때문에 리뷰에서 놓치기 쉽다.)
 *
 *   미들웨어로 한 번에 막는 방법은 이번 범위 밖이다 — Better Auth 세션 검증은
 *   DB를 보므로 Edge 미들웨어에서 그대로 돌릴 수 없고, 쿠키 존재 여부만 보는
 *   미들웨어는 "취소된 세션" 케이스를 못 막아 방어선이 하나 더 늘 뿐이다.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader user={{ name: user.name, email: user.email }} />
      {/* id·tabindex는 루트 레이아웃의 "본문으로 건너뛰기" 링크가 쓴다.
          ★ 좌우 여백은 머리글(`px-4 sm:px-6`)과 **같은 값이어야 한다.** 다르면
            워드마크와 첫 카드의 왼쪽 모서리가 어긋나서, 화면 전체가 미묘하게
            비뚤어 보인다(세로선 하나가 어긋나는 것이 가장 눈에 띈다).
            `max-w-6xl`도 머리글과 같다.
          ★ 위아래 여백이 비대칭인 것은 의도다(redesign-skill Layout —
            "symmetrical vertical padding"). 머리글은 스티키라 늘 화면에 붙어 있어서 위쪽은 이미
            닫혀 있는 반면, 아래쪽은 푸터까지가 열린 공간이다. 광학적으로
            같아 보이려면 아래가 더 커야 한다. 실값은 32/48px(sm 40/56,
            lg 48/64)로, 어느 구간에서든 아래가 위의 1.5배다. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-12 outline-none sm:px-6 sm:pt-10 sm:pb-14 lg:pt-12 lg:pb-16"
      >
        {children}
      </main>
      {/* ★ 푸터에는 전자상거래법 제10조가 요구하는 사업자 표시가 들어 있다.
          `SiteShell`(공개 화면)에는 붙어 있는데 여기만 빠져 있었다 — 로그인
          구간 세 화면에서 그 표시가 통째로 없었다는 뜻이다. */}
      <SiteFooter />
    </div>
  )
}
