// Creates/updates the database schema and adds the first admin on an empty database.
// Usage: npm run db:migrate   (uses DATABASE_URL, or the embedded PGlite database)
// Stop the running app first when using PGlite — only one process can open it.
// This script exists to run migrations, so never let AUTO_MIGRATE=0 (used to keep
// serverless requests from migrating) turn them off here.
process.env.AUTO_MIGRATE = "1";

import("../src/db")
  .then(({ getDb }) => getDb())
  .then(() => {
    console.log("Database ready.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

export {};
