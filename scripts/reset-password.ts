// Emergency password reset (e.g. admin locked out).
// Usage: npm run user:reset-password -- ADMIN "NewPass@123"
// Stop the running app first when using PGlite — only one process can open it.
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const [code, password] = process.argv.slice(2);
  if (!code || !password || password.length < 6) {
    console.error('Usage: npm run user:reset-password -- <EMP_CODE> "<new password, min 6>"');
    process.exit(1);
  }
  const db = await getDb();
  const rows = await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      active: true,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.empCode, code.toUpperCase()))
    .returning({ id: users.id, name: users.name });
  if (!rows.length) {
    console.error(`No user with code ${code}`);
    process.exit(1);
  }
  console.log(`Password reset for ${rows[0].name}. They must change it at next login.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
