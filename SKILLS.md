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
- Poll completion requires:
  - `doc.seal.isComplete === true`
  - `doc.hasBeenInsertedIntoAtLeastOneBlockchain === true`
- `insertedIntoBlockchainAt` and `submittedAt` are already in milliseconds

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
