/**
 * 판정 정확도 채점.
 *
 * 설계 ③: **"검증하지 않은 숫자는 주장일 뿐이다."** 고객에게 "당신의
 * Cited Rate는 34%입니다"라고 말한다. 그게 맞는지 우리가 어떻게 아는가.
 * 판정기가 틀리면 숫자 전체가 거짓말이고, 고객은 자기 브랜드니까 금방 알아챈다.
 *
 * 채점 자체를 순수 함수로 떼어 둔 이유: 회귀 테스트는 실제 API를 부르므로
 * 자주 못 돌린다. 그런데 **채점 로직이 틀리면 게이트가 통과해도 의미가 없다.**
 * 이 파일은 API 없이 전량 테스트할 수 있어야 한다.
 */

export interface GoldLabel {
  id: string
  /** 사람이 붙인 정답 — 이 답변에 이 브랜드가 진짜 언급되었는가 */
  label: boolean
}

export interface Scores {
  /** 진짜 언급인데 언급이라고 맞춘 수 */
  tp: number
  /** 언급이 아닌데 언급이라고 한 수 (오탐) */
  fp: number
  /** 진짜 언급인데 놓친 수 */
  fn: number
  /** 언급이 아닌 걸 아니라고 맞춘 수 */
  tn: number
  /**
   * 놓치지 않는 능력. tp / (tp + fn).
   * 잴 수 없으면(긍정 라벨이 0건) null — 0이 아니다.
   */
  recall: number | null
  /**
   * 잘못 잡지 않는 능력. tp / (tp + fp).
   * 잴 수 없으면(언급이라고 한 적이 0건) null.
   */
  precision: number | null
  /** 예측이 없어 채점에서 빠진 라벨의 id. 조용히 넘어가면 안 된다. */
  missing: string[]
}

/**
 * 라벨과 예측을 맞춰 본다.
 *
 * ★ 예측이 없는 라벨을 "미언급 예측"으로 때우지 않는다. 판정 파이프라인이
 *   절반만 돌고 끝나도 recall이 그럴듯하게 나오기 때문이다. 빠진 건
 *   `missing`으로 보고하고, 호출자가 게이트에서 막는다.
 */
export function score(
  labels: readonly GoldLabel[],
  predicted: ReadonlyMap<string, boolean>,
): Scores {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  const missing: string[] = []

  for (const l of labels) {
    const pred = predicted.get(l.id)
    if (pred === undefined) {
      missing.push(l.id)
      continue
    }
    if (l.label && pred) tp++
    else if (l.label && !pred) fn++
    else if (!l.label && pred) fp++
    else tn++
  }

  return {
    tp,
    fp,
    fn,
    tn,
    recall: tp + fn > 0 ? tp / (tp + fn) : null,
    precision: tp + fp > 0 ? tp / (tp + fp) : null,
    missing,
  }
}

export interface Mistake {
  id: string
  kind: 'FP' | 'FN'
}

/** 오판정 목록. 프롬프트·별칭을 고칠 때 이걸 보고 고친다. */
export function mistakes(
  labels: readonly GoldLabel[],
  predicted: ReadonlyMap<string, boolean>,
): Mistake[] {
  const out: Mistake[] = []
  for (const l of labels) {
    const pred = predicted.get(l.id)
    if (pred === undefined) continue
    if (!l.label && pred) out.push({ id: l.id, kind: 'FP' })
    else if (l.label && !pred) out.push({ id: l.id, kind: 'FN' })
  }
  return out
}
