# Gemini 그라운딩 locale 대칭성 검토 (2026-07-31)

읽기 전용 조사. 배경: ChatGPT 엔진은 US 편중 실측(2026-07-31, 금융 질의에
Zelle·Wise·Fidelity) 후 `web_search` 툴에
`user_location: { type: 'approximate', country: 'KR' }`를 싣는다
(`src/lib/engines/chatgpt.ts:248-257`). Gemini 엔진에는 대응 신호가 없다
(`src/lib/engines/gemini.ts:181-189` — `systemInstruction` + `tools:
[{ googleSearch: {} }]`뿐). 질문: 이게 측정 조건 비대칭인가, 노브가 있는가.

## 1. 현재 호출 형태

- `src/lib/engines/gemini.ts:181-189`: `generateContent({ model, contents,
  config: { systemInstruction, tools: [{ googleSearch: {} }], abortSignal } })`.
  언어·지역·위치 인자 없음. 유일한 한국어 신호는 한국어 시스템 프롬프트와
  한국어 질의 자체.
- 코드베이스의 대칭 요구는 "같은 시스템 프롬프트 + 양쪽 다 그라운딩 켬"으로
  명문화되어 있다 (`src/lib/engines/chatgpt.ts:265`,
  `src/lib/engines/chatgpt.run.test.ts:71-76`). locale 신호의 대칭은 아직
  어디에도 명문화되어 있지 않다.

## 2. SDK 표면 (`node_modules/@google/genai/dist/genai.d.ts`)

- **`GoogleSearch` 툴 자체에는 locale 필드가 없다** (genai.d.ts:6271-6280):
  `searchTypes` · `blockingConfidence`(Gemini API 미지원) ·
  `excludeDomains`(Gemini API 미지원) · `timeRangeFilter`(Vertex 미지원).
- **노브는 툴 밖, `toolConfig.retrievalConfig`에 있다**:
  - `GenerateContentConfig.toolConfig?: ToolConfig` (genai.d.ts:2349)
  - `ToolConfig.retrievalConfig?: RetrievalConfig` (genai.d.ts:13178-13180)
  - `RetrievalConfig { latLng?: LatLng; languageCode?: string }`
    (genai.d.ts:11556-11561) — "The location of the user" / "The language
    code of the user". `LatLng`은 위도·경도 쌍 (genai.d.ts:8188-8192).
  - 이 타입에는 다른 필드들과 달리 "not supported in Gemini API" 주석이
    **없다** — 약한 긍정 신호일 뿐, 지원 보장은 아니다.

## 3. 문서 조사

- Gemini API의 Grounding with Google Search 문서에는 **locale/지역 제어
  파라미터가 전혀 없다.** 유일한 언어 관련 문구: "works with all available
  languages." → 결과 locale을 무엇이 결정하는지 문서화되어 있지 않다
  (사실상 질의 언어가 결정하는 것으로 보인다 — 아래 §4 실측과 부합).
  https://ai.google.dev/gemini-api/docs/google-search
- `retrievalConfig.latLng`는 Gemini API에서는 **Google Maps 그라운딩**
  문맥으로 문서화되어 있다: "Local queries ('near me') will use the
  coordinates, while specific or non-local queries are unlikely to be
  influenced." https://ai.google.dev/gemini-api/docs/generate-content/maps-grounding
- **Vertex AI**의 Grounding with Google Search 문서는 latLng로 "search
  results can be customized for a specific geographic location"을 문서화하고,
  `language_code`는 주로 Maps 결과 localize 용으로 기술한다.
  https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search
- 정리: **google_search + Gemini Developer API(API key 경로 — 우리가 쓰는
  경로) 조합에서 `retrievalConfig`가 실제로 검색 locale을 움직인다는 공식
  문서는 없다.** Vertex에서는 문서화되어 있고, SDK 타입상 전달은 가능하다.
  채택하려면 실측 프로브가 선행돼야 한다 (이번 조사는 API 지출 금지라 미실행).

## 4. 실측 근거 — Gemini는 이미 KR-localized로 동작

- 리허설 (docs/superpowers/notes/2026-07-31-kmong-rehearsal.md): 수원 지역형
  60답변에서 **Gemini 40% vs ChatGPT 13%** (ChatGPT는 이미 `user_location:
  KR` 적용 후). Gemini는 업체 리스트형 국내 콘텐츠를 인용 — 최다 인용 출처가
  `pilatesroutine.co.kr`(33%). 노트 자체 결론: "locale 문제가 아니라 **읽는
  출처가 다르다**" (발견 4).
