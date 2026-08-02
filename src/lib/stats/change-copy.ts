import type { ChangeVerdict } from '@/lib/stats/wilson'

/**
 * 변화 판정 문장 — `judgeChange`의 출력에 대한 유일한 문장이다.
 * 리포트(전후 비교)와 대시보드(헤드라인)가 같은 판정에 같은 말을 해야 한다.
 */
export function changeSentence(verdict: ChangeVerdict): string {
  switch (verdict) {
    case 'unchanged':
      return '두 측정의 신뢰구간이 겹칩니다 — 차이가 측정 오차 범위 안에 있어, 실제 변화라고 판정할 수 없습니다.'
    case 'up':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 상승입니다.'
    case 'down':
      return '신뢰구간이 겹치지 않습니다 — 통계적으로 유의미한 하락입니다.'
    case 'incomparable':
      // incomparable의 원인은 엔진 구성만이 아니다 — 질의 집합 수정, 판정기
      // 버전 상승도 같은 판정을 낸다. 원인 하나만 집어 말하면 나머지 경우에
      // 거짓 이유가 되므로, 어느 원인에서든 참인 문장으로 쓴다.
      return '두 측정의 조건(엔진 구성·질의 집합·판정기 버전)이 달라 변화를 비교할 수 없습니다.'
  }
}
