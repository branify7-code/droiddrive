import path from "path";
import { mkdirSync } from "fs";
import { PrismaClient } from '@prisma/client'

// Portable default: if DATABASE_URL is unset (fresh clone without .env),
// fall back to the project-local SQLite file so `next build` and dev mode
// work out of the box. Override via .env for production placements.
if (!process.env.DATABASE_URL) {
  const dbFile = path.join(process.cwd(), "db", "custom.db");
  try {
    mkdirSync(path.dirname(dbFile), { recursive: true });
  } catch {
    /* best effort */
  }
  process.env.DATABASE_URL = `file:${dbFile}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DROIDDRIVE_PRISMA_LOG === "1" ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
