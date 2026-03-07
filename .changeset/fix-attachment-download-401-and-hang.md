---
'trello-api-tools': patch
---

fix: resolve 401 error and process hang when downloading card attachments

- Use Trello's authenticated download endpoint (`/cards/{id}/attachments/{id}/download/{name}`) instead of the raw attachment URL, which stopped working after Trello's 2021 S3 authentication changes
- Pass API credentials via `Authorization: OAuth` header instead of query parameters, which is the correct method for the download endpoint
- Add `--verbose` (`-v`) flag to log HTTP request URLs and response statuses for debugging attachment download issues
- Properly destroy the write stream and response data stream on error to prevent the process from hanging indefinitely after a failed attachment download
