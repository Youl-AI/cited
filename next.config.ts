import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry는 빌드 파이프라인에 끼어들어 (1) 런타임 계측을 주입하고
// (2) SENTRY_AUTH_TOKEN이 있으면 소스맵을 업로드한다. 토큰이 없으면 업로드
// 단계를 통째로 건너뛰므로 로컬·CI 빌드가 그대로 통과한다.
//
// 옵션을 늘리지 않는다. `disableLogger`는 @sentry/nextjs 10.68에서
// deprecated이고(빌드마다 경고를 찍는다) webpack 전용이라 이 프로젝트의
// Turbopack 빌드에서는 아무 일도 하지 않는다 — 그래서 넣지 않았다.
export default withSentryConfig(nextConfig, {
  // 인증 토큰이 없을 때의 "소스맵 업로드 건너뜀" 안내를 포함해 빌드 로그를
  // 조용히 유지한다.
  silent: true,
  // 기본값이 true라 DSN이 없어도 모든 빌드가 sentry.io로 플러그인 텔레메트리를
  // 보낸다. CI 빌드가 남의 서비스에 네트워크 의존성을 갖는 것은 그 자체로
  // 실패 지점이고, 우리가 얻는 것은 없다.
  telemetry: false,
  // SENTRY_AUTH_TOKEN이 없으면 업로드가 어차피 건너뛰어지는데, 플러그인은
  // 그때도 productionBrowserSourceMaps를 강제로 켠다 — 빌드만 느려지고
  // (측정: 3.5초 → 6.5초) 얻는 것은 없다.
  // ★ 토큰이 생기면 이 블록을 지워라. 안 지우면 소스맵이 영영 안 올라간다.
  sourcemaps: { disable: true },
  // 성능 추적을 껐으므로 라우터 전환 훅(네비게이션 스팬 시작)이 필요 없다.
  // src/instrumentation-client.ts 주석 참고. 추적을 켤 때 이 줄을 지워라.
  suppressOnRouterTransitionStartWarning: true,
});
