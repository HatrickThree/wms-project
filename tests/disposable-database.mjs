// Refuse remote or working databases even when the environment flag is set.
export function requireDisposableDatabase() {
  let allowed = false;
  try {
    const url = new URL(process.env.DATABASE_URL || "");
    allowed = ["postgres:", "postgresql:"].includes(url.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && /(?:^|_)(test|qa)(?:_|$)/i.test(url.pathname.slice(1));
  } catch { /* Invalid connection is never a test target. */ }
  if (process.env.ALLOW_DISPOSABLE_DATABASE !== "1" || !allowed)
    throw new Error("Disposable local PostgreSQL test/QA database required");
}

export async function assertForeignKeysValid(db) {
  const invalid = await db.$queryRaw`SELECT conname FROM pg_constraint WHERE contype='f' AND NOT convalidated AND connamespace=current_schema()::regnamespace`;
  if (invalid.length) throw new Error("Unvalidated foreign keys in QA database");
}
