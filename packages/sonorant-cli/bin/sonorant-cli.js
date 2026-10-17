#!/usr/bin/env node
import { main } from "../dist/main.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message ?? String(error));
  process.exitCode = error.exitCode ?? 1;
});
