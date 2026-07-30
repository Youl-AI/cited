import { describe, expect, it } from 'vitest'
import { brandToProfiles } from '@/lib/collection/brand-profile'

const brand = {
  name: '무신사',
  aliases: ['MUSINSA', '무탠다드'],
  ambiguous: false,
  competitors: [
    { name: '29CM', aliases: ['29cm'] },
    { name: '지그재그', aliases: [] },
  ],
}

describe('brandToProfiles', () => {
  it('브랜드를 self 프로파일로 변환한다', () => {
    const { self } = brandToProfiles(brand)
    expect(self.canonical).toBe('무신사')
    expect(self.aliases).toEqual(['MUSINSA', '무탠다드'])
    expect(self.ambiguous).toBe(false)
  })

  it('경쟁사를 프로파일 배열로 변환한다', () => {
    const { competitors } = brandToProfiles(brand)
    expect(competitors).toHaveLength(2)
    expect(competitors[0]?.canonical).toBe('29CM')
    expect(competitors[0]?.aliases).toEqual(['29cm'])
  })

  it('경쟁사에 ambiguous를 강제하지 않는다', () => {
    // ★ 초안은 "경쟁사는 항상 ambiguous=true로 보수적으로"였다. 그 논리는
    //   ambiguous가 2차 판정을 **게이트할 때** 성립했다. 지금은 1차에 걸리면
    //   예외 없이 2차를 거치므로 ambiguous는 판정 프롬프트 힌트일 뿐이고,
    //   경쟁사에만 보수적 힌트를 주면 경쟁사 언급이 덜 잡혀 **우리 Share of
    //   Voice가 부풀려진다.** 숫자가 좋아 보이는 방향의 오류가 가장 위험하다.
    const { competitors } = brandToProfiles(brand)
    expect(competitors.every((c) => c.ambiguous === false)).toBe(true)
  })

  it('경쟁사에 명시된 ambiguous는 존중한다', () => {
    const { competitors } = brandToProfiles({
      ...brand,
      competitors: [{ name: '당근', aliases: ['당근마켓'], ambiguous: true }],
    })
    expect(competitors[0]?.ambiguous).toBe(true)
  })

  it('경쟁사가 없어도 던지지 않는다', () => {
    expect(brandToProfiles({ ...brand, competitors: [] }).competitors).toEqual([])
  })

  it('별칭이 없어도 던지지 않는다', () => {
    const { self, competitors } = brandToProfiles({
      name: '무신사',
      aliases: [],
      ambiguous: false,
      competitors: [{ name: '29CM' }],
    })
    expect(self.aliases).toEqual([])
    expect(competitors[0]?.aliases).toEqual([])
  })

  it('배열을 복사한다 (프로파일이 브랜드 행과 참조를 공유하지 않는다)', () => {
    const aliases = ['MUSINSA']
    const { self } = brandToProfiles({ ...brand, aliases })
    aliases.push('무탠다드')
    expect(self.aliases).toEqual(['MUSINSA'])
  })

  it('자기 자신과 같은 이름의 경쟁사를 걷어낸다', () => {
    // ★ 남겨두면 Share of Voice 분모에 자기가 두 번 들어가 점유율이 반토막난다.
    //   신청 폼(3단계 Task 5)이 걸러내지만, 유료 경로는 온보딩·설정 화면에서
    //   따로 들어오므로 여기서도 막는다.
    const { competitors } = brandToProfiles({
      ...brand,
      competitors: [{ name: '무신사', aliases: [] }, { name: '29CM', aliases: [] }],
    })
    expect(competitors.map((c) => c.canonical)).toEqual(['29CM'])
  })

  it('이름이 빈 경쟁사를 걷어낸다', () => {
    // 빈 canonical은 1차 매칭에서 모든 답변에 걸린다.
    const { competitors } = brandToProfiles({
      ...brand,
      competitors: [{ name: '  ', aliases: [] }, { name: '29CM', aliases: [] }],
    })
    expect(competitors.map((c) => c.canonical)).toEqual(['29CM'])
  })
})
