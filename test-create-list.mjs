#!/usr/bin/env node
/**
 * test-create-list.mjs
 * E2E tests for createList function and CLI.
 * Usage: node test-create-list.mjs
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
const { createList } = await use('./create-list.mjs');

// Load Node.js built-in modules
const { fileURLToPath } = await use('node:url');
const pathModule = await use('node:path');
const path = pathModule.default || pathModule;

// Load command-stream for CLI testing
const commandStreamModule = await use('command-stream@0.3.0');
const { $ } = commandStreamModule;

// Load environment variables from .env
const { config } = await use('dotenv@16.1.4');
config({ path: path.resolve(process.cwd(), '.env') });

// Enable debug tracing
process.env.DEBUG = process.env.DEBUG
  ? `${process.env.DEBUG},trello:*`
  : 'trello:*';

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

let board, list, cliList;
let boardName, listName;

// Setup: create board
test.before(async () => {
  const ts = Date.now();
  boardName = `test-board-${ts}`;
  listName = `test-list-${ts}`;
  board = await createBoard({ name: boardName, key, token, apiBase });
  console.log('Setup complete: board.id=', board.id);
});

// Test function export
test('function export: createList returns a list with id and correct name', async () => {
  console.log(
    'Function test: calling createList with boardId=',
    board.id,
    'name=',
    listName
  );
  list = await createList({
    boardId: board.id,
    name: listName,
    key,
    token,
    apiBase,
  });
  console.log('Function test: createList returned', list);
  is(typeof list.id, 'string');
  is(list.name, listName);
});

// Test CLI
test('CLI: create-list CLI outputs matching JSON', async () => {
  console.log(
    'CLI test: invoking create-list CLI with boardId=',
    board.id,
    'name=',
    listName
  );
  const { stdout } =
    await $`node ${path.resolve(__dirname, 'create-list.mjs')} ${board.id} ${listName}`;
  console.log('CLI test: stdout =', stdout);
  cliList = JSON.parse(stdout);
  console.log('CLI test: parsed =', cliList);
  is(typeof cliList.id, 'string');
  is(cliList.name, listName);
});

// Cleanup
test.after(async () => {
  // Archive created lists (Trello doesn't support hard-deleting lists)
  if (cliList?.id) {
    try {
      await axios.put(`${apiBase}/lists/${cliList.id}/closed`, null, {
        params: { key, token, value: true },
      });
    } catch {
      // ignore errors archiving list
    }
  }
  if (list?.id) {
    try {
      await axios.put(`${apiBase}/lists/${list.id}/closed`, null, {
        params: { key, token, value: true },
      });
    } catch {
      // ignore errors archiving list
    }
  }
  // Delete board
  if (board?.id) {
    await axios.delete(`${apiBase}/boards/${board.id}`, {
      params: { key, token },
    });
  }
});

test.run();
