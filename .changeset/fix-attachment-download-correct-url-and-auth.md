---
'trello-api-tools': patch
---

fix: use correct Trello download endpoint and Authorization header for attachments

- Use `/cards/{id}/attachments/{id}/download/{filename}` endpoint instead of raw attachment URL (Trello disabled direct S3 URLs with query params in January 2021)
- Pass credentials via `Authorization: OAuth` header instead of query parameters
- Add `--verbose` (`-v`) flag to log HTTP request URLs and response statuses for debugging
