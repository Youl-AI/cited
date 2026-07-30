'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KNOWN_CATEGORIES } from '@/lib/audit/queries'
import { MAX_COMPETITORS } from '@/lib/audit/request-schema'

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
 */

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
    categoryList: useId(),
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
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={ids.brandName}>브랜드명</Label>
        <Input
          id={ids.brandName}
          name="brandName"
          required
          maxLength={100}
          autoComplete="organization"
          placeholder="무신사"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>업종</Label>
        {/* 자유 입력을 막지 않는다. 목록에 없는 업종이면 그 입력값으로 질의를
            만든다(`generateAuditQueries`). select로 만들면 목록 밖의 업종을
            가진 고객이 신청 자체를 못 한다. */}
        <Input
          id={ids.category}
          name="category"
          required
          maxLength={100}
          list={ids.categoryList}
          placeholder="패션"
        />
        <datalist id={ids.categoryList}>
          {KNOWN_CATEGORIES.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.email}>이메일</Label>
        <Input
          id={ids.email}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
        <p className="text-xs text-muted-foreground">
          이 주소로 확인 메일과 리포트를 보냅니다.
        </p>
      </div>

      {/* ── 선택 항목 ─────────────────────────────────────────
          두 칸 모두 리포트의 특정 섹션을 켜고 끈다. 비면 그 섹션이 사라지므로,
          "선택"이라고만 쓰고 무엇이 없어지는지 말하지 않으면 아무도 안 넣는다. */}
      <fieldset className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <legend className="px-1.5 text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">
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

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error.message}
        </p>
      )}

      <div className="space-y-3">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? '신청 중…' : '무료 진단 신청하기'}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          확인 메일을 보내드립니다. 확인 후 <strong className="font-medium">영업일 1일 이내</strong>에
          리포트를 메일로 보내드립니다. 카드 정보는 받지 않습니다.
        </p>
      </div>
    </form>
  )
}
