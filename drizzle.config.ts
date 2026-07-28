import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // 마이그레이션은 direct 연결로. pooled 연결은 DDL에서 문제를 일으킨다.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
