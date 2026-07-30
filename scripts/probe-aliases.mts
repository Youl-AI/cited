/**
 * 별칭 생성을 **실제 모델**로 확인한다.
 *
 *   pnpm probe:aliases
 *
 * 단위 테스트가 검증하는 것은 `sanitizeAliases`와 조립뿐이다. 정작 중요한
 * 것은 모델이 `아식스` → `ASICS`를 실제로 돌려주는가, 그리고 **모르는 브랜드에
 * 음차를 지어내지 않는가**다. 그건 실제로 불러봐야 안다.
 *
 * ★ 돈이 든다 (진단 1건당 1회 호출이므로 아래 5회로 원가 감각을 잡는다).
 *
 * 통과 기준은 아래 EXPECT 표에 코드로 박아 뒀다. 자동 판정하되, 최종 판단은
 * 눈으로 한다 — 표에 없는 브랜드의 결과도 함께 출력한다.
 */
import { createAliasGenerator } from '@/lib/audit/aliases'
import { normalizeKo } from '@/lib/detection/normalize'
import { estimateJudgeCostKrw } from '@/lib/engines/pricing'

const CASES: [string, string[]][] = [
  ['패션', ['무신사', '29CM', '지그재그', '에이블리']],
  ['스포츠', ['아식스', '뉴발란스', '호카']],
  ['중고거래', ['당근', '크림']],
  ['화장품', ['라운드랩', '토리든', '아누아']],
  // ★ 2026-07-30 실측에서 ChatGPT가 공식 로마자로 쓴 브랜드들. 기계적 음차와
  //   공식 표기가 크게 다르므로, 모델이 지어내는지 아는지가 여기서 갈린다.
  ['화장품', ['편강율', '이즈앤트리']],
]

/**
 * 반드시 나와야 하는 영문 표기.
 *
 * ★ 문자열이 아니라 **매칭 가능성**을 본다. 1차 매칭은 `normalizeKo`로 공백과
 *   구두점을 지운 뒤 부분 문자열을 찾으므로, `Roundlab`은 답변의 `Round Lab`과
 *   실제로 매칭된다. 원문 비교로 판정하면 잘 동작하는 별칭을 실패로 세고
 *   프롬프트를 헛되게 고치게 된다(첫 실행에서 실제로 그랬다).
 *   반대로 `TORIDEN` vs `Torriden`은 정규화해도 다르다 — 그건 진짜 실패다.
 */
const EXPECT_ALIAS: Record<string, string> = {
  아식스: 'asics',
  뉴발란스: 'new balance',
  호카: 'hoka',
  무신사: 'musinsa',
  라운드랩: 'round lab',
  토리든: 'torriden',
  아누아: 'anua',
  편강율: 'pyunkang yul',
  이즈앤트리: 'isntree',
}

/** ambiguous 기대값 — 일반어와 겹치는 브랜드. */
const EXPECT_AMBIGUOUS: Record<string, boolean> = {
  당근: true,
  크림: true,
  무신사: false,
  '29CM': false,
  아식스: false,
}

/** 절대 별칭에 들어오면 안 되는 값 (카테고리 일반어 + 형제 브랜드). */
const FORBIDDEN = new Set(
  [
    '패션', '쇼핑몰', '화장품', '스킨케어', '스포츠', '중고거래', '추천', '브랜드',
    ...CASES.flatMap(([, brands]) => brands),
  ].map((s) => s.toLowerCase()),
)

let tokensIn = 0
let tokensOut = 0
let calls = 0
let failures = 0
const check = (pass: boolean, label: string) => {
  console.log(`  ${pass ? 'OK  ' : 'FAIL'} ${label}`)
  if (!pass) failures += 1
}

const generate = createAliasGenerator({
  onUsage: (u) => {
    tokensIn += u.tokensIn
    tokensOut += u.tokensOut
    calls += 1
  },
  onError: (e) => {
    console.error('생성 실패:', e)
    failures += 1
  },
})

for (const [category, brands] of CASES) {
  const started = Date.now()
  const out = await generate(brands, category)
  console.log(`\n[${category}] ${Date.now() - started}ms`)

  for (const b of out) {
    const flag = b.ambiguous ? ' (ambiguous)' : ''
    console.log(`  ${b.canonical}${flag}: ${b.aliases.join(', ') || '(없음)'}`)
  }

  for (const b of out) {
    const lower = b.aliases.map((a) => a.toLowerCase())
    // 1차 매칭과 **같은 정규화**로 비교한다. 그것이 "이 별칭이 실제로 걸리는가"다.
    const matchable = b.aliases.map(normalizeKo)

    const expected = EXPECT_ALIAS[b.canonical]
    if (expected !== undefined) {
      const needle = normalizeKo(expected)
      check(
        matchable.some((a) => a.includes(needle)),
        `${b.canonical} → "${expected}" (정규화: ${needle})`,
      )
    }

    const expectedAmbiguous = EXPECT_AMBIGUOUS[b.canonical]
    if (expectedAmbiguous !== undefined) {
      check(b.ambiguous === expectedAmbiguous, `${b.canonical} ambiguous=${expectedAmbiguous}`)
    }

    // 형제 브랜드·카테고리 오염. sanitizeAliases가 막아야 하므로 여기서
    // 걸리면 검증 함수에 구멍이 있다는 뜻이다.
    const polluted = lower.filter((a) => FORBIDDEN.has(a))
    check(polluted.length === 0, `${b.canonical} 오염 없음${polluted.length ? ` — ${polluted.join(', ')}` : ''}`)

    // 별칭이 하나도 없으면 그 브랜드는 ChatGPT에서 구조적으로 0%가 된다.
    // 실패로 세지는 않는다 — 모델이 모르면 비워 두는 것이 **의도한 동작**이고,
    // 그 경우의 복구 경로는 고객의 별칭 편집(4단계)이다. 다만 반드시 보여준다.
    //
    // ★ 이름이 이미 로마자면(`29CM`) 별칭 0개가 정상이다. ChatGPT가 그 표기를
    //   그대로 쓰고 1차 매칭이 canonical을 직접 본다. 여기서 경고하면 정상을
    //   문제로 읽게 된다.
    if (b.aliases.length === 0 && /\p{Script=Hangul}/u.test(b.canonical)) {
      console.log(`  주의  ${b.canonical}: 별칭 0개 — 이 브랜드는 ChatGPT에서 0%로 측정된다`)
    }
  }
}

const krw = estimateJudgeCostKrw(tokensIn, tokensOut)
console.log(`\n호출 ${calls}회 · 원가 ${krw}원 (in ${tokensIn} / out ${tokensOut})`)
console.log(`진단 1건당 1회이므로 건당 약 ${calls > 0 ? (krw / calls).toFixed(2) : '0'}원`)
console.log(failures === 0 ? '\n통과 기준 전부 충족' : `\n실패 ${failures}건 — 프롬프트를 고치고 다시 돌린다`)
process.exit(failures === 0 ? 0 : 1)
