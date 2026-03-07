#!/usr/bin/env node
/**
 * download-card.mjs
 * Fetches a Trello card by ID and outputs it as Markdown and JSON.
 * Usage:
 *   node download-card.mjs <cardId|url> [options]
 *   Examples:
 *     node download-card.mjs abc123def456
 *     node download-card.mjs https://trello.com/c/abc123def456
 *     node download-card.mjs abc123def456 --output-dir ./custom/path
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
const { writeFile, mkdir } = await import('node:fs/promises');
const { createWriteStream } = await use('node:fs');
const { fileURLToPath } = await use('node:url');
const pathModule = await use('node:path');
const path = pathModule.default || pathModule;

// Import debug for tracing via use-m
const debugModule = await use('debug@4.3.4');
const debug = debugModule.default || debugModule;
const log = debug('trello:download-card');

// Load environment variables from .env
const { config } = await use('dotenv@16.1.4');
config({ path: path.resolve(process.cwd(), '.env') });

// Import axios
const axiosModule = await use('axios@1.9.0');
const axios = axiosModule.default || axiosModule;

// Import yargs for CLI argument parsing
const yargsModule = await use('yargs@17.7.2');
const yargs = yargsModule.default || yargsModule;

/**
 * Download a file from URL to a local path.
 * @param {string} url - The file URL.
 * @param {string} filePath - The local file path.
 * @param {object} options - Download options.
 * @param {string} [options.key] - Trello API key for Authorization header.
 * @param {string} [options.token] - Trello API token for Authorization header.
 * @param {boolean} [options.verbose] - Log HTTP request/response details.
 */
