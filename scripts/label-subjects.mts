import type { BrandProfile } from '@/lib/detection/types'
import { generateAuditQueries } from '@/lib/audit/queries'

/**
 * 골드 라벨 수집 대상.
 *
 * ★ 한 답변에 브랜드 여러 개를 물어 라벨을 뽑는다. 계획의 "답변 1개 = 라벨 1건"
 *   구조는 답변 200개를 수집해야 해서 원가도 라벨링 시간도 5배다. 같은 답변에
 *   경쟁사 5개를 물으면 답변 40개로 라벨 200건이 나온다 — 그리고 이쪽이 실제
 *   제품 동작에 더 가깝다. 제품은 항상 자사 1 + 경쟁사 N을 함께 판정한다.
 *
 * 세트 구성의 기준은 **판정기가 틀릴 만한 곳을 고르는 것**이다:
 *   - fashion  : 명백한 한글 브랜드 + 영문 별칭 (기준선)
 *   - running  : 영문/한글 표기가 섞이고 제품명이 브랜드처럼 쓰인다
 *   - resale   : 당근·크림 — 일반명사와 완전히 겹친다 (동음이의어의 본체)
 *   - fintech  : 토스 — "토스하다" 동사와 겹친다
 *   - beauty   : 소규모 브랜드. 언급이 드물어 **부정 라벨**을 공급한다
 *
 * 질의에는 브랜드명을 넣지 않는다. 넣으면 "물어봤으니 나온다"가 되어
 * 실제 언급률과 다른 것을 재게 된다 — 무료 진단 질의 생성과 같은 규칙이다.
 */
export interface SubjectSet {
  id: string
  label: string
  brands: BrandProfile[]
  queries: string[]
}

