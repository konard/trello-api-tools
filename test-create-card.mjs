#!/usr/bin/env node
/**
 * test-create-card.mjs
 * E2E tests for createBoard, createList, and createCard functions and CLIs.
 * Usage: node test-create-card.mjs
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
const { createCard } = await use('./create-card.mjs');

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
// Enable debug tracing from create-*.mjs modules
process.env.DEBUG = process.env.DEBUG
  ? `${process.env.DEBUG},trello:*`
  : 'trello:*';
console.log('Debugging enabled for tests:', process.env.DEBUG);

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
let list;
let card;
let cliCard;
let boardName;
let listName;
let cardName;

// Setup test data
test.before(async () => {
  const timestamp = Date.now();
  boardName = `test-board-${timestamp}`;
  listName = `test-list-${timestamp}`;
  cardName = `test-card-${timestamp}`;
  board = await createBoard({ name: boardName, key, token, apiBase });
  list = await createList({
    boardId: board.id,
    name: listName,
    key,
    token,
    apiBase,
  });
  console.log('Setup complete: board.id=', board.id, 'list.id=', list.id);
});

// Note: board and list are created in before hook
// Test card creation (function)
test('function export: createCard returns a card with id and correct name', async () => {
  console.log(
    'Function test: calling createCard with listId=',
    list.id,
    ', name=',
    cardName
  );
  card = await createCard({
    listId: list.id,
    name: cardName,
    key,
    token,
    apiBase,
  });
  console.log('Function test: createCard returned', card);
  is(typeof card.id, 'string');
  is(card.name, cardName);
});

// Test CLI for card
test('CLI: create-card CLI outputs matching JSON', async () => {
  console.log(
    'CLI test: invoking create-card CLI with listId=',
    list.id,
    ' name=',
    cardName
  );
  const { stdout } =
    await $`node ${path.resolve(__dirname, 'create-card.mjs')} ${list.id} ${cardName}`;
  console.log('CLI test: stdout from create-card CLI:', stdout);
  cliCard = JSON.parse(stdout);
  console.log('CLI test: parsed CLI output:', cliCard);
  is(typeof cliCard.id, 'string');
  is(cliCard.name, cardName);
});

// Cleanup resources after tests
test.after(async () => {
  // Delete cards
  if (cliCard?.id) {
    await axios.delete(`${apiBase}/cards/${cliCard.id}`, {
      params: { key, token },
    });
  }
  if (card?.id) {
    await axios.delete(`${apiBase}/cards/${card.id}`, {
      params: { key, token },
    });
  }
  // Delete board (lists are deleted automatically)
  if (board?.id) {
    await axios.delete(`${apiBase}/boards/${board.id}`, {
      params: { key, token },
    });
  }
});

test.run();
