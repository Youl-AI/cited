import { ArrowUpRightIcon } from '@phosphor-icons/react/ssr'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * 마케팅 표면의 행동 유도 링크.
 *
 * ## 왜 앱의 `Button`을 쓰지 않는가
 *
 * 앱 버튼은 계측기의 손잡이다 — 8~10px 반경, 촘촘한 높이, 정보 밀도 우선.
 * 마케팅 표면의 규칙은 다르다(soft-skill §4.B): **완전한 알약**에, 화살표는
 * 글자 옆에 벌거벗고 서지 않고 **자기 원 안에** 들어가 버튼 오른쪽 안쪽
 * 여백에 딱 맞게 앉는다. 두 규칙을 한 컴포넌트에 variant로 욱여넣으면 앱
 * 화면에서 알약이 새어 나온다.
 *
 * ## 모서리 규칙(Shape Consistency Lock)
 *
 * 마케팅 표면: **누르는 것은 전부 알약**(`rounded-full`), 패널은 2rem대,
 * 그 안의 작은 상자는 `--radius`(1rem). 폼 컨트롤만 예외로 앱의 반경을 따른다
 * — 입력은 계측 도구이고 `/audit/new`(라이트 표면)와 같은 컴포넌트다.
 *
 * ## 대비
 *
 * `--primary`(#79a6e9) 위의 `--primary-foreground`(#17202e)는 7.67:1로 AA를
 * 넘는다(globals.css의 다크 블록 주석 참고). 호버는 **밝히는** 쪽으로만 간다
 * — `bg-primary/80`처럼 투명도를 낮추면 어두운 배경이 비쳐 CTA가 눌릴수록
 * 흐려지고, 대비도 함께 떨어진다.
 */

const TONE = {
  /**
   * 무료 진단으로 보내는 길. **의도가 하나**라는 뜻이지 인스턴스가 하나라는
   * 뜻이 아니다 — tasteskill §4.5는 같은 의도에 라벨을 하나만 쓰라고 하지
   * 그 라벨을 한 번만 놓으라고 하지 않는다. 랜딩에서는 머리글·히어로·마감
   * 셋이 같은 문구("무료 진단 받기")를 쓴다. 새 문구를 만드는 순간이 위반이다.
   */
  primary:
    'bg-primary text-primary-foreground shadow-elevation-2 hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)]',
  /** 보조. 유리 표면 위의 헤어라인 알약. */
  ghost: 'border border-border bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08]',
} as const

const SIZE = {
  md: { root: 'h-12 gap-3 pl-6 text-[0.9375rem]', pad: 'pr-1.5', flat: 'pr-6', dot: 'size-9' },
  sm: { root: 'h-9 gap-2 pl-4 text-sm', pad: 'pr-1', flat: 'pr-4', dot: 'size-7' },
} as const

export function CtaLink({
  href,
  children,
  tone = 'primary',
  size = 'md',
  icon = true,
  className,
}: {
  href: string
  children: React.ReactNode
  tone?: keyof typeof TONE
  size?: keyof typeof SIZE
  /** 트레일링 화살표 원. 보조 링크에서는 끄는 편이 조용하다 */
  icon?: boolean
  className?: string
}) {
  const s = SIZE[size]
  return (
    <Link
      href={href}
      className={cn(
        'group/cta inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap',
        // 눌림. 이징은 --ease-spring(오버슈트 4% 이내) — 손끝 반응에만 쓰는 그 값이다.
        // ★ 전이 목록에 `transform`이 아니라 `scale`을 적는다. Tailwind v4는
        //   `active:scale-[0.98]`을 `transform: scale(...)`이 아니라 **독립
        //   `scale` 속성**으로 낸다 — `transform`만 적으면 스프링이 걸리지 않고
        //   눌림이 뚝 끊긴다. `.motion-press`(globals.css)가 같은 이유로 목록에
        //   `scale`을 명시해 둔 그 선례다.
        'transition-[scale,background-color,box-shadow] duration-[var(--motion-micro)] ease-spring',
        'active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        TONE[tone],
        s.root,
        icon ? s.pad : s.flat,
        className,
      )}
    >
      {children}
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full',
            // 원 자체는 부모색을 덜어 만든다. 새 색을 들이면 액센트가 둘이 된다.
            tone === 'primary' ? 'bg-primary-foreground/15' : 'bg-foreground/10',
            'transition-transform duration-[var(--motion-micro)] ease-spring',
            // 대각선으로 밀린다 — 화살표가 가리키는 방향과 같아야 한다.
            'group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-px',
            s.dot,
          )}
        >
          <ArrowUpRightIcon size={size === 'sm' ? 14 : 16} weight="bold" />
        </span>
      ) : null}
    </Link>
  )
}
