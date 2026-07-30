# 수집 코어 실측 (2026-07-30)

3단계 Task 2. `runCollection`을 실제 엔진으로 돌린 결과 — `pnpm probe:collection`.
무료 플랜 팬아웃(질의 × 2엔진 × 1샘플)을 그대로 쓴다.

## 동시성이 실제로 작동한다

| 실행 | 팬아웃 | 동시성 | 소요 | 원가 | 호출당 |
| --- | --- | --- | --- | --- | --- |
| 직렬 강제 | 6회 | 1 | **88.1초** | 242원 | 40원 |
| 기본값 | 4회 | 4 | **22.3초** | 129원 | 32원 |

직렬은 호출당 약 14.7초다. 기본 동시성에서 4회가 22.3초에 끝났으므로
(직렬이면 약 59초) 병렬이 실제로 걸린다.

**호출당 40원 / 32원은 2단계 실측(ChatGPT 39~44원, Gemini 33원)과 일치한다.**
원가 모델이 세 번 틀린 뒤 처음으로 예측이 맞았다.

두 실행 모두 **재시도 0건, 실패 0건**이었다. 재시도 경로는 단위 테스트의
변이 검증으로만 확인됐다 — 실제 429·5xx는 아직 못 봤다. 4단계 주간 수집
(Starter 100회)에서 다시 본다.

## 지표 값

```
성공 6/6 · 상태 succeeded · 배지 대상 아님
호출 {"chatgpt":3,"gemini":3}
토큰 in 41,406 / out 3,266
원가 242,267밀리원 = 242원
```

입력 토큰이 출력의 12배다. 웹 검색 결과가 컨텍스트로 되돌아오기 때문이다 —
입력 단가가 싼 모델을 고른 것이 여기서 값을 한다.

## 인용이 전부 채워졌다

답변 6건 모두 인용이 있었고 `raw`가 빈 답변은 없었다.

Gemini 도메인이 `vertexaisearch.cloud.google.com`으로 뭉개지지 않았다 —
`tistory.com`, `runable.me`, `runningwikii.com`, `the-edit.co.kr`,
`allrunabout.com`, `footsell.com`, `youtube.com`이 제대로 분리됐다.
2단계 `Citation.domain` + `hostnameFromTitle`이 작동한다는 실증이다.

ChatGPT 도메인은 영문 리뷰·브랜드 공식 사이트에 몰린다:
`outdoorgearlab.com`, `tomsguide.com`, `runnersworld.com`,
`newbalance.com`, `brooksrunning.com`, `hoka.com`, `altrarunning.com`,
`assets.asics.com`.

**두 엔진이 서로 다른 출처를 읽는다.** 한국 블로그·커뮤니티(Gemini) vs
영문 리뷰 매체·브랜드 공식(ChatGPT). 리포트의 "AI가 읽는 출처"를 엔진별로
갈라 보여줄 값어치가 있다 — 조치 대상이 완전히 다르다.

## 별칭 발견의 보정

2단계 노트는 "ChatGPT는 영문만, Gemini는 한글만"이라고 적었다. 이번 실측에서
**Gemini는 `나이키 (NIKE)`처럼 한글과 영문을 함께 쓰는 경우가 있었다.**

ChatGPT 쪽은 여전히 영문 단독이었다(`Brooks`, `New Balance`, `Hoka`).
결론은 바뀌지 않는다 — **영문 별칭이 없으면 ChatGPT 언급률이 0%가 된다.**
Gemini 쪽 여유는 우리에게 유리한 방향의 오차일 뿐이다.

## 한국 전용 브랜드에서 문제가 **더** 크다 (추가 실측)

앞의 발견은 영문 이름이 이미 있는 글로벌 브랜드(아식스/ASICS)에서 나왔다.
"한국 전용 브랜드는 한글로 나오지 않을까"를 확인했다.

`pnpm probe:engine chatgpt "민감성 피부 저자극 토너 추천해줘"` — 화장품은
한국 전용 브랜드가 몰려 있는 카테고리다.

**답변 산문은 한국어인데 브랜드명은 8개 전부 영문이었다. 한글 브랜드 토큰이 0개다.**

| 실제 브랜드 | ChatGPT 표기 | 기계적 로마자라면 |
| --- | --- | --- |
| 편강율 | `Pyunkang Yul` | Pyeongangyul |
| 이즈앤트리 | `Isntree` | Ijeuaenteuri |
| 에뛰드 순정 | `Etude Soonjung` | Etwideu Sunjeong |
| 코스알엑스 | `COSRX` | Koseualekseu |

**ChatGPT가 쓰는 것은 그 브랜드의 공식 상표 로마자다. 기계적 음차가 아니다.**
규칙으로 유도할 방법이 없고, `편강율 → Pyunkang Yul`은 **브랜드 본인만 안다.**

결론이 세 가지로 갈린다.

1. **소규모 한글 브랜드가 글로벌 브랜드보다 더 위험하다.** 글로벌 브랜드는
   영문형이 하나로 뻔하지만(ASICS), 한국 브랜드는 공식 로마자가 예측 불가다.
   별칭 없이 돌리면 **구조적으로 0%**가 나온다.
2. **별칭 생성(Task 6-2)은 ChatGPT 엔진의 존재 조건이다.** 알려진 브랜드는
   모델이 맞힐 수 있지만, 무명 브랜드는 못 맞힌다 → 리포트가 측정 표기를
   보여주고 고객이 고칠 수 있어야 한다. 4단계 온보딩은 반드시 편집 가능해야 한다.
3. **별칭만 맞으면 ChatGPT가 더 값진 엔진일 수 있다.** 인용 출처가
   `pyunkangyul.shop`·`theisntree.com`으로 **브랜드 자기 사이트**였다.
   `selfDomains` 판정이 실제로 작동하는 자리다. Gemini는 `tistory.com`·
   `footsell.com` 같은 3자 커뮤니티를 읽었다.

### ChatGPT는 한국어 질문에도 해외 채널을 읽는다

같은 답변에 Paula's Choice·Avène·La Roche-Posay·CeraVe가 섞였고, 에뛰드
출처로 미국 유통사 `ulta.com`을 읽었다. 국내 소비자 질문인데 **글로벌 K-뷰티
관점**으로 답한다.

이것도 리포트에 쓸 정보다 — "ChatGPT에서 이기려면 영문 콘텐츠와 해외 유통
노출이 필요하다"가 Gemini 대책과 완전히 다른 조치가 된다.

## 다음에 확인할 것

- 재시도·429를 실제로 겪어보기. 지금은 변이 테스트로만 검증됐다
- `ENGINE_QUEUE_CONCURRENCY`(chatgpt 4 / gemini 4)는 **추측이다.**
  4단계 주간 수집 100회에서 429가 뜨는지 보고 조정한다
- 인용 출처를 엔진별로 나눠 리포트에 넣을지 (3단계 Task 6·8)
