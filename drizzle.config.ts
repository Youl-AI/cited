import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 마이그레이션은 direct 연결로. pooled 연결은 DDL에서 문제를 일으킨다.
    // `??`가 아니라 `||`인 이유: `.env.example`을 복사하면 이 키가 **빈
    // 문자열로 존재**한다. `??`는 null·undefined만 걸러내므로 빈 문자열을
    // 그대로 통과시켜 마이그레이션이 빈 접속 문자열로 실행된다.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
