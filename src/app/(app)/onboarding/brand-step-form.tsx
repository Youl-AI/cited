'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KNOWN_CATEGORIES, isRegionalCategory } from '@/lib/audit/queries'
import { createBrandAction } from './actions'

/**
 * 온보딩 1단계 — 브랜드 정보.
 *
 * ★ 무료 진단 폼과 달리 **지역형 업종을 거부하지 않는다.** 업종이 지역형이면
 *   지역 칸이 나타난다(스펙 ②). "지역은 CLI 전용"은 무료 진단 폼의 결정이고,
 *   유료 셀프서비스 온보딩은 지역 없이 성립하지 않는다. 그래서 자동완성 목록도
 *   `request-form.tsx`처럼 거르지 않고 전 업종을 그대로 보여준다.
 *
 * ★ 검증은 서버(`createBrandAction`)가 한다. 여기서 같은 규칙을 복제하면
 *   두 곳이 갈라진다 — `noValidate`로 브라우저 기본 검증도 끈다
 *   (한국어 메시지를 우리가 준다. `request-form.tsx`와 같은 이유).
 */

interface PrefillValues {
  name: string
  category: string
  region: string
  competitors: string[]
  siteUrl: string
}

export function BrandStepForm({
  maxCompetitors,
  prefill,
}: {
  maxCompetitors: number
  prefill: PrefillValues | null
}) {
  const router = useRouter()
  const ids = {
    name: useId(),
    category: useId(),
    region: useId(),
    siteUrl: useId(),
    categoryList: useId(),
  }
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(prefill?.name ?? '')
  const [category, setCategory] = useState(prefill?.category ?? '')
  const [region, setRegion] = useState(prefill?.region ?? '')
  const [siteUrl, setSiteUrl] = useState(prefill?.siteUrl ?? '')
  // ★ 빈 칸을 한도만큼 미리 깔지 않는다 — Business(10개)에서 빈 입력이 열 줄
  //   늘어선다. 한 줄로 시작하고 버튼으로 늘린다(`request-form.tsx`와 같은 패턴).
  const [competitors, setCompetitors] = useState<string[]>(() => {
    const base = (prefill?.competitors ?? []).slice(0, maxCompetitors)
    return base.length > 0 ? base : ['']
  })

  const regional = isRegionalCategory(category)
  const canAddCompetitor = competitors.length < maxCompetitors

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await createBrandAction({ name, category, region, competitors, siteUrl })
      if (result.ok) router.push(`/onboarding/queries?brand=${result.value.brandId}`)
      else setError(result.reason)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor={ids.name}>브랜드명</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={100}
          autoComplete="organization"
          placeholder="무신사"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.category}>업종</Label>
        {/* 자유 입력을 막지 않는다 — 목록에 없는 업종이면 그 입력값으로 질의를
            만든다(`generateAuditQueries`). select로 만들면 목록 밖의 업종을 가진
            고객이 온보딩 자체를 못 끝낸다. */}
        <Input
          id={ids.category}
          value={category}
          maxLength={100}
          list={ids.categoryList}
          placeholder="목록에서 고르거나 직접 입력"
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id={ids.categoryList}>
          {KNOWN_CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {regional && (
        <div className="space-y-2">
          <Label htmlFor={ids.region}>지역</Label>
          <Input
            id={ids.region}
            value={region}
            maxLength={50}
            placeholder="강남"
            onChange={(e) => setRegion(e.target.value)}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            이 업종은 지역이 필요합니다. 지역 없이 물으면 AI가 &ldquo;어디 사세요?&rdquo;부터
            묻습니다.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <span className="text-sm leading-none font-medium">
          경쟁사 <span className="font-normal text-muted-foreground">(최대 {maxCompetitors}개)</span>
        </span>
        <div className="space-y-2">
          {competitors.map((value, i) => (
            <Input
              key={i}
              aria-label={`경쟁사 ${i + 1}`}
              value={value}
              maxLength={100}
              placeholder={i === 0 ? '29CM' : '한 곳씩'}
              onChange={(e) =>
                setCompetitors((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          ))}
        </div>
        {canAddCompetitor && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCompetitors((prev) => [...prev, ''])}
          >
            경쟁사 추가 ({competitors.length}/{maxCompetitors})
          </Button>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          여기 등록한 브랜드만 셀 수 있습니다 — 등록하지 않은 경쟁사는 점유율에서 빠집니다.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={ids.siteUrl}>
          사이트 주소 <span className="font-normal text-muted-foreground">(선택)</span>
        </Label>
        <Input
          id={ids.siteUrl}
          value={siteUrl}
          inputMode="url"
          autoComplete="url"
          placeholder="musinsa.com"
          onChange={(e) => setSiteUrl(e.target.value)}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          알려주시면 AI가 읽는 출처에서 내 사이트가 인용되는지 함께 확인합니다.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '다음 — 질의 만들기'}
      </Button>
    </form>
  )
}
