/**
 * 실제 엔진 API를 1회 호출하고 원본 응답을 픽스처로 저장한다.
 *
 *   pnpm probe:engine gemini "30대 남자 러닝화 추천해줘"
 *
 * 저장 위치: tests/fixtures/engines/<engineId>-<slug>.json
 * 이 파일이 엔진 계약 테스트의 입력이 된다. **실제 API를 부르는 테스트를
 * CI에 두지 않기 위해서다.**
 *
 * 이 도구가 존재하는 이유는 하나다 — 응답 스키마를 추측으로 파싱하지 않기
 * 위해서. 원가 가정이 Gemini에서 한 번 틀렸듯, 파서도 문서만 보고 쓰면 틀린다.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { getEngine } from '@/lib/engines'

const [engineId, query] = process.argv.slice(2)

if (!engineId || !query) {
  console.error('사용법: pnpm probe:engine <engineId> "<질의>"')
  process.exit(1)
}

const engine = await getEngine(engineId)
if (!engine.isConfigured()) {
  console.error(`${engineId}: API 키가 설정되지 않았습니다. .env.local을 확인하세요.`)
  process.exit(1)
}

const started = Date.now()
const answer = await engine.run(query, { sampleIndex: 0 })
const elapsed = Date.now() - started

// 파일명에 쓸 수 없는 문자를 걷어낸다. 한글은 그대로 남긴다(\p{L}).
const slug =
  query
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'query'
const path = `tests/fixtures/engines/${engineId}-${slug}.json`

await mkdir('tests/fixtures/engines', { recursive: true })
await writeFile(
  path,
  JSON.stringify(
    {
      engineId,
      query,
      capturedAt: new Date().toISOString(),
      elapsedMs: elapsed,
      usage: answer.usage,
      raw: answer.raw,
    },
    null,
    2,
  ),
)

console.log(`저장: ${path}`)
console.log(`소요: ${elapsed}ms`)
console.log(`사용량: ${JSON.stringify(answer.usage)}`)
console.log(`인용 ${answer.citations.length}건`)
console.log('--- 응답 텍스트 (앞 500자) ---')
console.log(answer.text.slice(0, 500))
