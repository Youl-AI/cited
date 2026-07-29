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
});
