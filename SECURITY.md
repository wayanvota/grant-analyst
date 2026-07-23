# Security

Do not place `OPENAI_API_KEY`, `DATABASE_URL`, `SESSION_PEPPER`, or any other
secret in `frontend/`, `public/`, Git history, or FTP uploads.

The hosted frontend stores a random bearer session in the visitor's browser.
The backend stores only a peppered SHA-256 derivative. Anyone who obtains the
browser value can access that browser's workspaces, so the public demo should
not be used for confidential proposals without adding full authentication.

Uploaded files are sent to the OpenAI Files API and referenced from Neon by
file ID. Removing a document or workspace requests deletion of the associated
OpenAI file.

Report vulnerabilities privately to the repository owner instead of opening a
public issue containing exploit details.