export const SUBJECT_SETS: SubjectSet[] = [
  // ── 새 업종 템플릿 검증 세트 (2026-07-31 골드 확장) ──────────────────
  //
  // ★ 질의를 손으로 쓰지 않고 `generateAuditQueries`에서 뽑는다 — 제품이
  //   실제로 던지는 질의 그대로여야 "새 템플릿에서 판정기가 맞는가"를 잰다.
  //   템플릿 질의는 배포 후 불변이므로(query-templates.ts 규칙) 후보 id도
  //   안정적이다.
  //
  // ★ 새 세트를 배열 **맨 앞**에 둔다. label-collect의 수집 순서가 배열
  //   순서라서, 기존 40건이 없는 엔진(chatgpt)에 `--limit 6`을 걸면
  //   정확히 이 6개 질의만 수집된다.
  {
    id: 'pilates-suwon',
    label: '필라테스·요가 (수원, 지역형 템플릿)',
    // 지역형 검증의 핵심: 동네 상호는 전국 브랜드보다 언급이 희귀하고
    // 표기가 흔들린다. 브랜드는 **수집된 실제 답변이 언급한 실존 업체**에서
    // 골랐다 — 우리가 지어낸 상호를 물으면 부정 라벨만 쌓인다.
    // 셋 다 웹에서 실존을 확인했다(2026-07-31): 리본요가 rebornyoga.co.kr,
    // 클로바필라테스 수원권선점, 더센터오브필라테스 수원인계점(헬스장 정보
    // 사이트 등재). 답변에 등장하지만 실존을 못 굳힌 상호(예: '필라테스
    // 루틴')는 뺐다.
    brands: [
      // gemini 답변이 '리본요가 수원점'으로 언급. 각 브랜드가 6개 답변 중
      // 1개에만 나온다 — 지역형 특성상 부정 라벨 공급원을 겸한다.
      { canonical: '리본요가', aliases: ['리본요가 수원점', 'Reborn Yoga'], ambiguous: false },
      { canonical: '클로바필라테스', aliases: ['클로바 필라테스'], ambiguous: false },
      {
        canonical: '더센터오브필라테스',
        aliases: ['더센터오브 필라테스'],
        ambiguous: false,
      },
    ],
    queries: generateAuditQueries('필라테스·요가', '(브랜드 없음)', '수원'),
  },
  {
    id: 'finance',
    label: '금융 (전국형 템플릿)',
    brands: [
      // 기존 fintech 세트와 겹치는 토스·카카오뱅크는 그대로 둔다 —
      // 같은 브랜드라도 **질의가 새 템플릿**이라 답변 분포가 다르다.
      { canonical: '토스', aliases: ['toss', '토스뱅크', '토스증권'], ambiguous: true },
      { canonical: '카카오뱅크', aliases: ['카뱅', 'kakaobank'], ambiguous: false },
      // 카카오뱅크/카카오페이 — 접두어가 같아 판정기가 헷갈릴 만한 쌍.
      { canonical: '카카오페이', aliases: ['kakaopay', '카카오페이증권'], ambiguous: false },
      { canonical: '뱅크샐러드', aliases: ['banksalad'], ambiguous: false },
      { canonical: '케이뱅크', aliases: ['K뱅크', 'kbank'], ambiguous: false },
    ],
    queries: generateAuditQueries('금융', '(브랜드 없음)'),
  },
  {
    id: 'fashion',
    label: '온라인 패션 플랫폼',
    brands: [
      {
        canonical: '무신사',
        aliases: ['MUSINSA', '무신사스탠다드', '무탠다드'],
        ambiguous: false,
      },
      { canonical: '29CM', aliases: ['29cm', '이십구센티미터'], ambiguous: false },
      { canonical: '지그재그', aliases: ['ZIGZAG'], ambiguous: false },
      { canonical: '에이블리', aliases: ['ABLY'], ambiguous: false },
      { canonical: 'W컨셉', aliases: ['W CONCEPT', '더블유컨셉'], ambiguous: false },
    ],
    queries: [
      '온라인 패션 쇼핑몰 추천해줘',
      '20대 남자 옷 어디서 사?',
      '가성비 좋은 무지 티셔츠 브랜드 알려줘',
      '한국 패션 플랫폼 비교해줘',
      '여성 데일리룩 쇼핑몰 추천',
      '남자 맨투맨 어디서 사는 게 좋아?',
      '온라인 쇼핑몰 중에 반품 쉬운 곳이 어디야?',
      '기본템 잘 만드는 국내 브랜드 알려줘',
    ],
  },
  {
    id: 'running',
    label: '러닝화',
    brands: [
      { canonical: '아식스', aliases: ['ASICS', '젤카야노', '노바블라스트'], ambiguous: false },
      { canonical: '나이키', aliases: ['NIKE', '페가수스'], ambiguous: false },
      { canonical: '뉴발란스', aliases: ['New Balance', '뉴발', '프레시폼'], ambiguous: false },
      { canonical: '호카', aliases: ['HOKA', '클리프톤'], ambiguous: false },
      { canonical: '아디다스', aliases: ['adidas', '아디제로'], ambiguous: false },
    ],
    queries: [
      '30대 남자 러닝화 추천해줘',
      '발볼 넓은 사람 운동화 추천해줘',
      '초보 러너 신발 뭐가 좋아?',
      '쿠셔닝 좋은 러닝화 알려줘',
      '마라톤 대회용 신발 추천',
      '평발인데 러닝화 뭐 신어야 해?',
      '러닝화 브랜드별 특징 비교해줘',
      '10만원대 가성비 러닝화 알려줘',
    ],
  },
  {
    id: 'resale',
    label: '중고거래 · 리셀',
    brands: [
      // ★ 동음이의어의 본체. "당근을 썰어"와 "당근에서 샀어"를 갈라야 한다.
      { canonical: '당근', aliases: ['당근마켓', '캐럿'], ambiguous: true },
      { canonical: '크림', aliases: ['KREAM'], ambiguous: true },
      { canonical: '번개장터', aliases: ['번개', 'BUNJANG'], ambiguous: false },
      { canonical: '중고나라', aliases: [], ambiguous: false },
      { canonical: '헬로마켓', aliases: ['HelloMarket'], ambiguous: false },
    ],
    queries: [
      '중고거래 앱 추천해줘',
      '동네 사람이랑 직거래하는 앱 뭐 있어?',
      '한정판 운동화 리셀 어디서 해?',
      '중고 가전 안전하게 사는 방법 알려줘',
      '중고거래 사기 안 당하려면 어느 플랫폼 써야 해?',
      '안 쓰는 물건 파는 앱 추천해줘',
      '명품 중고 거래 플랫폼 알려줘',
      '중고 자전거 어디서 사?',
    ],
  },
  {
    id: 'fintech',
    label: '금융 앱',
    brands: [
      // "공을 토스했다" — 동사와 겹친다.
      { canonical: '토스', aliases: ['toss', '토스뱅크'], ambiguous: true },
      { canonical: '카카오뱅크', aliases: ['카뱅', 'kakaobank'], ambiguous: false },
      { canonical: '케이뱅크', aliases: ['K뱅크', 'kbank'], ambiguous: false },
      { canonical: '뱅크샐러드', aliases: ['banksalad'], ambiguous: false },
      { canonical: '신한은행', aliases: ['신한쏠', '신한 SOL'], ambiguous: false },
    ],
    queries: [
      '간편송금 앱 추천해줘',
      '인터넷은행 어디가 금리 높아?',
      '가계부 앱 뭐가 편해?',
      '신용점수 올리는 방법 알려줘',
      '20대 첫 통장 어디서 만들어?',
      '모바일 뱅킹 앱 비교해줘',
      '파킹통장 금리 높은 곳 알려줘',
      '주식 계좌 개설 어디서 해?',
    ],
  },
  {
    id: 'beauty',
    label: '스킨케어 (소규모 브랜드)',
    brands: [
      { canonical: '라운드랩', aliases: ['ROUND LAB', '독도토너'], ambiguous: false },
      { canonical: '토리든', aliases: ['TORRIDEN', '다이브인'], ambiguous: false },
      { canonical: '아누아', aliases: ['ANUA'], ambiguous: false },
      { canonical: '닥터지', aliases: ['Dr.G', '닥터쥐'], ambiguous: false },
      { canonical: '이니스프리', aliases: ['innisfree'], ambiguous: false },
    ],
    queries: [
      '민감성 피부 스킨케어 추천해줘',
      '여드름 피부에 좋은 클렌저 뭐 써?',
      '가성비 좋은 국산 화장품 브랜드 알려줘',
      '수분크림 추천해줘',
      '저자극 선크림 알려줘',
      '모공 관리 제품 추천해줘',
      '앰플 뭐가 좋아?',
      '20대 초반 기초화장품 추천해줘',
    ],
  },
]

/** 수집하면 나오는 답변 수 (= 실제 API 호출 수). */
export const TOTAL_ANSWERS = SUBJECT_SETS.reduce((n, s) => n + s.queries.length, 0)

/** 라벨링하면 나오는 라벨 수. */
export const TOTAL_LABELS = SUBJECT_SETS.reduce(
  (n, s) => n + s.queries.length * s.brands.length,
  0,
)
