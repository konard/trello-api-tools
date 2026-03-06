---
'trello-api-tools': patch
---

fix: resolve 401 error and process hang when downloading card attachments

- Always pass API key and token as query params when downloading attachments, preventing 401 Unauthorized errors
- Properly destroy the write stream and response data stream on error to prevent the process from hanging indefinitely after a failed attachment download
