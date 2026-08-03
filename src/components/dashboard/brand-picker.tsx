import Link from 'next/link'

/**
 * 브랜드 전환 — **세그먼트 트레이**다 (앱 머리글의 현재 위치 표시와 같은 어휘).
 *
 * ★ 예전에는 항목마다 자기 테두리를 갖고 흩어져 있었고, 선택된 항목만
 *   --primary로 꽉 찬 알약이었다. 문제가 둘이었다:
 *   (1) 브랜드색이 이 화면에서는 **차트의 계열색**이기도 하다 — 같은 색이
 *       "선택된 브랜드"와 "전체 언급률 계열"을 동시에 뜻했다 (§2: 색의 뜻은 하나).
 *   (2) 항목이 흩어져 있으면 "이 중에서 하나를 고른다"가 형태로 읽히지 않는다.
 *   트레이 하나 안에서 활성 항목만 카드색으로 1단 떠오르면 둘 다 해결된다.
 * ★ `aria-current="page"`는 그대로다 — 판으로 말하는 것은 시각 채널이고,
 *   보조기기에는 여전히 속성이 말해야 한다.
 */
export function BrandPicker({
  brands,
  selectedId,
  canAdd,
}: {
  brands: { id: string; name: string }[]
  selectedId: string
  canAdd: boolean
}) {
  if (brands.length <= 1 && !canAdd) return null
  // 반경은 카드·머리글과 같은 동심 뺄셈이다: 껍질 --radius×1.4, 베젤 4px(p-1),
  // 항목 = 껍질 − 베젤.
  // ★ `var(--radius-xl)`로 줄여 쓰지 않는다 — 그 변수는 `:root`에서 치환돼
  //   1.05rem으로 굳으므로 표면 스코프(`.surface-dark`의 --radius: 1rem)를
  //   타지 못한다. 계산식은 이 요소에서 치환된다 (card.tsx 주석 참고).
  // ★ **모든 항목에 `border`가 있다.** 아래 "추가"만 점선 테두리를 두르면
  //   그 항목만 2px 크고 베이스라인이 어긋난다 — 투명 테두리로 상자를 맞추고
  //   색만 갈아 끼운다.
  const item =
    'motion-press rounded-[calc(var(--radius)*1.4-0.25rem)] border border-transparent px-3 py-1.5 text-sm active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
  return (
    <nav
      aria-label="브랜드 선택"
      className="flex max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-muted/70 p-1 ring-1 ring-foreground/[0.06]"
    >
      {brands.map((b) => (
        <Link
          key={b.id}
          href={`/dashboard?brand=${b.id}`}
          aria-current={b.id === selectedId ? 'page' : undefined}
          className={
            b.id === selectedId
              ? `${item} bg-card font-medium text-foreground shadow-elevation-1`
              : `${item} text-muted-foreground hover:bg-card/60 hover:text-foreground`
          }
        >
          {b.name}
        </Link>
      ))}
      {canAdd && (
        // 추가는 브랜드가 아니다 — 같은 트레이에 있되 점선으로 갈라 둔다
        // (회차 목록의 빈 상태와 같은 뜻: "여기에 채워질 자리").
        // 상자 크기는 `item`의 투명 테두리가 이미 맞춰 놨다 — 여기서는
        // 스타일과 색만 바꾼다(`border` 폭을 다시 선언하지 않는다).
        <Link
          href="/onboarding"
          className={`${item} border-dashed border-border text-muted-foreground hover:border-ring/40 hover:text-foreground`}
        >
          + 브랜드 추가
        </Link>
      )}
    </nav>
  )
}
