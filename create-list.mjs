#!/usr/bin/env node
/**
 * create-list.mjs
 * Creates a Trello list under a board and outputs it as JSON.
 * Usage:
 *   node create-list.mjs <boardId> <listName> [outputFile]
 * Environment Variables:
 *   TRELLO_API_KEY - API key for authentication.
 *   TRELLO_API_TOKEN - API token for authentication.
 *   TRELLO_API_BASE_URL - Base URL for the API (default: https://api.trello.com/1).
 */

// Dynamically load use-m
const { use } = eval(
  await fetch('https://unpkg.com/use-m/use.js').then((u) => u.text())
);

// Load Node.js built-in modules
const { writeFile } = await use('node:fs/promises');
const { fileURLToPath } = await use('node:url');
const pathModule = await use('node:path');
const path = pathModule.default || pathModule;

// Import debug for tracing via use-m
const debugModule = await use('debug@4.3.4');
const debug = debugModule.default || debugModule;
const log = debug('trello:create-list');

// Load environment variables from .env
const { config } = await use('dotenv@16.1.4');
config({ path: path.resolve(process.cwd(), '.env') });

// Import axios
const axiosModule = await use('axios@1.9.0');
const axios = axiosModule.default || axiosModule;

/**
 * Create a Trello list under a given board.
 * @param {object} options
 * @param {string} options.boardId - ID of the board to attach the list to.
 * @param {string} options.name - Name of the list.
 * @param {string} [options.key] - API key.
 * @param {string} [options.token] - API token.
 * @param {string} [options.apiBase] - Base URL.
 * @returns {Promise<object>} - Created list object.
 */
export async function createList({
  boardId,
  name,
  key = process.env.TRELLO_API_KEY,
  token = process.env.TRELLO_API_TOKEN,
  apiBase = process.env.TRELLO_API_BASE_URL || 'https://api.trello.com/1',
}) {
  log(
    'createList called with boardId=%s, name=%s, apiBase=%s',
    boardId,
    name,
    apiBase
  );
  if (!boardId) {
    throw new Error('boardId is required');
  }
  if (!name) {
    throw new Error('name is required');
  }
  if (!key) {
    throw new Error('Set environment variable TRELLO_API_KEY');
  }
  if (!token) {
    throw new Error('Set environment variable TRELLO_API_TOKEN');
  }
  const url = `${apiBase}/lists`;
  log('Sending POST request to %s with payload %O', url, {
    idBoard: boardId,
    name,
  });
  try {
    const response = await axios.post(url, null, {
      params: { key, token, idBoard: boardId, name },
    });
    log('Received response: %O', response.data);
    return response.data;
  } catch (err) {
    if (typeof err.toJSON === 'function') {
      log('AxiosError toJSON:', JSON.stringify(err.toJSON(), null, 2));
      console.error('AxiosError:', JSON.stringify(err.toJSON(), null, 2));
    } else if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
    throw err;
  }
}

// If run as CLI
const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.cwd(), process.argv[1] || '');
if (invokedPath === currentFilePath) {
  const [, , boardId, name, outputFile] = process.argv;
  log(
    'CLI invoked with boardId=%s, name=%s, outputFile=%s',
    boardId,
    name,
    outputFile
  );
  if (!boardId || !name) {
    console.error('Usage: create-list.mjs <boardId> <listName> [outputFile]');
    process.exit(1);
  }
  try {
    const list = await createList({ boardId, name });
    const output = JSON.stringify(list, null, 2);
    if (outputFile) {
      await writeFile(outputFile, output, 'utf-8');
    } else {
      console.log(output);
    }
  } catch (err) {
    if (typeof err.toJSON === 'function') {
      console.error('AxiosError:', JSON.stringify(err.toJSON(), null, 2));
    } else if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    if (
      err.message === 'Set environment variable TRELLO_API_KEY' ||
      err.message === 'Set environment variable TRELLO_API_TOKEN'
    ) {
      console.error('');
      console.error('To get your Trello API credentials:');
      console.error(
        '  1. Get API Key: go to https://trello.com/power-ups/admin → create a Power-Up → API Key tab'
      );
      console.error(
        '  2. Get Token: open https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY → click Allow → copy the token'
      );
      console.error('  3. Set variables:');
      console.error('       export TRELLO_API_KEY="your-api-key"');
      console.error('       export TRELLO_API_TOKEN="your-token"');
      console.error(
        '  For full details see: https://github.com/konard/trello-api-tools#-authentication'
      );
    }
    process.exit(1);
  }
}
