// Copies the files `next build` leaves out of .next/standalone so the folder can be
// uploaded to a server and started with `node server.js`.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, ".next", "standalone");
if (!fs.existsSync(out)) {
  // Vercel and other managed hosts build their own bundle; nothing to prepare.
  console.log("No .next/standalone folder — skipping (managed host or non-standalone build).");
  process.exit(0);
}

const copies = [
  [".next/static", ".next/static"],
  ["public", "public"],
  ["drizzle", "drizzle"],
  // PGlite loads its WASM/data files from disk at runtime.
  ["node_modules/@electric-sql/pglite/dist", "node_modules/@electric-sql/pglite/dist"],
];
for (const [from, to] of copies) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(out, to), { recursive: true });
  console.log(`copied ${from}`);
}
console.log(`\nStandalone app ready in ${path.relative(root, out)} — start with: node server.js`);
