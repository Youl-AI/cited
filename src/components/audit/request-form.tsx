'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { CategoryCombobox } from '@/components/audit/category-combobox'
import { FlowStrip, NO_ACCOUNT_NOTE } from '@/components/audit/flow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'
import { MAX_COMPETITORS } from '@/lib/audit/request-schema'

/**
 * 자동완성 목록은 전국형 업종만. 지역형 업종(치과 등)은 지역 없이는 질의를
 * 만들 수 없는데 이 폼에는 지역 입력이 없다(region은 CLI 전용 — A안 결정).
 * 목록에 올리면 처리할 수 없는 신청을 부추기게 되고, `audit:run`에서야 막혀
 * "영업일 1일" 약속이 깨진다. 랜딩 탭(`query-protocol.tsx`)과 같은 필터다.
 */
const SUGGESTED_CATEGORIES: readonly string[] = KNOWN_CATEGORIES.filter(
  (c) => !isRegionalCategory(c),
)

/**
 * 무료 진단 신청 폼.
 *
 * ## 이 폼이 설정해야 하는 기대
 *
 * 즉시 결과가 아니다. 버튼 문구가 **"무료 진단 신청하기"**인 이유가 그것이다 —
 * "무료로 진단받기"는 지금 결과가 나온다고 약속한다. 그 약속을 어기면 확인
 * 메일을 스팸으로 신고당한다.
 *
 * ## 경쟁사 칸을 접어 두지 않는다
 *
 * 경쟁사를 넣으면 언급 점유율이 나오고 그게 가장 강한 후킹인데, 비면 `n=0`이라
 * 리포트에서 그 섹션이 **아예 사라진다.** 접어 두면 아무도 안 넣고, 그러면
 * 우리가 가진 가장 좋은 화면을 우리 손으로 없애는 셈이다.
 *
 * ## 이 폼은 이제 다크 표면에서만 렌더된다
 *
 * 랜딩(`(marketing)`)과 `/audit/new`(`audit/(flow)`) 둘뿐이고 둘 다
 * `.surface-dark`다. 그래서 조판을 마케팅 쪽에 맞춘다 — 컨트롤 높이를 키우고
 * (앱 기본 `h-8` = 32px은 터치 타깃 권장치의 3/4다), 모서리는 마케팅
 * 표면의 규칙대로 각(radius 0)이다 — cta-link.tsx 모서리 규칙 참고.
 *
 * ★ 입력 **테두리**의 대비는 여기가 아니라 토큰이 푼다 — globals.css의
 *   `--border-interactive`(다크 카드 위 3.33:1). 클래스로 밝히면 랜딩과
 *   `/audit/new`가 조용히 갈린다.
 * ★ 필드 이름·순서·검증 로직·문구는 한 글자도 건드리지 않았다. 분석 이벤트와
 *   브라우저 자동완성이 이름에 붙어 있고, e2e가 라벨로 찾는다.
 */

/**
 * 마케팅 표면의 폼 컨트롤 치수.
 *
 * `h-11`(44px)은 터치 타깃 권장치다. 데스크톱 글자를 `md:text-sm`(14px)에서
 * 15px로 올린 이유는 이 폼이 앱의 촘촘한 표가 아니라 전환 지점이기 때문이고,
 * 모바일에서 16px를 유지하는 것은 iOS Safari가 그 아래에서 확대하기 때문이다
 * (`Input` 기본값 `text-base`가 그 몫을 한다).
 */
const FIELD = 'h-11 rounded-none md:text-[0.9375rem]'

interface FieldError {
  field: string | null
  message: string
}

