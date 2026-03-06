[![Open in Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-f29718?logo=gitpod)](https://gitpod.io/#https://github.com/konard/trello-api-tools)
[![Open in GitHub Codespaces](https://img.shields.io/badge/GitHub%20Codespaces-Open-181717?logo=github)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=konard/trello-api-tools)

# trello-api-tools

A collection of Node.js tools for working with the Trello API (https://developer.atlassian.com/cloud/trello/rest/). These tools help you download cards with metadata, comments, attachments, and checklists, plus create boards, lists, and cards.

## 🚀 Quick Start

```bash
# Set up environment
export TRELLO_API_KEY="your-api-key"
export TRELLO_API_TOKEN="your-api-token"

# Download a single card by ID or URL
node download-card.mjs "abc123shortlink" --stdout-only

# Download card by Trello URL
node download-card.mjs "https://trello.com/c/abc123shortlink" --stdout-only
```

## 📥 download-card.mjs

Downloads Trello cards and converts them to Markdown format with metadata, comments, attachments, and checklists.

### Features

- **📝 Markdown Export**: Converts cards to Markdown
- **✅ Checklist Support**: Handles all checklist items with completion status
- **📎 Attachment Downloads**: Downloads attachments or keeps direct links
- **💬 Comments Export**: Includes all card comments with metadata
- **🔗 URL Parsing**: Accepts card IDs or Trello card URLs
- **📊 Metadata**: Card status, labels, due dates, and more

### Usage

#### Basic Usage

```bash
# Download card by ID/short link
node download-card.mjs abc123shortlink

# Download card by Trello URL
node download-card.mjs "https://trello.com/c/abc123shortlink"

# Download with API key/token override
node download-card.mjs abc123shortlink --key your-key --token your-token

# Output to stdout instead of files
node download-card.mjs "https://trello.com/c/abc123shortlink" --stdout-only

# Specify output directory
node download-card.mjs abc123shortlink --output-dir ./my-cards
```

#### Advanced Features

```bash
# Skip attachment downloads, keep direct Trello URLs
node download-card.mjs "https://trello.com/c/abc123shortlink" --skip-files-download

# Combine options
node download-card.mjs "https://trello.com/c/abc123shortlink" --skip-files-download --output-dir ./cards
```

### Output Structure

When downloading to files (without `--stdout-only`):

```
./data/
└── <card-id>/             # Card ID (e.g., "abc123shortlink")
    ├── card.md            # Main card in Markdown format
    ├── card.json          # Raw JSON card data
    ├── checklists.json    # Checklists data (if any)
    ├── comments/          # Individual comment files (sortable by creation date)
    │   ├── 2025-08-22-00-21-15-156.json
    │   └── ...
    └── files/             # Downloaded attachments (if not using --skip-files-download)
        ├── document.pdf
        └── image.png
```

### Markdown Output Format

Generated Markdown includes:

- **Header**: Card title as H1
- **Metadata**: ID, short link, board ID, list ID, labels, due dates
- **Description**: Card description
- **Checklists**: All checklist items with completion status
- **Comments**: All comments with timestamps and authors
- **Attachments**: Attachments as links/images

### Environment Variables

```bash
# Required
TRELLO_API_KEY=your-api-key-here
TRELLO_API_TOKEN=your-api-token-here

# Optional
TRELLO_API_BASE_URL=https://api.trello.com/1  # default
DEBUG=trello:*  # Enable debug logging
```

### CLI Options

| Option                  | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `--stdout-only`         | Output Markdown to stdout instead of files         |
| `--output-dir <dir>`    | Specify output directory (default: ./data)         |
| `--key <key>`           | API key (overrides environment variable)           |
| `--token <token>`       | API token (overrides environment variable)         |
| `--skip-files-download` | Don't download attachments, use direct Trello URLs |
| `--help`                | Show help message                                  |

### Programmatic Usage

```javascript
import { downloadCard } from './download-card.mjs';

// Basic usage
const { card, markdown, comments, checklists } = await downloadCard({
  cardId: 'abc123shortlink',
  key: 'your-key',
  token: 'your-token',
});

// With options
const result = await downloadCard({
  cardId: 'abc123shortlink',
  key: 'your-key',
  token: 'your-token',
  skipFiles: true,
  quiet: true, // Suppress error console output
});
```

## 🛠️ create-\*.mjs Scripts

Helper scripts for creating Trello resources programmatically:

### create-board.mjs

```bash
# Create a new board
node create-board.mjs "My New Board"
node create-board.mjs "My New Board" board-output.json
```

### create-list.mjs

```bash
# Create a list in a board
node create-list.mjs <boardId> "My List"
node create-list.mjs <boardId> "My List" list-output.json
```

### create-card.mjs

```bash
# Create a card in a list
node create-card.mjs <listId> "My Card Title"
node create-card.mjs <listId> "My Card Title" card-output.json
```

All create scripts support the same environment variables as download-card.mjs and will output the created resource data in JSON format.

## 🧪 Testing

```bash
# Run all tests
node test-download-card.mjs
node test-command-stream.mjs
node test-use-m.mjs
node test-axios-error-serialization.mjs

# Tests require environment variables to be set
# Creates temporary test resources and cleans them up
```

## 📚 API Reference

Built using the official [Trello REST API documentation](https://developer.atlassian.com/cloud/trello/rest/). Supports downloading cards with metadata, comments, attachments, and checklists, plus creating boards, lists, and cards.

## 🔑 Authentication

Trello uses API Key + Token authentication. Follow these exact steps to get your credentials:

### Step 1: Get your API Key

1. Log in to your Trello account at https://trello.com
2. Go to the Power-Ups admin page: https://trello.com/power-ups/admin
3. Click **"New"** to create a new Power-Up (you can name it anything, e.g. "My API Tools")
4. Fill in the required fields (Name, Workspace, etc.) and click **"Create"**
5. In your Power-Up settings, click the **"API Key"** tab
6. Click **"Generate a new API Key"** if no key exists yet
7. Copy the **API Key** shown on the page — this is your `TRELLO_API_KEY`

> **Note:** Your API Key is tied to your Trello account, not a specific board or workspace.

### Step 2: Generate a Token

1. With your API Key from Step 1, open the following URL in your browser (replace `YOUR_API_KEY` with your actual key):

   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY
   ```

2. Trello will show an authorization page — click the green **"Allow"** button
3. You will be redirected to a page showing your **Token** — copy it
4. This token is your `TRELLO_API_TOKEN`

> **Security Note:** Your token grants full access to your Trello account. Keep it secret and never commit it to version control. Revoke it immediately at https://trello.com/your/account/applications if it is ever exposed.

### Step 3: Set Environment Variables

```bash
export TRELLO_API_KEY="your-api-key-here"
export TRELLO_API_TOKEN="your-api-token-here"
```

Or copy `.env.example` to `.env` and fill in both values:

```bash
cp .env.example .env
# Edit .env and set TRELLO_API_KEY and TRELLO_API_TOKEN
```

### Verify your credentials

```bash
curl "https://api.trello.com/1/members/me?key=$TRELLO_API_KEY&token=$TRELLO_API_TOKEN"
```

This should return a JSON object with your Trello account information.
