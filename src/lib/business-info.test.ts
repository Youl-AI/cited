import { describe, expect, it } from 'vitest'
import { BUSINESS_INFO, businessNumberDigits, isValidBusinessNumber } from '@/lib/business-info'

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
 * 사업자 등록이 끝나서 **이미 채워진** 항목.
 *
 * ★ 채워진 값은 그 즉시 상시 검증으로 옮긴다. skip 묶음에 남겨 두면 누군가
 *   리팩터링하다 빈 문자열로 되돌려도 아무도 모른다 — 채워지지 않은 것과
 *   채웠다가 잃은 것은 다른 사고이고, 후자가 더 조용하다.
 *
 * 2026-07-30 사업자 등록 완료 (372-31-02135).
 */
const FILLED_AFTER_REGISTRATION = [
  'companyName',
  'representative',
  'businessNumber',
  'address',
] as const

/**
 * 전자상거래법 제10조 제1항(통신판매업자의 신원정보 표시).
 *
 * 이쪽 의무는 **판매를 시작하는 시점**에 발생한다. 무료 서비스만 제공하는
 * 동안은 신고 의무 자체가 없으므로 skip을 유지한다.
 *
 * 남은 것은 `mailOrderNumber` 하나다. 사업자 등록과 **별개 절차**로, 등록증이
 * 나왔다고 생기지 않는다 — 관할 시·군·구청에 따로 신고해야 한다.
 *
 * TODO(phase-4): 통신판매업 신고가 끝나면 아래 describe.skip을 describe로
 * 되돌린다. `business-info.ts` 상단과 4단계 계획서 "착수 전 확인"에도 같은
 * 마커가 있다.
 */
const REQUIRED_BEFORE_PAID_LAUNCH = ['mailOrderNumber'] as const

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

describe('BUSINESS_INFO — 사업자 등록으로 채워진 항목', () => {
  it.each(FILLED_AFTER_REGISTRATION)('%s가 비어 있지 않다', (key) => {
    expect(BUSINESS_INFO[key], `${key}가 비어 있습니다`).not.toBe('')
  })

  it('사업자등록번호가 000-00-00000 형식이다', () => {
    expect(BUSINESS_INFO.businessNumber).toMatch(/^\d{3}-\d{2}-\d{5}$/)
  })

  it('사업자등록번호의 검증자리가 맞다', () => {
    // 자리수만 세면 오타를 못 잡는다. 틀린 번호는 푸터·약관·결제창에 그대로
    // 나가고, 고객에게는 "조회했는데 없는 사업자"로 보인다.
    expect(
      isValidBusinessNumber(BUSINESS_INFO.businessNumber),
      `검증자리가 맞지 않습니다: ${BUSINESS_INFO.businessNumber}`,
    ).toBe(true)
  })

  it('하이픈 없는 10자리를 함께 제공한다 (국세청 API·토스페이먼츠용)', () => {
    expect(businessNumberDigits).toBe('3723102135')
  })

  it('대표자명과 개인정보 보호책임자가 같다 (1인 개인사업자)', () => {
    // 다르게 적히면 약관의 '대표'와 처리방침의 '보호책임자'가 다른 사람처럼
    // 보인다. 법인화하면 이 테스트를 지우고 두 값을 갈라야 한다.
    expect(BUSINESS_INFO.representative).toBe(BUSINESS_INFO.privacyOfficer)
  })
})

describe('isValidBusinessNumber', () => {
  it('유효한 번호를 통과시킨다', () => {
    expect(isValidBusinessNumber('372-31-02135')).toBe(true)
    // 하이픈이 없어도, 공백이 섞여도 같은 결과여야 한다.
    expect(isValidBusinessNumber('3723102135')).toBe(true)
    expect(isValidBusinessNumber(' 372 31 02135 ')).toBe(true)
  })

  it('검증자리가 틀린 번호를 거부한다', () => {
    // 마지막 자리만 바꾼 9개 — 하나라도 통과하면 검증이 작동하지 않는 것이다.
    for (const last of [0, 1, 2, 3, 4, 6, 7, 8, 9]) {
      expect(isValidBusinessNumber(`372-31-0213${last}`), `0213${last}`).toBe(false)
    }
  })

  it('자리수가 다르면 거부한다', () => {
    for (const bad of ['', '372', '3723102', '37231021350']) {
      expect(isValidBusinessNumber(bad), bad).toBe(false)
    }
  })

  it('전부 0인 자리표시자를 거부한다', () => {
    // ★ 알고리즘만으로는 통과한다(합 0 → 검증자리 0). JSDoc의
    //   `000-00-00000`을 그대로 붙여넣는 사고를 막는 유일한 방어선이다.
    expect(isValidBusinessNumber('000-00-00000')).toBe(false)
  })

  it('숫자가 아닌 값을 거부한다', () => {
    expect(isValidBusinessNumber('abc-de-fghij')).toBe(false)
    expect(isValidBusinessNumber('372-31-0213X')).toBe(false)
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