- 골드 확장 (docs/superpowers/notes/2026-07-31-golden-expansion.md): 금융
  질의에서 US 편중은 **chatgpt 쪽에서만** 관찰됐다(Zelle·Wise·Fidelity…).
  Gemini는 토스·카카오뱅크 등 국내 브랜드를 정상 언급 — "한국어 질의라도
  chatgpt는 국내 금융 브랜드 언급률이 gemini보다 훨씬 낮게 측정될 수 있다."
- 즉 한국어 질의만으로 Gemini 그라운딩은 국내 결과로 수렴한다. US 드리프트가
  관찰된 적이 없다. ChatGPT의 `user_location`은 Gemini에 없는 우위를 주는
  조작이 아니라, **소비자 ChatGPT가 IP·계정으로 이미 아는 사실을 생 API에
  복원한 교정**이다(chatgpt.ts:250-252의 논리). 같은 기준을 Gemini에 대면:
  한국 소비자가 한국어로 쓰는 Gemini와 지금 호출 형태의 격차가 관찰되지
  않았다 — 교정할 편향이 없다.

## 5. 결론

**(a) 실질 비대칭 문제: 현재로선 없다.** 비대칭은 "메커니즘"(명시 신호
유무)에 있지 "결과"(측정된 locale 편향)에 있지 않다. 측정 목표가 "실제 한국
사용자가 보는 답변"인 이상, 양쪽 다 그 목표에 수렴해 있다는 것이 실측이다.

**(b) 노브는 존재한다** — 쓰게 된다면 `gemini.ts:184-188`의 `config`에:

```ts
config: {
  systemInstruction: SYSTEM_PROMPT,
  tools: [{ googleSearch: {} }],
  toolConfig: {
    retrievalConfig: {
      languageCode: 'ko_KR',
      // latLng: { latitude: …, longitude: … } — 아래 이유로 비권장
    },
  },
  ...
}
```

단 두 가지 제약:
1. **국가 단위 필드가 없다.** ChatGPT 쪽은 `country: 'KR'`만 넣고 도시·지역을
   금지했는데(chatgpt.ts:254-256 — 승인 안 된 제품 결정), Gemini의
   `retrievalConfig`는 좌표점(`latLng`)뿐이라 국가-only를 표현할 수 없다.
   서울 좌표를 넣으면 ChatGPT의 국가 신호보다 **더 좁은** 도시 편향이 생겨
   오히려 새 비대칭이 된다. 대칭 목적이라면 `languageCode`만 후보.
2. **Gemini API + google_search에서의 효과가 미검증**이다(§3). 넣었는데
   무시되면 무해하지만, 효과 여부를 모른 채 넣는 것 자체가 측정 조건 변경.

**(c) 권고: 지금은 아무것도 바꾸지 않는다 — 알려진 측정 조건으로 문서화(이
노트가 그 역할).** 근거: ① 교정할 실측 편향이 Gemini에 없다. ② 노브는
국가-only 표현이 불가하고 우리 경로에서 효과가 미문서·미검증이다. ③ 측정
조건 변경은 시계열 단절점이다 — 2026-07-31에 `user_location`으로 이미 한 번
끊었다. 근거 있는 편향 없이 사변적으로 한 번 더 끊는 것은 전후 비교 상품의
가치를 깎는다. **재검토 트리거**: 향후 어느 업종에서든 Gemini 답변의 US/영어
드리프트가 실측되면, 그때 `toolConfig.retrievalConfig.languageCode: 'ko_KR'`
을 dry-run으로 프로브해 효과를 확인한 뒤 채택하고, 채택 시점을 단절점으로
기록한다. `latLng`는 지역 조준 제품 결정이 승인되기 전에는 쓰지 않는다.

## 출처

- https://ai.google.dev/gemini-api/docs/google-search
- https://ai.google.dev/gemini-api/docs/generate-content/maps-grounding
- https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search
- https://developers.googleblog.com/en/your-ai-is-now-a-local-expert-grounding-with-google-maps-is-now-ga/
- `node_modules/@google/genai/dist/genai.d.ts` (RetrievalConfig: 11556-11561,
  ToolConfig: 13178-13185, GoogleSearch: 6271-6280, GenerateContentConfig.toolConfig: 2349)
- `src/lib/engines/gemini.ts:181-189` · `src/lib/engines/chatgpt.ts:248-266`
- `docs/superpowers/notes/2026-07-31-kmong-rehearsal.md` (발견 4)
- `docs/superpowers/notes/2026-07-31-golden-expansion.md` (Step 1·2 관찰)
