// 브라우저에서 실행되는 Sentry 초기화. Next.js가 클라이언트 번들 진입점에서
// 자동으로 적재한다.
//
// ★ 여기서 `@/lib/env`를 import하면 안 된다 — 그 모듈은 `server-only`라
//   클라이언트 번들에 섞이는 순간 빌드가 깨진다. 그리고 Next는 클라이언트
//   번들에서 `process.env.NEXT_PUBLIC_X` **리터럴만** 문자열로 치환하므로
//   아래처럼 직접 읽는 형태를 유지해야 한다.
//
// 공개 DSN이 없으면 `enabled: false`가 되어 아무것도 전송하지 않는다.

// `@/lib/sentry-scrub`는 순수 모듈이다 — 값 import가 하나도 없고
// `@sentry/nextjs`를 **타입 전용**으로만 가져오므로 컴파일 후 남는 import가
// 없다. 그래서 이 파일(클라이언트 번들)에서 안전하게 쓸 수 있다.
// `@/lib/env`(server-only)나 node 내장은 이 경로에 끌려 들어오지 않는다.
import * as Sentry from '@sentry/nextjs'
import { scrubEvent } from '@/lib/sentry-scrub'

// tracesSampleRate 없음 — 근거는 sentry.server.config.ts 주석 참고.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // 브라우저 이벤트에도 IP·쿠키를 붙이지 않는다.
  sendDefaultPii: false,
  // 서버·edge와 같은 두 번째 방어선. 브라우저 SDK 기본 통합에는
  // breadcrumbsIntegration이 들어 있어 console·DOM 클릭·fetch·XHR을
  // breadcrumb으로 남긴다 — 쿼리스트링에 토큰이 실린 요청이 실패하면
  // sendDefaultPii: false만으로는 막지 못한다.
  beforeSend: scrubEvent,
})

// 라우터 전환 훅은 의도적으로 export하지 않는다. 그것은 **네비게이션 스팬**을
// 시작하는 배선인데 성능 추적을 껐으므로 시작할 스팬이 없다. 껐다고 적어 둔
// 기능의 배선만 남겨 두면 다음 사람이 추적이 켜져 있다고 오해한다.
// 빌드 경고는 next.config.ts의 suppressOnRouterTransitionStartWarning으로
// 명시적으로 끈다 — 성능 추적을 켤 때 그 옵션과 이 주석을 같이 되돌려라.
