// Node.js 런타임의 Sentry 초기화. src/instrumentation.ts가 적재한다.
//
// ★ 여기서 `@/lib/env`를 쓰지 않는다. 이 파일은 `Sentry.init`이 다른 어떤
//   모듈보다 먼저 돌아야 계측이 온전한데, env 모듈을 끌어오면 zod 검증
//   전체가 그 앞에 끼어든다. DSN은 검증할 게 없는 단일 문자열이라
//   process.env에서 직접 읽는다 (env.ts에도 SENTRY_DSN은 optional로 있다).
//
// DSN이 없으면 `enabled: false`가 되어 SDK가 아무것도 전송하지 않는다.
// 즉 Sentry 프로젝트를 만들기 전에도 앱은 정상 동작한다.

import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrub'

// ★ tracesSampleRate를 넣지 않는다 (성능 추적 off). 이유가 셋이다.
//   1. transaction 이벤트는 `beforeSend`가 아니라 `beforeSendTransaction`으로
//      간다(@sentry/core client.js). 아래 scrubEvent를 **아예 거치지 않는**
//      이벤트가 생기고, 거기엔 request.url·query_string·http.url·db.statement가
//      실린다.
//   2. @sentry/node sdk/index.js가 `hasSpansEnabled(options)`로 분기한다 —
//      tracesSampleRate를 세우는 것만으로 HTTP·Postgres 등 자동 계측 전체가
//      매 콜드스타트마다 적재된다.
//   3. 무료 플랜에서 span/transaction 쿼터는 에러와 별도로 과금된다.
//
// 나중에 성능 추적이 필요해지면 `tracesSampleRate`만 켜지 말고 반드시
// `beforeSendTransaction: scrubEvent`(또는 동등한 scrub)를 **같이** 붙여라.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // 이메일·IP·쿠키·요청 본문이 자동으로 실려 나가지 않게 한다.
  sendDefaultPii: false,
  // 자동 첨부가 아니라 **메시지 본문**에 박혀 오는 비밀(DATABASE_URL의
  // 비밀번호 등)까지 지우는 마지막 방어선. src/lib/sentry-scrub.ts 참고.
  beforeSend: scrubEvent,
})
