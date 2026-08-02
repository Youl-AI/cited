import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 순수 함수 경계 (설계 ① 핵심 원칙).
  //
  // src/lib/detection/ 과 src/lib/stats/ 는 "저장된 원본 → 판정 결과"만 하는
  // 순수 함수여야 한다. 이 두 디렉터리가 순수해야 하는 이유는 두 가지다.
  //
  // ★ src/lib/dashboard/data.ts 도 같은 경계 안이다 — 디렉터리가 아니라
  //   **파일 하나**만 넣는다. 이유가 셋 다르다.
  //     1. 이 파일은 클라이언트 컴포넌트에서 import된다(4단계 대시보드 화면).
  //        db·drizzle이 값으로 한 줄이라도 섞이면 번들에 서버 코드가 끌려간다.
  //     2. 같은 디렉터리의 `load.ts`가 정확히 `import { db } from '@/lib/db'`로
  //        시작한다 — **복사해 붙이기 좋은 템플릿이 옆에 있다.**
  //        (실측: 규칙 없이 data.ts에 db import를 넣었더니 lint·typecheck가
  //        둘 다 통과했다. "순수하다"는 주석만으로는 아무것도 못 막는다.)
  //     3. 디렉터리 전체를 넣으면 `load.ts`(DB 로더가 본업)와
  //        `data.test.ts`(`@/lib/audit/result`에서 값을 import한다)가 같이
  //        걸린다. 순수해야 하는 것은 data.ts 하나다.
  //   dashboard/ 에 순수 모듈을 더 만들면 이 목록에 파일명을 **명시적으로**
  //   추가해라. 글롭으로 넓히지 마라 — 넓히는 순간 load.ts가 들어온다.
  //   1. 2단계의 골든 라벨 회귀 테스트(재현율 95%·정밀도 90% CI 게이트)가
  //      API 키·DB·네트워크 없이 돌아야 한다.
  //   2. 판정 로직이 바뀌면 저장해 둔 원본으로 전량 재판정할 수 있어야 한다.
  // fetch·db·process.env가 한 줄이라도 섞이면 둘 다 무너진다.
  //
  // 규칙 대상 디렉터리는 2단계에서 생성된다. 지금은 비어 있지만 규칙은
  // 먼저 세워 둔다 — 사람(과 에이전트)의 기억에 맡기면 반드시 깨진다.
  // 외부 I/O가 필요하면 import하지 말고 인자로 주입받아라.
  //
  // ★ 이 경계는 **allow-list**다. deny-list로 두면 반드시 샌다 — 이름을 안 적은
  //   I/O 모듈(`@/lib/auth`, `node:fs`, `drizzle-orm`, 그리고 2단계가 만들
  //   LLM 클라이언트)이 전부 통과하기 때문이다. 2단계 구현자는 이 디렉터리를
  //   백지에서 쓴다. "우리는 @/ 관례를 쓴다"는 보장이 아니라 습관이다.
  //
  //   허용되는 것은 넷뿐이다.
  //     - 같은 디렉터리 상대경로 `./…`  (골든 라벨 fixture도 `./fixtures/x.json`
  //       으로 import하면 순수하게 유지된다 — fs로 읽지 마라)
  //     - `@/lib/detection…`, `@/lib/stats…`  (경계 안끼리)
  //     - `vitest`  (같은 디렉터리의 테스트 파일용)
  //     - **타입 전용 import는 어디서든 허용** — `import type { Answer } from
  //       '@/lib/db/schema'`는 컴파일 후 사라지므로 순수성을 해치지 않는다.
  //       (eslint 9.39의 core `no-restricted-imports`가 patterns의 regex에도
  //       `allowTypeImports`를 지원한다. 확인: lib/rules/no-restricted-imports.js
  //       의 reportPathForPatterns.)
  //
  //   순수하다고 판단되는 의존성이 새로 필요하면 규칙을 느슨하게 하지 말고
  //   아래 allow-list에 **명시적으로** 추가해라. 그 판단을 강제하는 것이 목적이다.
  {
    files: [
      "src/lib/detection/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
      "src/lib/stats/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
      "src/lib/dashboard/data.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // allow-list 밖의 모든 모듈. `(?!…)`로 뒤집는다.
              regex:
                "^(?!(?:\\./|@/lib/detection(?:/|$)|@/lib/stats(?:/|$)|vitest(?:/|$))).*",
              allowTypeImports: true,
              message:
                "detection/ · stats/ · dashboard/data.ts 는 순수 함수여야 합니다. 허용: './…', '@/lib/detection…', '@/lib/stats…', 'vitest', 그리고 `import type`. 외부 I/O는 import하지 말고 인자로 주입받으세요. (설계 ① 핵심 원칙)",
            },
            {
              // ★ dashboard/data.ts 전용 구멍. 위 allow-list의 `./…`가 같은
              //   디렉터리의 **DB 로더**(`./load`)를 그대로 통과시킨다 —
              //   경계에 파일 하나만 넣었기 때문에 생기는 틈이다.
              //   detection/ · stats/ 에는 load 모듈이 없어 방해되지 않는다.
              regex: "^\\./load(?:\\.[cm]?[jt]s)?$",
              allowTypeImports: true,
              message:
                "dashboard/data.ts는 순수해야 합니다 — 같은 디렉터리의 DB 로더('./load')를 값으로 import하면 클라이언트 번들에 db가 끌려옵니다. 타입만 필요하면 `import type`을 쓰세요.",
            },
            {
              // `../`로 경계 밖으로 나가는 상대경로. 위 regex는 `./`로 시작하는
              // `./../db` 같은 형태를 통과시키므로 `..`를 따로 막는다.
              regex: "\\.\\.",
              allowTypeImports: true,
              message:
                "detection/ · stats/ · dashboard/data.ts 에서 상위 디렉터리 상대경로 금지 — 경계 밖의 모듈입니다. 인자로 주입받으세요.",
            },
          ],
        },
      ],
      // no-restricted-imports는 정적 `import`만 본다. 아래 셋은 그 규칙이
      // 구조적으로 못 잡는 탈출구다.
      //   - ImportExpression: `await import('@/lib/db')`
      //     (core 규칙에 ImportExpression 리스너가 없다)
      //   - globalThis/window/global/self 멤버 접근: no-restricted-globals는
      //     전역 **참조**만 잡고 `globalThis.fetch` 같은 멤버 접근은 못 잡는다
      //   - require(): CJS 탈출구
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message:
            "detection/ · stats/ 에서 동적 import() 금지 — 순수 함수 경계를 우회합니다. 필요한 것은 인자로 주입받으세요.",
        },
        {
          selector:
            "MemberExpression[object.name=/^(globalThis|window|global|self)$/]",
          message:
            "detection/ · stats/ 에서 전역 객체 멤버 접근 금지 (globalThis.fetch 등) — 필요한 함수는 인자로 주입받으세요.",
        },
        {
          selector: "CallExpression[callee.name='require']",
          message:
            "detection/ · stats/ 에서 require() 금지 — 순수 함수 경계를 우회합니다.",
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "detection/ · stats/ 에서 네트워크 호출 금지 — fetch를 인자로 주입받거나, 호출부에서 받아 온 데이터를 인자로 넘기세요.",
        },
        {
          name: "process",
          message:
            "detection/ · stats/ 에서 환경변수 접근 금지 — 설정값을 인자로 주입받으세요 (`@/lib/env`에서 읽어 호출부가 넘긴다).",
        },
        {
          name: "XMLHttpRequest",
          message:
            "detection/ · stats/ 에서 네트워크 호출 금지 — 데이터를 인자로 넘기세요.",
        },
        {
          name: "WebSocket",
          message:
            "detection/ · stats/ 에서 네트워크 호출 금지 — 데이터를 인자로 넘기세요.",
        },
        {
          name: "localStorage",
          message: "detection/ · stats/ 에서 저장소 접근 금지 — 상태를 인자로 주입받으세요.",
        },
        {
          name: "sessionStorage",
          message: "detection/ · stats/ 에서 저장소 접근 금지 — 상태를 인자로 주입받으세요.",
        },
      ],
    },
  },
]);

export default eslintConfig;
