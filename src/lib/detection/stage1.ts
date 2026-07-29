import { normalizeKo, normalizeWithMap } from './normalize'
import type { BrandProfile, Stage1Hit } from './types'

export interface Stage1Options {
  /**
   * 이 답변에 다른 브랜드도 등장하는가.
   * true면 언급 순서(position) 판정이 필요하므로 2차를 거친다.
   */
  otherBrandsPresent?: boolean
}

/** 이보다 짧은 별칭은 일반어와 충돌할 확률이 높아 2차를 강제한다. */
const SHORT_ALIAS_THRESHOLD = 2

const WORDISH = /[\p{L}\p{N}]/u
/** 라틴 문자와 숫자. 한글은 뒤에 조사가 붙는 게 정상이므로 제외한다. */
const LATIN_OR_DIGIT = /[a-z0-9]/

/**
 * 1차 판정 — 문자열/별칭 매칭. recall 우선(놓치지 않기).
 *
 * 설계 ③: "1차를 정밀하게 만들려는 유혹을 참아야 한다. 1차의 임무는
 * '여기 뭔가 있을 수 있다'까지고 판단은 2차가 한다."
 *
 * 전체 답변의 70~80%가 여기서 탈락하고, 그만큼 LLM 호출이 줄어든다.
 * 순수 함수다 — 외부 I/O 없음.
 *
 * ★ 이 함수가 하는 유일한 "정밀 판단"은 **버리는 게 아니라 2차로 넘기는**
 *   결정이다(`needsStage2`). recall은 절대 깎지 않는다 — 1차에서 놓친 것은
 *   영원히 복구되지 않지만, 2차로 넘긴 것은 비용만 더 들고 결과는 옳다.
 */
export function stage1Match(
  text: string,
  brand: BrandProfile,
  opts: Stage1Options = {},
): Stage1Hit[] {
  if (!text) return []

  const candidates = dedupe([brand.canonical, ...brand.aliases])
  if (candidates.length === 0) return []

  const { normalized, map } = normalizeWithMap(text)
  if (!normalized) return []

  let best: { alias: string; index: number; needleLength: number; boundarySafe: boolean } | null =
    null

  for (const alias of candidates) {
    const needle = normalizeKo(alias)
    if (!needle) continue
    const at = normalized.indexOf(needle)
    if (at === -1) continue

    const startOrig = map[at]
    const endOrig = map[at + needle.length - 1]
    if (startOrig === undefined || endOrig === undefined) continue

    const hit = {
      alias,
      index: startOrig,
      needleLength: needle.length,
      boundarySafe: isBoundarySafe(text, startOrig, endOrig),
    }

    // 더 앞선 위치가 이긴다. 위치가 같으면 **더 긴 별칭**이 이긴다 —
    // '미미'와 '미미화장품'이 같은 자리에서 걸리면 후자가 훨씬 확실한 근거이고,
    // 짧은 쪽을 고르면 아래에서 불필요하게 2차 비용을 문다.
    if (
      best === null ||
      hit.index < best.index ||
      (hit.index === best.index && hit.needleLength > best.needleLength)
    ) {
      best = hit
    }
  }

  if (best === null) return []

  return [
    {
      alias: best.alias,
      index: best.index,
      needsStage2:
        brand.ambiguous ||
        // ★ 계획서는 후보 **전체**의 최단 길이를 봤다. 그러면 짧은 별칭이 하나만
        //   있어도 '무신사'로 정확히 맞은 건까지 2차로 끌려가 비용만 는다.
        //   실제로 맞은 별칭의 길이를 봐야 한다.
        best.needleLength <= SHORT_ALIAS_THRESHOLD ||
        !best.boundarySafe ||
        opts.otherBrandsPresent === true,
    },
  ]
}

/**
 * 매칭이 단어 경계에 놓였는가. 아니면 2차로 넘긴다(버리지 않는다).
 *
 * ★ 이 검사가 없으면 **영문 브랜드명이 다른 단어 안에 박힌 오탐이 검증 없이
 *   통과한다.** 우리 브랜드가 정확히 그 사례다 — 'cited'는 'excited' 안에 있다.
 *   무신사·오늘의집처럼 영문 표기를 함께 쓰는 한국 브랜드가 흔하므로 실제로
 *   자주 터질 문제다.
 *
 * 정규화된 문자열이 아니라 **원본**을 봐야 한다. 정규화는 공백을 전부 지우기
 * 때문에 'MUSINSA is'조차 뒤가 'i'로 이어져 모든 영문 매칭이 경계를 잃는다.
 *
 * 앞뒤 규칙이 다르다:
 *   - **앞**: 글자나 숫자가 붙어 있으면 합성어 안이다. 한글도 마찬가지다
 *     ('무신사스탠다드' 안의 '스탠다드'는 확인이 필요하다).
 *   - **뒤**: 라틴 문자·숫자만 막는다. 한글이 뒤에 붙는 건 조사이고
 *     ('무신사가', 'MUSINSA는') 한국어에서는 그게 정상이다. 여기서 한글을
 *     막으면 사실상 모든 한국어 매칭이 2차로 넘어가 원가 모델이 무너진다.
 */
function isBoundarySafe(text: string, startOrig: number, endOrig: number): boolean {
  const before = startOrig > 0 ? text[startOrig - 1] : undefined
  if (before !== undefined && WORDISH.test(before.normalize('NFKC'))) return false

  const after = text[endOrig + 1]
  if (after !== undefined && LATIN_OR_DIGIT.test(after.normalize('NFKC').toLowerCase())) {
    // 별칭이 숫자로 끝나면(뉴발란스 880) 뒤 숫자는 다른 모델명일 수 있다 —
    // 어느 쪽이든 확인이 필요하니 똑같이 2차로 넘긴다.
    return false
  }

  return true
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))]
}
