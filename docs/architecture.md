# Architecture and threat model

## Trust boundaries

The frontend is public and untrusted. Visitors can inspect and modify every
request it sends. It therefore contains only the Render API URL and a random
browser session token.

The Render API is the security boundary. It validates ownership, file types,
sizes, quotas, and allowed origins before calling Neon or OpenAI.

Neon stores structured state and review history. It stores OpenAI file IDs, not
raw uploaded file bytes.

OpenAI receives uploaded source files and performs structured analysis.
Deleting a document or workspace requests deletion of the associated OpenAI
file.

## Browser sessions

On first use, the frontend generates 256 random bits and stores the value in
local storage. The backend combines it with `SESSION_PEPPER` and stores only a
SHA-256 derivative as the owner key.

This design avoids accounts for an open demo, but it has clear limits:

- clearing browser storage loses workspace access
- copying the browser token transfers access
- it does not provide organizational identity, MFA, or recovery

Add real authentication before using the service for confidential grant
materials.

## Background reviews

The API records a queued review in Neon and processes it after returning HTTP
202. The frontend polls the review record for stage changes.

The analysis uses two layers. Layer one runs proposal extraction and due
diligence alongside public funder research. Funder research is cached in Neon
for 14 days, and concurrent reviews for the same opportunity share a single
research request. Layer two combines skeptical reviewer simulation, final
adjudication, citation audit, and revision ranking.

Each OpenAI request has a strict time budget. If a layer misses its budget, the
API returns a conservative structured safeguard result marked `partial`, with
the limitation visible in the interface and exported report. The application
does not silently treat a timeout as a complete assessment.

This MVP runs jobs inside the Render web process. A deployment or process
failure can interrupt an active review. On startup, the API marks abandoned
reviews as failed. A higher-volume production system should use a durable queue
and a separate worker.

## Public deployment risks

The main risk is cost abuse, followed by sensitive file submission. The public
demo limits reviews per browser and globally, rate-limits requests by IP, and
caps file count and size. These controls reduce abuse but do not eliminate it.
Monitor OpenAI usage and Render logs, and disable the service if unexpected
traffic appears.
