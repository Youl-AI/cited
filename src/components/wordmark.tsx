import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * 워드마크.
 *
 * 머리글(앱)·마케팅 머리글·바닥글 **세 곳**이 같은 것을 그린다. 세 곳에 각각
 * 적어 두면 각주 표식이 한 곳에서만 사라지거나 포커스 링이 갈리는 식으로
 * 조용히 달라진다(실제로 리뉴얼 직전까지 두 벌이 따로 있었다).
 *
 * ★ 로그인 상태에서도 `/`로 간다. 원래는 `/dashboard`였는데, 대시보드에서
 *   나갈 길이 없어서 사용자가 갇혔다. 대시보드가 내용을 갖게 되면
 *   호출부에서 `href`를 바꿀 수 있게 prop으로 열어 둔다.
 */
export function Wordmark({
  className,
  href = '/',
}: {
  className?: string
  href?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex items-baseline gap-px rounded-sm font-semibold tracking-tight',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        className,
      )}
    >
      Cited
      {/* 각주 표식. 인용된 문장 뒤에 붙는 바로 그 기호이고, 이 제품이 하는 일
          자체다. 읽어 줄 내용은 없으므로 보조기기에는 숨긴다. */}
      <span
        aria-hidden="true"
        className="font-mono text-[0.6em] leading-none text-muted-foreground transition-colors group-hover:text-primary"
      >
        [1]
      </span>
    </Link>
  )
}
