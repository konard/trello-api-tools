#!/usr/bin/env node
/**
 * test-create-board.mjs
 * E2E tests for createBoard function and CLI.
 * Usage: node test-create-board.mjs
 * Environment Variables:
 *   TRELLO_API_KEY - API key for authentication.
 *   TRELLO_API_TOKEN - API token for authentication.
 */

// Dynamically load use-m
const { use } = eval(
  await fetch('https://unpkg.com/use-m/use.js').then((u) => u.text())
);

// Load local modules
const { createBoard } = await use('./create-board.mjs');

// Load Node.js built-in modules
const { fileURLToPath } = await use('node:url');
const pathModule = await use('node:path');
const path = pathModule.default || pathModule;

// Load command-stream for CLI testing
const commandStreamModule = await use('command-stream@0.3.0');
const { $ } = commandStreamModule;

// Load .env
const { config } = await use('dotenv@16.1.4');
config({ path: path.resolve(process.cwd(), '.env') });

// Import test runner and assertions
const { test } = await use('uvu@0.5.6');
const { is } = await use('uvu@0.5.6/assert');

// Import axios for cleanup
const axiosModule = await use('axios@1.9.0');
const axios = axiosModule.default || axiosModule;

const currentFilePath = fileURLToPath(import.meta.url);
const __dirname = path.dirname(currentFilePath);

const key = process.env.TRELLO_API_KEY;
if (!key) {
  throw new Error('Set environment variable TRELLO_API_KEY');
}
const token = process.env.TRELLO_API_TOKEN;
if (!token) {
  throw new Error('Set environment variable TRELLO_API_TOKEN');
}
const apiBase = process.env.TRELLO_API_BASE_URL || 'https://api.trello.com/1';

let board;
let cliBoard;
let boardName;

// Setup test data before tests
test.before(() => {
  boardName = `test-board-${Date.now()}`;
});

// Test function export
test('function export: createBoard returns a board with id and correct name', async () => {
  board = await createBoard({ name: boardName, key, token, apiBase });
  is(typeof board.id, 'string');
  is(board.name, boardName);
});

// Test CLI
test('CLI: create-board CLI outputs matching JSON with debug tracing', async () => {
  const oldDebug = process.env.DEBUG;
  process.env.DEBUG = 'trello:create-board';
  try {
    const { stdout } =
      await $`node ${path.resolve(__dirname, 'create-board.mjs')} ${boardName}`;
    cliBoard = JSON.parse(stdout);
    is(typeof cliBoard.id, 'string');
    is(cliBoard.name, boardName);
  } finally {
    if (oldDebug) {
      process.env.DEBUG = oldDebug;
    } else {
      delete process.env.DEBUG;
    }
  }
});

// Cleanup resources after tests
test.after(async () => {
  if (cliBoard?.id) {
    await axios.delete(`${apiBase}/boards/${cliBoard.id}`, {
      params: { key, token },
    });
  }
  if (board?.id) {
    await axios.delete(`${apiBase}/boards/${board.id}`, {
      params: { key, token },
    });
  }
});

test.run();
