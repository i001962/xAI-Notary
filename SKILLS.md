# xAI-Notary Agent Notes

This repository is a small CLI demo, not a product application. Keep changes tight and focused on the end-to-end notarization flow.

## Core Flow

1. Prompt the user for a question.
2. Send the prompt to Grok via `@ai-sdk/xai`.
3. Hash both the prompt and the response with SHA-256.
4. Register both hashes with Horizon using `individualSeal`.
5. Poll `getseal` until each document is complete and inserted into at least one blockchain.
6. Save prompt/response text and seal artifacts under `artifacts/<timestamp>/`.
7. Verify the saved artifacts with `POST /verifyseal`.

## Important Implementation Details

- Main entrypoint: `demo.js`
- Model currently used: `grok-3-mini`
- Horizon auth currently uses `X-API-Key: <api key><space><api secret>`
- Horizon request bodies are sent as `application/x-www-form-urlencoded`
- `verifyseal` expects:
  - `verifyDocHashes=<sha256 hash>`
  - `seals=<single seal object or JSON array of seals>`
  - `provideInstructions=true` when you want extra output
- Poll completion requires:
  - `doc.seal.isComplete === true`
  - `doc.hasBeenInsertedIntoAtLeastOneBlockchain === true`
- `insertedIntoBlockchainAt` and `submittedAt` are already in milliseconds
- Individual seal details such as proofs live under `doc.seal`
- Document status such as `hasBeenInsertedIntoAtLeastOneBlockchain` and `blockchainRegistrations` lives at the document level

## Relevant Cryptowerk Tutorial Takeaways

- `1-curl-helpers.md`
  - `jq` is useful for manual inspection and extraction of retrieval IDs or seals.
  - URL encoding matters when passing seal JSON through cURL.
- `3-register-with-callbacks.md`
  - Horizon supports webhook, email, and MQTT callbacks.
  - Callbacks can arrive in batches and over multiple blockchains at different times.
  - This repo intentionally does not use callbacks; it polls to stay self-contained.
- `4-retrieve-seal.md`
  - `retrievalId` is the handle used to poll `getseal`.
  - `blockchainRegistrations.bcExplorerUrls` are useful for demo output and third-party inspection.
- `5-verify-Seal.md`
  - A single hash can be verified with a single seal object.
  - Multiple hashes can be verified with a JSON array of seals.
  - Failed verification responses distinguish wrong document hash from manipulated seal content.
- `6-Independent-verification.md`
  - The seal can be verified without Cryptowerk by reproducing the hash path and checking the final anchor against a blockchain explorer.
  - The original document never needs to leave the client; only the hash is registered.
- `7-seal-Formats.md`
  - `getseal` can return experimental visualization wrappers like `certificateHTML`, `certificatePDF`, and `QRWithSeal`.
  - Those wrapper calls may work as `POST` or `GET`, but query-string forms often need URL encoding.
  - Public access to wrapper outputs may require `publiclyRetrievable=true`; otherwise auth headers are still needed.
- `8-bulk-seals.md`
  - `bulkSeal` mode is optimized for large batches and storage efficiency.
  - `hashSequenceKnown=true` lets a client omit already-known hash lists from bulk seal responses.
  - This repo should remain on `individualSeal` unless the demo is explicitly redesigned around bulk proof semantics.

## CLI Modes

- Demo mode: `node demo.js`
- Verify saved artifacts: `node demo.js verify artifacts/<run-directory>`

## Expected Artifact Files

Each run directory should contain:

- `prompt.txt`
- `response.txt`
- `prompt-seal.json`
- `response-seal.json`
- `meta.json`

`artifacts/` is generated output and should remain ignored by git.

## Change Guidance

- Preserve the repo as a self-contained demo.
- Prefer simple terminal output over framework or service abstraction.
- If you change Horizon request shapes, verify against the current API behavior rather than relying only on Swagger field labels.
- Keep README in sync with CLI behavior whenever commands, artifacts, or verification flow change.
- Do not add Makers Mint guidance; that tutorial is no longer supported for this repo's documentation.
