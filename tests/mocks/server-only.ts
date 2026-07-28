// vitest 전용 스텁.
//
// 'server-only' 패키지는 package.json의 exports 조건에 따라
// "react-server" 조건에서는 아무 것도 하지 않는 empty.js로,
// 그 외(default) 조건에서는 무조건 throw하는 index.js로 해석된다.
// Next.js의 webpack/turbopack 빌드는 서버 번들에 react-server 조건을
// 설정해두므로 서버 코드에서는 조용히 통과한다. 하지만 vitest는 이
// 조건을 설정하지 않는 일반 Node 환경이라 기본(default) 조건인
// index.js가 선택되어 테스트 실행 자체가 막힌다.
//
// 아래 vitest.config.ts의 resolve.alias가 'server-only' import를
// 이 빈 모듈로 대체해서, src/lib/env.ts의 `import 'server-only'`가
// 테스트를 깨지 않도록 한다. 실제 "클라이언트 번들에 섞이면 빌드
// 실패"라는 보장은 이 스텁이 아니라 `pnpm build`(Next.js 빌드)가
// 검증한다 — 단위 테스트로는 검증할 수 없는 부분이다.
export {}