export function RequestForm() {
  const router = useRouter()
  const ids = {
    brandName: useId(),
    category: useId(),
    siteUrl: useId(),
    email: useId(),
  }

  const [competitors, setCompetitors] = useState<string[]>([''])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<FieldError | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const values = {
      brandName: String(form.get('brandName') ?? ''),
      category: String(form.get('category') ?? ''),
      email: String(form.get('email') ?? ''),
      siteUrl: String(form.get('siteUrl') ?? ''),
      competitors: competitors.map((c) => c.trim()).filter(Boolean),
    }

    // ★ 오프라인·DNS 실패에서 `fetch`는 `{ error }`를 돌려주지 않고 **던진다.**
    //   1단계 인증 폼에서 실제로 겪은 문제다 — 잡지 않으면 버튼이 영원히
    //   "신청 중"에 멈추고 사용자는 무엇이 잘못됐는지 알 수 없다.
    let res: Response
    try {
      res = await fetch('/api/audit/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      })
    } catch {
      setError({ field: null, message: '요청을 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.' })
      setPending(false)
      return
    }

    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: unknown }).error)
          : '신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setError({ field: null, message })
      setPending(false)
      return
    }

    router.push('/audit/requested?state=sent')
  }

  const canAddCompetitor = competitors.length < MAX_COMPETITORS

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={ids.brandName}>브랜드명</Label>
        <Input
          id={ids.brandName}
          name="brandName"
          required
          maxLength={100}
          autoComplete="organization"
          placeholder="무신사"
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>업종</Label>
        {/* 자유 입력을 막지 않는다. 목록에 없는 업종이면 그 입력값으로 질의를
            만든다(`generateAuditQueries`). select로 만들면 목록 밖의 업종을
            가진 고객이 신청 자체를 못 한다. datalist에서 커스텀 콤보박스로
            바꾼 이유는 category-combobox.tsx 머리말 참고(네이티브 패널은
            스타일이 닿지 않는다). */}
        <CategoryCombobox
          id={ids.category}
          name="category"
          required
          maxLength={100}
          suggestions={SUGGESTED_CATEGORIES}
          placeholder="패션"
          className={FIELD}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.email}>이메일</Label>
        <Input
          id={ids.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="example@company.com"
          className={FIELD}
        />
        <p className="text-xs text-muted-foreground">
          이 주소로 확인 메일과 리포트를 보냅니다.
        </p>
      </div>

      {/* ── 선택 항목 ─────────────────────────────────────────
          두 칸 모두 리포트의 특정 섹션을 켜고 끈다. 비면 그 섹션이 사라지므로,
          "선택"이라고만 쓰고 무엇이 없어지는지 말하지 않으면 아무도 안 넣는다.
          ★ 범례에서 `uppercase`를 뺐다. 한글에는 대소문자가 없어서 아무 일도
            하지 않으면서, 기계적으로 세는 아이브로(`uppercase tracking`)로만
            잡혔다(tasteskill §4.7 EYEBROW RESTRAINT). 자간은 남긴다. */}
      <fieldset className="space-y-4 rounded-none border border-border bg-foreground/[0.04] p-5">
        <legend className="px-1.5 text-xs font-medium tracking-[0.06em] text-muted-foreground">
          넣으면 리포트가 늘어납니다
        </legend>

        <div className="space-y-2">
          <Label htmlFor={ids.siteUrl}>사이트 주소</Label>
          <Input
            id={ids.siteUrl}
            name="siteUrl"
            inputMode="url"
            autoComplete="url"
            placeholder="musinsa.com"
            className={FIELD}
          />
          <p className="text-xs text-muted-foreground">
            AI가 인용한 출처 중 <strong className="font-medium">우리 사이트가 있는지</strong>{' '}
            확인합니다. 없으면 그 줄은 리포트에 나오지 않습니다.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm leading-none font-medium">경쟁사</span>
          <div className="space-y-2">
            {competitors.map((value, index) => (
              <Input
                key={index}
                aria-label={`경쟁사 ${index + 1}`}
                value={value}
                maxLength={100}
                placeholder={index === 0 ? '29CM' : '한 곳씩'}
                className={FIELD}
                onChange={(e) => {
                  const next = [...competitors]
                  next[index] = e.target.value
                  setCompetitors(next)
                }}
              />
            ))}
          </div>
          {canAddCompetitor && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              // 마케팅 표면의 모서리 규칙: 컨트롤도 각이다(cta-link.tsx).
              className="h-9 rounded-none px-4"
              onClick={() => setCompetitors([...competitors, ''])}
            >
              경쟁사 추가 ({competitors.length}/{MAX_COMPETITORS})
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            넣으면 <strong className="font-medium">언급 점유율</strong>을 함께 보내드립니다. 같은
            답변에서 누가 더 자주 불리는지 비교합니다.
          </p>
        </div>
      </fieldset>

      {/* 오류는 인라인이다 — 토스트로 띄우면 스크롤 위치에 따라 못 보고
          지나간다(§4.5 Error States). 다크 표면에서 `/5` 틴트는 거의 보이지
          않아 `/10`으로 올렸다: 카드 대비 1.12:1로 면이 읽히고, 그 위
          `text-destructive`는 5.28:1로 AA를 넘는다. */}
      {error && (
        <p
          role="alert"
          className="rounded-none border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error.message}
        </p>
      )}

      {/* ★ 순서를 **누르기 전에** 보여준다. 이게 없으면 확인 메일이 회원가입
          인증처럼 읽힌다 — 실제로 그렇게 읽혔다. 폼 안에 두는 이유는 폼이
          렌더링되는 모든 곳(랜딩·`/audit/new`)에서 빠질 수 없게 하기 위함이다. */}
      <div className="rounded-none border border-border bg-foreground/[0.04] p-5">
        <FlowStrip className="space-y-2" />
        <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">{NO_ACCOUNT_NOTE}</strong> 확인 메일은
          가입 인증이 아니라 본인 확인입니다. 카드 정보는 받지 않습니다.
        </p>
      </div>

      {/* ★ 제출은 `CtaLink`가 될 수 없다(그건 `<Link>`다). 대신 그 치수·모서리·
          눌림을 그대로 가져온다 — 마케팅 표면의 컨트롤은 전부 각이고(cta-link.tsx
          모서리 규칙), 이 버튼이 그 규칙의 예외가 되면 페이지에서 가장 중요한
          것 하나만 앱 버튼으로 남는다.
        ★ 호버를 `hover:bg-primary/80`(앱 기본값)에서 되돌렸다. 어두운 배경
          위에서 투명도를 낮추면 배경이 비쳐 **누를수록 흐려지고 대비가 함께
          떨어진다.** 마케팅 CTA와 같은 방향, 즉 **밝히는** 쪽으로 간다.
        ★ `aria-busy`는 로직이 아니라 이미 있는 `pending` 상태를 보조기술에
          전달하는 표시다. 문구("신청 중…")·비활성화 조건은 그대로다.
        ★ 눌림은 `Button`이 이미 가진 프레스(`active:scale-[0.98]` + `.motion-press`)가
          낸다. 여기에 또 다른 눌림(하강·기울임)을 더하지 않는다 — 한 동작에
          물리 법칙이 둘이면 손끝 반응이 흐려진다. */}
      <Button
        type="submit"
        size="lg"
        aria-busy={pending}
        className="h-12 w-full rounded-none text-[0.9375rem] font-semibold ease-spring hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_12%)] disabled:opacity-60"
        disabled={pending}
      >
        {pending ? '신청 중…' : '무료 진단 신청하기'}
      </Button>
    </form>
  )
}
