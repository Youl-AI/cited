import { ENGINE_TIER, type EngineId } from '@/lib/plans'
import type { Engine } from '@/lib/engines/types'

export * from '@/lib/engines/types'
export * from '@/lib/engines/pricing'

/**
 * 엔진 레지스트리.
 *
 * 설계 ①: **엔진 추가는 파일 하나 추가로 끝나야 한다.** 새 엔진은
 * `src/lib/engines/<id>.ts`에 `Engine`을 구현하고 아래 표에 한 줄 넣으면 된다.
 * 네이버 공급자를 SerpApi에서 다른 곳으로 옮길 때도 이 표만 바뀐다.
 *
 * 값이 **팩토리 함수**인 이유: 엔진 모듈을 즉시 import하면 아직 구현하지 않은
 * 엔진이나 키가 없는 엔진까지 모듈 로드 시점에 딸려 온다. 실제로 쓸 때만
 * 만들어야 `probe:engine gemini`가 ChatGPT 키를 요구하지 않는다.
 */
const FACTORIES: Partial<Record<EngineId, () => Promise<Engine>>> = {
  // Task 5에서 채운다: gemini: async () => (await import('@/lib/engines/gemini')).geminiEngine,
}

export function isEngineId(value: string): value is EngineId {
  return value in ENGINE_TIER
}

/** 구현이 존재하는 엔진 목록. 키 설정 여부는 보지 않는다. */
export function implementedEngineIds(): EngineId[] {
  return Object.keys(FACTORIES) as EngineId[]
}

export async function getEngine(engineId: string): Promise<Engine> {
  if (!isEngineId(engineId)) {
    const known = Object.keys(ENGINE_TIER).join(', ')
    throw new Error(`알 수 없는 엔진: ${engineId} (사용 가능: ${known})`)
  }
  const factory = FACTORIES[engineId]
  if (!factory) {
    const done = implementedEngineIds().join(', ') || '(없음)'
    throw new Error(`${engineId} 엔진은 아직 구현되지 않았습니다. 구현된 엔진: ${done}`)
  }
  return factory()
}
