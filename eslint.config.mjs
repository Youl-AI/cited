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
  //   1. 2단계의 골든 라벨 회귀 테스트(재현율 95%·정밀도 90% CI 게이트)가
  //      API 키·DB·네트워크 없이 돌아야 한다.
  //   2. 판정 로직이 바뀌면 저장해 둔 원본으로 전량 재판정할 수 있어야 한다.
  // fetch·db·process.env가 한 줄이라도 섞이면 둘 다 무너진다.
  //
  // 규칙 대상 디렉터리는 2단계에서 생성된다. 지금은 비어 있지만 규칙은
  // 먼저 세워 둔다 — 사람(과 에이전트)의 기억에 맡기면 반드시 깨진다.
  // 외부 I/O가 필요하면 import하지 말고 인자로 주입받아라.
  {
    files: ["src/lib/detection/**/*.ts", "src/lib/stats/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db", "@/lib/db/*", "@/lib/env", "@/lib/email/*", "next/*"],
              message:
                "detection/ 과 stats/ 는 순수 함수여야 합니다. 외부 I/O를 주입받으세요. (설계 ① 핵심 원칙)",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "detection/ · stats/ 에서 네트워크 호출 금지" },
        { name: "process", message: "detection/ · stats/ 에서 환경변수 접근 금지" },
      ],
    },
  },
]);

export default eslintConfig;
