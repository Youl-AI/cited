import { describe, expect, it } from 'vitest'
import { BUSINESS_INFO } from '@/lib/business-info'

// ★ 두 묶음은 근거 법률이 다르고, 따라서 **의무가 생기는 시점이 다르다.**
// 한 묶음으로 묶어 두면 늦게 시작하는 쪽(전자상거래법)에 맞춰 통째로 skip하게
// 되고, 그러면 이미 의무가 발생한 개인정보보호법 항목까지 검증에서 빠진다.
// 실제로 그렇게 묶여 있었다.

/**
 * 개인정보보호법 제30조 제1항 제5호 · 시행령 제31조 제1항.
 *
 * 개인정보 보호책임자의 성명·직책·연락처는 처리방침의 **법정 필수 기재사항**이다.
 * 이 의무는 사업자 등록이 아니라 **개인정보를 수집하는 시점**에 발생한다.
 * 회원가입이 열려 있는 한 비어 있으면 안 되므로 skip하지 않는다.
 * (직책은 처리방침 §11에 '대표'로 고정 서술되어 있어 상수가 아니다.)
 */
const REQUIRED_FROM_FIRST_COLLECTION = ['privacyOfficer', 'phone'] as const

/**
 * 전자상거래법 제10조 제1항(통신판매업자의 신원정보 표시).
 *
 * 이쪽 의무는 **판매를 시작하는 시점**에 발생한다. 무료 서비스만 제공하는
 * 동안은 신고 의무 자체가 없으므로 사업자 등록 전까지 skip한다.
 *
 * TODO(phase-4): 사업자 등록·통신판매업 신고가 끝나면 아래 describe.skip을
 * describe로 되돌린다. `business-info.ts` 상단과 4단계 계획서 "착수 전 확인"에도
 * 같은 마커가 있다.
 */
const REQUIRED_BEFORE_PAID_LAUNCH = [
  'companyName',
  'representative',
  'businessNumber',
  'mailOrderNumber',
  'address',
] as const

describe('BUSINESS_INFO — 개인정보 수집 시점부터 필수', () => {
  it.each(REQUIRED_FROM_FIRST_COLLECTION)(
    '%s는 채워져 있어야 한다 (개인정보보호법 제30조 — 처리방침 법정 기재사항)',
    (key) => {
      expect(BUSINESS_INFO[key], `${key}가 비어 있습니다`).not.toBe('')
    },
  )

  it('전화번호가 연락 가능한 형태다', () => {
    // 시행령이 요구하는 것은 표기 형식이 아니라 도달 가능성이다. 형식을
    // 과하게 검사하면 나중에 050 안심번호·070으로 바꿀 때 헛되이 깨진다.
    // 자리수만 확인해서 자리표시자가 남는 것을 막는다.
    const digits = BUSINESS_INFO.phone.replace(/\D/g, '')
    expect(digits.length, `전화번호 자리수가 이상합니다: ${BUSINESS_INFO.phone}`).toBeGreaterThanOrEqual(9)
  })
})

describe.skip('BUSINESS_INFO — 유료 오픈 전 필수', () => {
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
