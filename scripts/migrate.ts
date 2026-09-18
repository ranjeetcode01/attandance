// Creates/updates the database schema and adds the first admin on an empty database.
// Usage: npm run db:migrate   (uses DATABASE_URL, or the embedded PGlite database)
// Stop the running app first when using PGlite — only one process can open it.
import { getDb } from "../src/db";

getDb()
  .then(() => {
    console.log("Database ready.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
