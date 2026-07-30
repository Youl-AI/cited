import type { BrandProfile } from '@/lib/detection/types'

/**
 * 브랜드 행(`brands` 테이블) → 판정용 프로파일.
 *
 * ★ 이름이 `toBrandProfiles`가 아니다. 3단계 Task 6-2의
 *   `aliases.ts`에 `toBrandProfiles(suggestions)`가 따로 있다 — 그쪽은
 *   **생성된 별칭**을 변환하고 이쪽은 **저장된 브랜드 행**을 변환한다.
 *   같은 이름을 쓰면 import 한 줄 차이로 조용히 엉뚱한 것이 불린다.
 */

export interface CompetitorRow {
  name: string
  aliases?: readonly string[]
  ambiguous?: boolean
}

export interface BrandRow {
  name: string
  aliases?: readonly string[]
  ambiguous?: boolean
  competitors?: readonly CompetitorRow[]
}

export function brandToProfiles(brand: BrandRow): {
  self: BrandProfile
  competitors: BrandProfile[]
} {
  const selfName = brand.name.trim()

  const competitors: BrandProfile[] = []
  for (const c of brand.competitors ?? []) {
    const canonical = c.name.trim()
    // 빈 이름은 1차 매칭에서 모든 답변에 걸린다.
    if (canonical.length === 0) continue
    // ★ 자기 자신이 경쟁사로 들어오면 Share of Voice 분모에 자기가 두 번
    //   들어가 점유율이 반토막난다.
    if (canonical === selfName) continue
    competitors.push({
      canonical,
      aliases: [...(c.aliases ?? [])],
      // ★ `ambiguous`를 경쟁사에 강제하지 않는다.
      //
      //   초안은 "경쟁사는 별칭을 고객이 편집하지 않으므로 항상 true로
      //   보수적으로"였다. 그 논리는 `ambiguous`가 2차 판정을 **게이트할 때**
      //   성립했다. 지금은 1차에 걸리면 예외 없이 2차를 거치므로 이 값은
      //   판정 프롬프트에 주는 힌트일 뿐이고, 경쟁사에만 보수적 힌트를 주면
      //   경쟁사 언급이 덜 잡혀 **우리 SoV가 부풀려진다.**
      //   숫자가 좋아 보이는 방향의 오류는 아무도 의심하지 않는다.
      ambiguous: c.ambiguous ?? false,
    })
  }

  return {
    self: {
      canonical: selfName,
      // 복사한다 — 프로파일이 브랜드 행과 참조를 공유하면 한쪽 수정이
      // 다른 쪽에 새어 들어간다.
      aliases: [...(brand.aliases ?? [])],
      ambiguous: brand.ambiguous ?? false,
    },
    competitors,
  }
}
