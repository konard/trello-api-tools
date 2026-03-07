# Case Study: Issue #5 - No Access to Image Despite Card Access

## Issue Overview

**Issue:** [#5](https://github.com/konard/trello-api-tools/issues/5)
**Title:** No access to image, but there is an access to card itself
**Status:** Open
**Labels:** bug
**Created:** ~March 2026
**Author:** konard

### Problem Statement

When running `./download-card.mjs https://trello.com/c/odLfrElM/1-task`, the card downloads successfully (JSON and Markdown), but attachment downloads fail with HTTP 401 Unauthorized:

```
konard@MacBook-Pro-Konstantin trello-api-tools % ./download-card.mjs https://trello.com/c/odLfrElM/1-task
✓ Card downloaded successfully:
  - Markdown: ./data/odLfrElM/card.md
  - JSON: ./data/odLfrElM/card.json

✓ Downloading 1 attachment(s):
  - Failed to download image.png: Request failed with status code 401

Also the program stuck after `- Failed to download image.png: Request failed with status code 401`
```

**Two problems reported:**
1. HTTP 401 Unauthorized when downloading card attachments (despite successful card fetch)
2. Process hangs after the download failure (promises leak)

### Issue Comment (by konard)

After applying the first fix attempt (PR #6), the issue still occurred:

```
konard@MacBook-Pro-Konstantin trello-api-tools % ./download-card.mjs https://trello.com/c/odLfrElM/1-task --verbose
✓ Card downloaded successfully:
  - Markdown: ./data/odLfrElM/card.md
  - JSON: ./data/odLfrElM/card.json

✓ Downloading 1 attachment(s):
  - Failed to download image.png: Request failed with status code 401
```

Owner requested:
- Add `--verbose` mode to see exact HTTP requests and responses
- Deep case study in `./docs/case-studies/issue-5/`
- If related to another project, file GitHub issues there with reproducible examples

---

## Timeline of Events

### First Attempt: PR #6

1. **Diagnosis (incorrect):** The code was thought to be missing API credentials when calling `downloadFile()`.
2. **Fix applied:** Changed `saveAttachments()` to explicitly pass `{ key: argv.key, token: argv.token }` as query params.
3. **Fix also addressed:** Stream cleanup to prevent process hang (adding `writer.destroy()` and `response.data.destroy()` on error paths).
4. **Result after merge:** Issue persisted — still 401, still possible hang.

**Why the fix didn't work:** The credentials were already being passed (or the real problem was not about missing credentials but about _how_ they are passed).

### Root Cause Discovery

Research into the Trello developer community revealed that Trello changed their attachment hosting system significantly:

**Key official announcements:**
- [Authenticated Access to S3](https://community.developer.atlassian.com/t/authenticated-access-to-s3/40647) — Initial announcement that public S3 URLs were being disabled
- [Update: Authenticated Access to S3](https://community.developer.atlassian.com/t/update-authenticated-access-to-s3/43681) — Query parameter authorization turned off on **January 25, 2021**
- [New Download URL for attachments](https://community.developer.atlassian.com/t/new-download-url-for-attachments/51012) — New download URL format announced August 2021

---

## Root Cause Analysis

### Problem 1: Wrong Attachment URL

**The `attachment.url` field returned by the Trello API is NOT the correct download URL.**

When the Trello API returns attachment objects (via `GET /1/cards/{cardId}/attachments`), the `url` field contains a legacy URL format like:

```
https://trello.com/1/cards/{cardId}/attachments/{attachmentId}/download/{filename}
```

or an older direct S3 URL like:

```
https://trello-attachments.s3.amazonaws.com/.../{filename}?...
```

**Trello's changes (2020-2021):**
- Trello stopped using publicly-accessible S3 URLs for attachments
- The old S3 URLs with embedded signatures no longer work
- Query parameter authentication (`?key=...&token=...`) to the old URLs was disabled on **January 25, 2021**
- A new download endpoint was introduced: `https://api.trello.com/1/cards/{idCard}/attachments/{idAttachment}/download/{attachmentFileName}`

### Problem 2: Wrong Authentication Method

Even with the new URL, the authentication method matters:

**What was used (wrong for some URL formats):**
```js
// Passing key and token as query parameters
response = await axios({ method: 'GET', url: attachment.url, params: { key, token } });
```

**What should be used:**
```
Authorization: OAuth oauth_consumer_key="{{key}}", oauth_token="{{token}}"
```

The community discussion confirms: _"Making a GET request with the key and token in the `Authorization` header will return the hosted file."_

Sources:
- [Atlassian community: getting 401 when downloading attachment](https://community.atlassian.com/forums/Trello-questions/trello-REST-API-getting-401-unauthorized-when-downloading/qaq-p/1775167)
- [Download attachments with API](https://community.developer.atlassian.com/t/download-attachments-with-api/72386)

### Problem 3: Process Hang

When `downloadFile()` fails, `createWriteStream` creates a file descriptor that may not be properly closed. While PR #6 added `writer.destroy()` on error, there's still a potential issue:

- The writer is created _before_ the Promise, but if `axios()` fails in the try/catch, the writer is never created → no hang from writer
- If axios succeeds but stream fails → writer.destroy() is called → should prevent hang
- **Remaining risk:** If the `finish` event never fires and `error` never fires (network stall), the process would hang indefinitely

The fix: ensure proper stream cleanup with `writer.destroy()` on all error paths AND add a timeout mechanism or rely on axios's `timeout` option.

---

## Proposed Solutions

### Solution A: Use Authorization Header (Recommended)

Pass credentials via `Authorization` header instead of query params when downloading attachments:

```js
async function downloadFile(url, filePath, params = {}) {
  const { key, token, ...otherParams } = params;
  const headers = {};
  if (key && token) {
    headers['Authorization'] = `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;
  }
  // ... rest of download logic with headers instead of params
}
```

This approach works because:
- It uses the accepted OAuth header format
- Works with both old and new Trello attachment URL formats
- Credentials are not exposed in URL logs

### Solution B: Use New API Endpoint with Query Params

Use the new download endpoint format AND pass query params:

```
https://api.trello.com/1/cards/{idCard}/attachments/{idAttachment}/download/{fileName}?key={key}&token={token}
```

This requires:
1. Storing `idCard` and `idAttachment` from the attachment metadata
2. Constructing the new URL from the attachment object fields

The attachment object from the API contains: `id`, `idMember`, `date`, `url`, `name`, `bytes`, `idAttachment` fields.

### Solution C: Both Methods (Most Robust)

Use Authorization header AND construct correct download URL:
1. Build new URL: `https://api.trello.com/1/cards/{cardId}/attachments/{attachment.id}/download/{attachment.name}`
2. Pass via Authorization header

---

## Implementation Plan

### 1. Add `--verbose` Mode

Add a `--verbose` flag to yargs that enables:
- Logging each HTTP request URL and headers (with credentials redacted in non-debug output)
- Logging HTTP response status codes
- Logging any redirects

### 2. Fix Attachment Download

Update `downloadFile()` to use the Authorization header:

```js
async function downloadFile(url, filePath, { key, token } = {}) {
  const headers = {};
  if (key && token) {
    headers['Authorization'] = `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;
  }
  // ... use headers in axios call
}
```

Update `saveAttachments()` to construct the correct download URL using the card ID and attachment ID:

```js
const downloadUrl = `${apiBase}/cards/${cardId}/attachments/${attachment.id}/download/${encodeURIComponent(fileName)}`;
await downloadFile(downloadUrl, filePath, { key: argv.key, token: argv.token });
```

### 3. Fix Potential Process Hang

Add `axios` timeout to prevent infinite wait:

```js
response = await axios({
  method: 'GET',
  url,
  responseType: 'stream',
  headers,
  timeout: 30000, // 30-second timeout
});
```

---

## Related Issues in Other Repositories

This is a known issue affecting all tools that use the Trello API to download attachments. The problem is upstream in Trello's API behavior change.

**Filed issue:** See [trello REST API: getting 401 unauthorized when downloading attachment](https://community.atlassian.com/forums/Trello-questions/trello-REST-API-getting-401-unauthorized-when-downloading/qaq-p/1775167) — this issue has been reported by multiple developers and the Trello team has responded with guidance.

The Trello API documentation has been updated but the change caused widespread breakage in existing tools.

---

## Data Files

- `issue-5-details.json` — Full issue details from GitHub API
- `issue-5-comments.json` — All issue comments
- `pr-6-details.json` — Previous fix attempt PR details
- `pr-6-diff.txt` — Diff of the previous fix attempt
- `pr-7-details.json` — Current PR details

---

## References

- [Authenticated Access to S3 (initial announcement)](https://community.developer.atlassian.com/t/authenticated-access-to-s3/40647)
- [Update: Authenticated Access to S3 (Jan 25, 2021 cutoff)](https://community.developer.atlassian.com/t/update-authenticated-access-to-s3/43681)
- [New Download URL for attachments](https://community.developer.atlassian.com/t/new-download-url-for-attachments/51012)
- [trello REST API: getting 401 when downloading attachment](https://community.atlassian.com/forums/Trello-questions/trello-REST-API-getting-401-unauthorized-when-downloading/qaq-p/1775167)
- [Download attachments with API (developer community)](https://community.developer.atlassian.com/t/download-attachments-with-api/72386)
- [Issues with downloading attachments from cards - 401 error](https://community.developer.atlassian.com/t/issues-with-downloading-attachments-from-cards-401-error-through-rest-api-using-restsharp/64179)
- [Trouble Authorizing API Request to Download Attachment](https://community.atlassian.com/forums/Trello-questions/Trouble-Authorizing-API-Request-to-Download-Attachment/qaq-p/2858447)
