/**
 * 한국어 브랜드명 매칭을 위한 정규화.
 *
 * 목표는 recall이다. 다음 변형을 전부 같은 것으로 만든다:
 *   "무신사 스탠다드" / "무신사스탠다드" / "MUSINSA Standard" / "musinsa standard"
 *
 * 공백을 통째로 지우기 때문에 조사가 붙어도(무신사가 · 무신사는 · 무신사에서)
 * 부분 문자열로 걸린다. 조사 목록을 따로 두지 않는 이유다 — 목록은 반드시
 * 빠뜨리는 게 생기고, 1차의 임무는 정밀함이 아니라 놓치지 않는 것이다.
 *
 * 순수 함수다. 외부 I/O 없음 (lint가 강제).
 */

/**
 * NFKC 한 방에 처리되는 것들:
 *   전각→반각(ＭＵＳＩＮＳＡ→MUSINSA) · 호환 문자(㈜→(주)) · 한글 자모 결합(NFD→NFC)
 *
 * 그다음 문자/숫자가 아닌 것을 전부 버린다. 공백·구두점·제로폭 문자·이모지가
 * 여기서 한꺼번에 사라진다. 제로폭 문자만 따로 지우는 replace를 두지 않는 이유다.
 * `u` 플래그가 있어 이모지를 코드포인트 단위로 다루므로 서로게이트 쌍이
 * 반토막 나 뒤 글자를 깨뜨리는 일이 없다.
 */
export function normalizeKo(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * 자소 클러스터 분할기.
 *
 * ★ 문자 하나씩(`input[i]`) 정규화하면 **NFD 입력이 깨진다.** 'ᄆ'과 'ᅮ'를
 *   따로 NFKC에 넣으면 각자 홑자모로 남아 '무'로 합쳐지지 않는다. 그러면
 *   `normalizeWithMap(s).normalized !== normalizeKo(s)`가 되어, 텍스트 전체에서
 *   찾은 위치를 map으로 되돌릴 수 없다. macOS에서 복사한 문자열이 NFD로
 *   들어오므로 가정이 아니라 실제로 들어오는 입력이다.
 *
 *   자소 클러스터 단위로 자르면 초성+중성+종성이 한 덩어리로 묶여 결합이
 *   유지된다(UAX #29의 한글 L·V·T 규칙). 이모지의 서로게이트 쌍과 ZWJ 결합
 *   이모지도 같은 이유로 온전히 유지된다.
 */
const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' })

export interface NormalizedWithMap {
  normalized: string
  /**
   * `normalized[i]`가 원본 텍스트의 몇 번째 문자에서 왔는가.
   * 길이는 항상 `normalized.length`와 같다.
   *
   * 근거 스니펫을 원문에서 잘라내려면 원본 인덱스가 필요하다. 정규화 후
   * 위치만 알면 고객에게 공백이 전부 지워진 문자열을 보여주게 된다.
   */
  map: number[]
}

/**
 * 정규화된 텍스트에서 원본 텍스트의 인덱스로 되돌리기 위한 매핑.
 * position(언급 순서) 계산과 근거 스니펫 추출에 필요하다.
 */
export function normalizeWithMap(input: string): NormalizedWithMap {
  const map: number[] = []
  let normalized = ''

  for (const { segment, index } of graphemes.segment(input)) {
    const n = normalizeKo(segment)
    for (let j = 0; j < n.length; j++) {
      normalized += n[j]
      // 클러스터가 여러 글자로 펼쳐져도(㈜ → 주) 전부 클러스터 시작을 가리킨다.
      map.push(index)
    }
  }

  return { normalized, map }
}
