/**
 * 전자상거래법상 통신판매업자 표시 의무 항목 + 서비스 연락처.
 *
 * 사업자 등록이 끝나지 않은 항목은 빈 문자열로 둔다(`null`이 아니다 —
 * `business-info.test.ts`의 `.not.toBe('')` 검증이 빈 문자열만 실패로
 * 잡아낸다. `null`로 두면 `null !== ''`가 항상 참이라 테스트가 절대
 * 실패하지 않고, 그러면 "채우는 걸 잊었는지"를 코드가 감지하지 못한다).
 *
 * 이 값은 푸터(`site-footer.tsx`)와 이용약관·개인정보처리방침, 그리고
 * 4단계 결제 화면(토스페이먼츠 결제창에 표시할 사업자 정보)이 그대로 쓴다.
 * 사업자 등록이 끝나면 여기만 채우면 된다 — 소비처를 따로 고칠 필요가 없다.
 *
 * TODO(phase-4): 사업자 등록·통신판매업 신고가 끝나면 아래 빈 문자열 항목을
 * 채우고, `business-info.test.ts`의 `describe.skip('BUSINESS_INFO', ...)`을
 * `describe('BUSINESS_INFO', ...)`로 되돌려 테스트가 다시 검증하게 한다.
 * (4단계 계획서 `docs/superpowers/plans/2026-07-28-cited-phase-4-billing-and-onboarding.md`의
 * "착수 전 확인" 체크리스트에도 같은 항목이 있다 — 여기 마커는 grep으로 이 파일을
 * 먼저 찾아오는 사람을 위한 것이다.)
 */
export const BUSINESS_INFO = {
  serviceName: 'Cited',
  /** 상호 — 사업자 등록 후 채운다 */
  companyName: '',
  /** 대표자명 — 사업자 등록 후 채운다 */
  representative: '',
  /** 사업자등록번호 000-00-00000 — 사업자 등록 후 채운다 */
  businessNumber: '',
  /** 통신판매업 신고번호 — 무료 서비스만 제공하는 동안은 신고 의무가 없다.
   *  4단계(유료 결제 오픈) 전에 신고하고 채운다. */
  mailOrderNumber: '',
  /** 사업장 주소 — 사업자 등록 후 채운다 */
  address: '',
  /** 실제 메일함은 아직 없다 — 개설 전까지도 문서·발신 표기용으로 이 주소를 쓴다 */
  email: 'contact@cited.co.kr',
  /** 대표 연락처(전화) — 사업자 등록 후 채운다. 개인정보 보호책임자 연락처로도
   *  쓰인다(개인정보보호법 시행령 제31조 제1항). 빈 문자열이면 푸터와
   *  개인정보처리방침 양쪽에서 자동으로 숨겨지고, 채우면 코드 수정 없이 나타난다. */
  phone: '',
  /** 개인정보 보호책임자 — 사업자 등록 후 지정한다 */
  privacyOfficer: '',
  hostingProvider: 'Vercel Inc.',
} as const

export type BusinessInfo = typeof BUSINESS_INFO
