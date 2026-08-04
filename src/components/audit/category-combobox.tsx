'use client'

import { useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * 업종 자동완성 콤보박스.
 *
 * ## 왜 `<datalist>`를 버렸나
 *
 * datalist의 제안 패널은 브라우저 네이티브 렌더링이라 CSS가 한 줄도 닿지
 * 않는다 — 다크 표면 위에 OS 기본 흰 팝업이 떠서 신청 폼에서 유일하게
 * 사이트 톤을 벗어나는 조각이었다. 이 컴포넌트는 같은 계약(자유 입력 허용 +
 * 제안 목록)을 우리 토큰(popover·border·elevation) 위에서 다시 그린다.
 *
 * ## 지키는 계약
 *
 * - **자유 입력을 막지 않는다.** 목록에 없는 업종이면 그 입력값 그대로
 *   질의를 만든다(`generateAuditQueries`) — datalist 시절과 동일. Enter는
 *   제안을 고르고 있을 때(activeIndex ≥ 0)만 가로채고, 아니면 폼 제출로
 *   그대로 흘려보낸다.
 * - `name`이 인풋에 그대로 붙어 FormData 수집(`form.get('category')`)이
 *   변하지 않고, `<Label htmlFor>` 연결·e2e의 `getByLabel('업종')`도 그대로다.
 * - ARIA는 APG combobox 패턴이다: input이 `role="combobox"` +
 *   `aria-activedescendant`, 패널이 `role="listbox"`. 화살표로 훑고 Enter로
 *   고르고 Escape로 닫는다.
 *
 * ## 마우스 선택이 `onMouseDown` + `onClick` 두 단인 이유
 *
 * 옵션을 누르는 순간 인풋이 blur되고, blur 핸들러가 패널을 닫으면 click이
 * 도착할 DOM이 사라진다. `onMouseDown`에서 `preventDefault()`로 포커스
 * 이동 자체를 막아야 click이 살아서 도착한다.
 */
interface CategoryComboboxProps {
  id: string
  name: string
  suggestions: readonly string[]
  placeholder?: string
  className?: string
  required?: boolean
  maxLength?: number
}

export function CategoryCombobox({
  id,
  name,
  suggestions,
  placeholder,
  className,
  required,
  maxLength,
}: CategoryComboboxProps) {
  const listboxId = useId()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const query = value.trim()
  const filtered = query ? suggestions.filter((s) => s.includes(query)) : suggestions
  const expanded = open && filtered.length > 0
  // 입력이 바뀌어 목록이 줄면 이전 인덱스가 범위를 벗어날 수 있다.
  const active = activeIndex < filtered.length ? activeIndex : -1

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  function select(next: string) {
    setValue(next)
    close()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!expanded) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((active + 1) % filtered.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex(active <= 0 ? filtered.length - 1 : active - 1)
        break
      case 'Enter':
        if (active >= 0) {
          // 제안을 고르는 Enter만 가로챈다 — 아니면 폼 제출이다(자유 입력).
          event.preventDefault()
          select(filtered[active]!)
        }
        break
      case 'Escape':
        close()
        break
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // 포커스가 콤보박스 밖으로 나갈 때만 닫는다.
        if (!event.currentTarget.contains(event.relatedTarget)) close()
      }}
    >
      <Input
        id={id}
        name={name}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {expanded && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="업종 제안"
          // 마케팅 표면의 모서리 규칙: 컨트롤도 각이다(cta-link.tsx).
          // `mt-1.5`는 인풋의 포커스 링(ring-3)을 덮지 않기 위한 간격이다.
          // `max-h-[26rem]`은 현재 전국형 업종 10개(실측 ~400px)가 스크롤 없이
          // 다 들어가는 높이다 — 짧은 목록에 OS 기본 스크롤바가 뜨면 다크
          // 패널에서 그것만 네이티브 조각으로 남는다. 목록이 자라 넘치면
          // 얇은 스크롤바로 받는다.
          className="absolute top-full left-0 z-20 mt-1.5 max-h-[26rem] w-full overflow-auto rounded-none border border-border bg-popover py-1 shadow-elevation-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]"
        >
          {filtered.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                'cursor-pointer px-3.5 py-2 text-sm transition-colors duration-[var(--motion-micro)]',
                index === active
                  ? 'bg-foreground/[0.08] text-foreground'
                  : 'text-muted-foreground',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
