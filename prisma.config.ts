import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrate: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  },
});