async function downloadFile(url, filePath, { key, token, verbose } = {}) {
  const headers = {};
  if (key && token) {
    headers['Authorization'] = `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;
  }

  if (verbose) {
    console.error(`[verbose] GET ${url}`);
    console.error(`[verbose] Headers: Authorization: OAuth oauth_consumer_key="<redacted>", oauth_token="<redacted>"`);
  }
  log('downloadFile: GET %s', url);

  let response;
  try {
    response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers,
    });
    if (verbose) {
      console.error(`[verbose] Response status: ${response.status} ${response.statusText}`);
    }
    log('downloadFile: response status %d', response.status);
  } catch (err) {
    if (verbose) {
      const status = err.response?.status;
      const statusText = err.response?.statusText;
      console.error(`[verbose] Response error: ${status} ${statusText}`);
      if (err.response?.headers) {
        console.error(`[verbose] Response headers: ${JSON.stringify(err.response.headers, null, 2)}`);
      }
    }
    if (err.response?.data?.destroy) {
      err.response.data.destroy();
    }
    throw err;
  }

  const writer = createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', (err) => {
      writer.destroy();
      reject(err);
    });
    response.data.on('error', (err) => {
      writer.destroy();
      reject(err);
    });
    response.data.pipe(writer);
  });
}

/**
 * Parse card input (ID or URL) and extract card short ID.
 * @param {string} input - Card short ID or full Trello card URL.
 * @returns {{cardId: string}} - Extracted card ID.
 */
function parseCardInput(input) {
  // Handle Trello card URL format: https://trello.com/c/<shortLink>
  try {
    const url = new URL(input);
    if (url.hostname === 'trello.com' && url.pathname.startsWith('/c/')) {
      const parts = url.pathname.split('/');
      // /c/<shortLink> or /c/<shortLink>/<cardTitle>
      const shortLink = parts[2];
      if (shortLink) {
        return { cardId: shortLink };
      }
    }
  } catch {
    // Not a URL, treat as card ID
  }

  // Treat as direct card ID or short link
  const cardId = input.trim();
  if (!cardId) {
    throw new Error('Invalid card ID or URL');
  }
  return { cardId };
}

/**
 * Fetch actions (comments) for a Trello card.
 * @param {object} options
 * @param {string} options.cardId - The Trello card ID.
 * @param {string} options.key - API key.
 * @param {string} options.token - API token.
 * @param {string} options.apiBase - Base URL.
 * @returns {Promise<Array>} - Array of comment actions.
 */
async function fetchCardComments({ cardId, key, token, apiBase }) {
  log('fetchCardComments called with cardId=%s, apiBase=%s', cardId, apiBase);
  const url = `${apiBase}/cards/${cardId}/actions`;

  try {
    const response = await axios.get(url, {
      params: { key, token, filter: 'commentCard' },
    });
    log('Received %d comments', response.data.length);
    return response.data;
  } catch (err) {
    log('Failed to fetch comments: %O', err);
    return [];
  }
}

/**
 * Fetch checklists for a Trello card.
 * @param {object} options
 * @param {string} options.cardId - The Trello card ID.
 * @param {string} options.key - API key.
 * @param {string} options.token - API token.
 * @param {string} options.apiBase - Base URL.
 * @returns {Promise<Array>} - Array of checklists.
 */
async function fetchCardChecklists({ cardId, key, token, apiBase }) {
  log('fetchCardChecklists called with cardId=%s, apiBase=%s', cardId, apiBase);
  const url = `${apiBase}/cards/${cardId}/checklists`;

  try {
    const response = await axios.get(url, { params: { key, token } });
    log('Received %d checklists', response.data.length);
    return response.data;
  } catch (err) {
    log('Failed to fetch checklists: %O', err);
    return [];
  }
}

/**
 * Fetch attachments for a Trello card.
 * @param {object} options
 * @param {string} options.cardId - The Trello card ID.
 * @param {string} options.key - API key.
 * @param {string} options.token - API token.
 * @param {string} options.apiBase - Base URL.
 * @returns {Promise<Array>} - Array of attachments.
 */
async function fetchCardAttachments({ cardId, key, token, apiBase }) {
  log(
    'fetchCardAttachments called with cardId=%s, apiBase=%s',
    cardId,
    apiBase
  );
  const url = `${apiBase}/cards/${cardId}/attachments`;

  try {
    const response = await axios.get(url, { params: { key, token } });
    log('Received %d attachments', response.data.length);
    return response.data;
  } catch (err) {
    log('Failed to fetch attachments: %O', err);
    return [];
  }
}

/**
 * Generate a sortable filename from a comment's creation date.
 * @param {object} action - Action object with date timestamp.
 * @returns {string} - Filename in format YYYY-MM-DD-HH-MM-SS-mmm.json
 */
function getCommentFileName(action) {
  if (!action.date) {
    return `${action.id || 'unknown'}.json`;
  }

  const date = new Date(action.date);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}-${hour}-${minute}-${second}-${ms}.json`;
}

/**
 * Format a date to ISO-like format for comments: YYYY-MM-DD HH:MM:SS
 * @param {string|Date} dateString - Date string or Date object
 * @returns {string} - Formatted date string
 */
function formatCommentDate(dateString) {
  if (!dateString) {
    return 'Unknown date';
  }

  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Build markdown metadata section for a card.
 * @param {object} card - Trello card object.
 * @returns {string} - Markdown metadata lines.
 */
function buildCardMetadata(card) {
  let md = `# ${card.name}\n\n`;
  md += `- **ID**: ${card.id}\n`;
  if (card.shortLink) {
    md += `- **Short Link**: https://trello.com/c/${card.shortLink}\n`;
  }
  if (card.idBoard) {
    md += `- **Board ID**: ${card.idBoard}\n`;
  }
  if (card.idList) {
    md += `- **List ID**: ${card.idList}\n`;
  }
  if (card.closed) {
    md += `- **Status**: Archived\n`;
  }
  if (card.due) {
    md += `- **Due**: ${card.due}\n`;
  }
  if (card.dueComplete) {
    md += `- **Due Complete**: Yes\n`;
  }
  if (card.labels && card.labels.length > 0) {
    const labelNames = card.labels
      .map((l) => l.name || l.color)
      .filter(Boolean);
    if (labelNames.length > 0) {
      md += `- **Labels**: ${labelNames.join(', ')}\n`;
    }
  }
  return md;
}

/**
 * Build markdown checklists section.
 * @param {Array} checklists - Array of Trello checklist objects.
 * @returns {string} - Markdown checklists section.
 */
function buildChecklistsMarkdown(checklists) {
  if (!checklists || checklists.length === 0) {
    return '';
  }
  let md = '\n## Checklists\n\n';
  for (const checklist of checklists) {
    md += `### ${checklist.name}\n\n`;
    const items = checklist.checkItems || [];
    for (const item of items) {
      const checkbox = item.state === 'complete' ? '[x]' : '[ ]';
      const itemName = item.name || 'Unnamed item';
      md += `- ${checkbox} ${itemName}`;
      if (item.due) {
        md += ` (due: ${item.due})`;
      }
      md += '\n';
    }
    md += '\n';
  }
  return md;
}

/**
 * Build markdown comments section.
 * @param {Array} comments - Array of Trello action objects (commentCard type).
 * @returns {string} - Markdown comments section.
 */
function buildCommentsMarkdown(comments) {
  if (!comments || comments.length === 0) {
    return '';
  }
  let md = '\n## Comments\n\n';
  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  for (const action of sortedComments) {
    const author = action.memberCreator?.username
      ? `@${action.memberCreator.username}`
      : action.memberCreator?.fullName || 'Unknown';
    const date = formatCommentDate(action.date);
    md += `### By ${author} at ${date}\n\n`;
    md += action.data?.text || '';
    md += '\n\n';
  }
  return md;
}

/**
 * Build markdown attachments section.
 * @param {Array} attachments - Array of Trello attachment objects.
 * @param {boolean} skipFiles - Whether to use direct URLs instead of local paths.
 * @returns {string} - Markdown attachments section.
 */
function buildAttachmentsMarkdown(attachments, skipFiles) {
  if (!attachments || attachments.length === 0) {
    return '';
  }
  let md = '## Attachments\n\n';
  for (const attachment of attachments) {
    const fileName = attachment.name || `attachment_${attachment.id}`;
    const isImage = /\.(png|jpg|jpeg|gif|bmp|svg)$/i.test(fileName);
    md += `### ${fileName}\n\n`;
    md += `- **Source URL**: ${attachment.url}\n`;
    if (attachment.bytes) {
      md += `- **Size**: ${attachment.bytes} bytes\n`;
    }
    if (attachment.date) {
      md += `- **Created**: ${attachment.date}\n`;
    }
    if (skipFiles) {
      if (isImage) {
        md += `\n<img src="${attachment.url}" alt="${fileName}" />\n`;
      } else {
        md += `\n[${fileName}](${attachment.url})\n`;
      }
    } else {
      if (isImage) {
        md += `\n<img src="./files/${fileName}" alt="${fileName}" />\n`;
      } else {
        md += `\n[${fileName}](./files/${fileName})\n`;
      }
    }
    md += '\n';
  }
  return md;
}

/**
 * Log and optionally print an axios or generic error.
 * @param {Error} err - The error object.
 * @param {boolean} quiet - Whether to suppress console output.
 */
function handleDownloadError(err, quiet) {
  if (typeof err.toJSON === 'function') {
    log('AxiosError toJSON:', JSON.stringify(err.toJSON(), null, 2));
    if (!quiet) {
      console.error('AxiosError:', JSON.stringify(err.toJSON(), null, 2));
    }
  } else if (err.response?.data) {
    if (!quiet) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  } else if (!quiet) {
    console.error(err);
  }
}

/**
 * Download Trello card data and convert to Markdown.
 * @param {object} options
 * @param {string} options.cardId - The Trello card ID or short link.
 * @param {string} [options.key] - API key.
 * @param {string} [options.token] - API token.
 * @param {string} [options.apiBase] - Base URL.
 * @param {boolean} [options.skipFiles=false] - Whether to skip file downloads and use direct URLs.
 * @param {boolean} [options.quiet=false] - Whether to suppress error console output.
 * @returns {Promise<{card: object, markdown: string, comments: Array, checklists: Array}>} - Card data and markdown.
 */
export async function downloadCard(options) {
  const {
    cardId,
    key = process.env.TRELLO_API_KEY,
    token = process.env.TRELLO_API_TOKEN,
    skipFiles = false,
    quiet = false,
  } = options;
  const apiBase =
    options.apiBase ||
    process.env.TRELLO_API_BASE_URL ||
    'https://api.trello.com/1';

  log('downloadCard called with cardId=%s, apiBase=%s', cardId, apiBase);
  if (!cardId) {
    throw new Error('cardId is required');
  }
  if (!key) {
    throw new Error('Set environment variable TRELLO_API_KEY');
  }
  if (!token) {
    throw new Error('Set environment variable TRELLO_API_TOKEN');
  }
  const url = `${apiBase}/cards/${cardId}`;
  log('Fetching card at %s', url);
  try {
    const response = await axios.get(url, { params: { key, token } });
    log('Received card data: %O', response.data);
    const card = response.data;

    const comments = await fetchCardComments({ cardId, key, token, apiBase });
    const checklists = await fetchCardChecklists({
      cardId,
      key,
      token,
      apiBase,
    });
    const attachments = await fetchCardAttachments({
      cardId,
      key,
      token,
      apiBase,
    });

    let md = buildCardMetadata(card);
    md += `\n## Description\n\n`;
    md += card.desc || '';
    log('Added description to Markdown');
    md += '\n';
    md += buildChecklistsMarkdown(checklists);
    md += buildCommentsMarkdown(comments);
    md += buildAttachmentsMarkdown(attachments, skipFiles);

    return { card, markdown: md, comments, checklists };
  } catch (err) {
    handleDownloadError(err, quiet);
    throw err;
  }
}

/**
 * Save attachments to local files or skip based on argv flags.
 * @param {object} options
 * @param {Array} options.attachments - Array of attachment objects.
 * @param {string} options.filesDir - Path to the files directory.
 * @param {string} options.cardId - The Trello card ID (for constructing download URLs).
 * @param {string} options.apiBase - The API base URL.
 * @param {object} options.argv - Parsed CLI arguments.
 */
async function saveAttachments({ attachments, filesDir, cardId, apiBase, argv }) {
  if (!attachments || attachments.length === 0) {
    return;
  }
  if (argv.skipFilesDownload) {
    console.log(
      `\n✓ Skipping ${attachments.length} attachment(s) (using direct URLs)`
    );
    return;
  }
  await mkdir(filesDir, { recursive: true });
  console.log(`\n✓ Downloading ${attachments.length} attachment(s):`);
  for (const attachment of attachments) {
    const fileName = attachment.name || `attachment_${attachment.id}`;
    const filePath = path.join(filesDir, fileName);
    // Use the authenticated Trello API download endpoint instead of the raw attachment URL.
    // Trello changed attachment hosting in 2021: direct S3 URLs with query params no longer work.
    // The correct endpoint requires Authorization header with OAuth credentials.
    // See: https://community.developer.atlassian.com/t/update-authenticated-access-to-s3/43681
    const downloadUrl = attachment.id && cardId
      ? `${apiBase}/cards/${cardId}/attachments/${attachment.id}/download/${encodeURIComponent(fileName)}`
      : attachment.url;
    try {
      await downloadFile(downloadUrl, filePath, {
        key: argv.key,
        token: argv.token,
        verbose: argv.verbose,
      });
      console.log(`  - Downloaded: ./${filePath}`);
    } catch (err) {
      console.error(`  - Failed to download ${fileName}: ${err.message}`);
    }
  }
}

// If run as CLI
const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = path.resolve(process.cwd(), process.argv[1] || '');
if (invokedPath === currentFilePath) {
  const argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 <cardId|url> [options]')
    .positional('card', {
      describe: 'Card ID or full Trello card URL',
      type: 'string',
      demandOption: true,
    })
    .option('output-dir', {
      alias: 'o',
      describe: 'Output directory (default: ./data/<card-id>/)',
      type: 'string',
    })
    .option('key', {
      alias: 'k',
      describe: 'API key (defaults to TRELLO_API_KEY env var)',
      type: 'string',
      default: process.env.TRELLO_API_KEY,
    })
    .option('token', {
      alias: 't',
      describe: 'API token (defaults to TRELLO_API_TOKEN env var)',
      type: 'string',
      default: process.env.TRELLO_API_TOKEN,
    })
    .option('stdout-only', {
      alias: 's',
      describe: 'Output only markdown to stdout (no files created)',
      type: 'boolean',
      default: false,
    })
    .option('skip-files-download', {
      alias: 'f',
      describe: 'Skip downloading files and use direct Trello URLs instead',
      type: 'boolean',
      default: false,
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Enable verbose output: log HTTP requests and responses for debugging',
      type: 'boolean',
      default: false,
    })
    .help()
    .alias('help', 'h').argv;

  const cardInput = argv._[0];
  log('CLI invoked with cardInput=%s, outputDir=%s', cardInput, argv.outputDir);

  if (!cardInput) {
    console.error('Error: Card ID or URL is required');
    process.exit(1);
  }

  try {
    const { cardId } = parseCardInput(String(cardInput));

    // If stdout-only mode, just output the markdown and exit
    if (argv.stdoutOnly) {
      const { markdown } = await downloadCard({
        cardId,
        key: argv.key,
        token: argv.token,
        skipFiles: argv.skipFilesDownload,
      });
      console.log(markdown);
      process.exit(0);
    }

    // Determine output directory
    const outputDir = argv.outputDir || path.join('./data', cardId);

    // Regular single card download
    const { card, markdown, comments, checklists } = await downloadCard({
      cardId,
      key: argv.key,
      token: argv.token,
      skipFiles: argv.skipFilesDownload,
    });

    // Create directory structure
    await mkdir(outputDir, { recursive: true });
    const filesDir = path.join(outputDir, 'files');
    if (
      card.attachments &&
      card.attachments.length > 0 &&
      !argv.skipFilesDownload
    ) {
      await mkdir(filesDir, { recursive: true });
    }
    const commentsDir = path.join(outputDir, 'comments');
    if (comments && comments.length > 0) {
      await mkdir(commentsDir, { recursive: true });
    }
    log('Created directory: %s', outputDir);

    // Save both files
    const mdPath = path.join(outputDir, 'card.md');
    const jsonPath = path.join(outputDir, 'card.json');

    await writeFile(mdPath, markdown, 'utf-8');
    await writeFile(jsonPath, JSON.stringify(card, null, 2), 'utf-8');

    console.log(`✓ Card downloaded successfully:`);
    console.log(`  - Markdown: ./${mdPath}`);
    console.log(`  - JSON: ./${jsonPath}`);

    // Save comments as individual JSON files
    if (comments && comments.length > 0) {
      console.log(`\n✓ Saving ${comments.length} comment(s):`);
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        const commentFileName = getCommentFileName(comment);
        const commentPath = path.join(commentsDir, commentFileName);
        await writeFile(commentPath, JSON.stringify(comment, null, 2), 'utf-8');
        console.log(`  - Saved: ./${commentPath}`);
      }
    }

    // Save checklists as JSON if any
    if (checklists && checklists.length > 0) {
      const checklistsPath = path.join(outputDir, 'checklists.json');
      await writeFile(
        checklistsPath,
        JSON.stringify(checklists, null, 2),
        'utf-8'
      );
      console.log(
        `\n✓ Saved ${checklists.length} checklist(s): ./${checklistsPath}`
      );
    }

    // Download all attachments (only if not skipping files)
    const attachmentsApiBase = process.env.TRELLO_API_BASE_URL || 'https://api.trello.com/1';
    const attachments = await fetchCardAttachments({
      cardId,
      key: argv.key,
      token: argv.token,
      apiBase: attachmentsApiBase,
    });
    await saveAttachments({ attachments, filesDir, cardId, apiBase: attachmentsApiBase, argv });
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
