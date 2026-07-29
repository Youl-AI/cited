import { describe, expect, it } from 'vitest'
import { BUSINESS_INFO } from '@/lib/business-info'

const REQUIRED_BEFORE_PAID_LAUNCH = [
  'companyName',
  'representative',
  'businessNumber',
  'mailOrderNumber',
  'address',
  'privacyOfficer',
] as const

// 사업자 등록 완료 전까지 skip. 4단계(결제) 착수 전에 반드시 해제한다.
// TODO(phase-4): describe.skip → describe. business-info.ts 상단에도 같은 마커가 있다.
describe.skip('BUSINESS_INFO', () => {
  it.each(REQUIRED_BEFORE_PAID_LAUNCH)(
    '%s는 유료 오픈 전에 채워져 있어야 한다 (전자상거래법 표시 의무)',
    (key) => {
      expect(BUSINESS_INFO[key], `${key}가 비어 있습니다`).not.toBe('')
    },
  )
})

describe('BUSINESS_INFO.email', () => {
  it('연락 가능한 이메일이 있다', () => {
    expect(BUSINESS_INFO.email).toMatch(/@/)
  })
})
