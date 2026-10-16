#!/usr/bin/env node
import { main } from "../src/main.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(`sonorant-cli: ${error.message}`);
  process.exitCode = 1;
});
