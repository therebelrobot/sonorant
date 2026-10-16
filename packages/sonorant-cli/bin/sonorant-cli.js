#!/usr/bin/env node
import { EXIT } from "../src/errors.js";
import { main } from "../src/main.js";

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message ?? String(error));
  process.exitCode = error.exitCode ?? EXIT.INPUT;
});
