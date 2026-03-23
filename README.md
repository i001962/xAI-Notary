# xAI-Notary

A CLI demo that asks Grok a question, hashes both the prompt and the response with SHA-256, registers both with the Cryptowerk Horizon SealAPI, saves the resulting artifacts locally, and verifies them against the returned seals.

## What It Does

1. Prompts you for a question via the terminal
2. Sends the question to **xAI Grok** using the Vercel AI SDK (`@ai-sdk/xai`)
3. Computes the **SHA-256 hash** of both the prompt and the response
4. **Registers** both hashes with Cryptowerk Horizon SealAPI (`/register`) using `individualSeal`
5. **Polls** Horizon until both documents are anchored on-chain (`/getseal`)
6. Saves prompt/response text plus their seals under `artifacts/<timestamp>/`
7. Calls Horizon `POST /verifyseal` for both saved artifacts
8. Prints the Grok answer, seal details, explorer links, and verification responses

## Setup

### Prerequisites

- Node.js 18+
- An [xAI API key](https://console.x.ai)
- A [Cryptowerk Horizon](https://developers.cryptowerk.com) account (API key + secret)

### Install

```bash
git clone https://github.com/i001962/xAI-Notary.git
cd xAI-Notary
npm install
```

### Configure environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```dotenv
XAI_API_KEY=your_xai_api_key_here
HORIZON_API_KEY=your_cryptowerk_api_key
HORIZON_API_SECRET=your_cryptowerk_api_secret
```

> **Never commit `.env` to git.** It is already listed in `.gitignore`.

## Run

```bash
node demo.js
# or
npm start
```

You will be prompted to enter a question. The script will call Grok, hash the prompt and response, register both with Horizon, wait for both blockchain anchors, save the resulting artifacts, and verify the saved artifacts against the returned seals.

## Verify Saved Artifacts

To rerun verification later without generating a new Grok response:

```bash
node demo.js verify artifacts/<run-directory>
```

Example:

```bash
node demo.js verify artifacts/2026-03-22T23-58-48-393Z
```

The verify mode expects these files inside the run directory:

- `prompt.txt`
- `response.txt`
- `prompt-seal.json`
- `response-seal.json`

If `meta.json` exists, the CLI will print its path as context before verifying.

## Output Artifacts

Each demo run writes a new directory under `artifacts/` containing:

- `prompt.txt`
- `response.txt`
- `prompt-seal.json`
- `response-seal.json`
- `meta.json`

`meta.json` includes the prompt and response hashes, retrieval IDs, verification URLs, blockchain registrations, and submitted timestamps.

## Verification Details

- `POST /verifyseal` takes the document hash in `verifyDocHashes` and the previously returned seal in `seals`.
- For a single document, `seals` may be a single seal object.
- For multiple documents in one verification call, `seals` should be a JSON array of seals in the same logical pairing as the submitted hashes.
- The CLI currently verifies the prompt and response in two separate `verifyseal` calls for clarity.

## Independent Verification

You do not need to rely on Cryptowerk forever to prove the registration. The saved seal contains the hash operations and blockchain transaction references needed to verify independently later:

1. Re-hash the saved `prompt.txt` or `response.txt` with SHA-256.
2. Confirm that hash matches the `DOC_SHA256` operation inside the saved seal.
3. Follow the seal's hash operations (`PREPEND_THEN_SHA256`, `APPEND_THEN_SHA256`, `ANCHOR_SHA256`) to recompute the anchor hash.
4. Compare that anchor against the blockchain transaction referenced in the seal or the explorer URLs in `meta.json`.

On macOS or Linux, a local re-hash looks like:

```bash
shasum -a 256 artifacts/<run-directory>/prompt.txt
shasum -a 256 artifacts/<run-directory>/response.txt
```

## Seal Output Formats

The Cryptowerk tutorials describe additional experimental `getseal` output wrappers beyond raw JSON:

- `certificateHTML`
- `certificatePDF`
- `QRWithSeal`

This repo does not currently fetch those wrappers, but they can be requested from `POST /getseal` if you want HTML, PDF, or QR-rendered proof artifacts in addition to the raw seal JSON.

## cURL / jq Notes

If you want to inspect Horizon responses manually outside the CLI, `jq` is useful for formatting large JSON responses and extracting fields such as retrieval IDs or seals. The Cryptowerk tutorials also use shell environment variables and URL encoding helpers for cURL-heavy workflows.

## Notes

- **Model**: Using `grok-3-mini`. Check the [xAI model docs](https://docs.x.ai/developers/models) for alternatives.
- **Polling**: Real blockchain anchors can take several minutes (Bitcoin/Ethereum confirmation times). The script polls every 10 seconds for up to ~7 minutes.
- **Registration mode**: Horizon registration uses `individualSeal` so the prompt and response each receive their own retrieval ID and seal.
- **Verification**: The CLI verifies both saved artifacts automatically at the end of a run using `POST /verifyseal`. You can also rerun verification later with `node demo.js verify <artifacts-run-directory>`.
- **`/getseal` semantics**: A seal is complete when the response document reports `seal.isComplete === true`. The blockchain insertion state is reported at the document level, for example `hasBeenInsertedIntoAtLeastOneBlockchain`.
- **Callbacks**: Horizon also supports callbacks via webhook, email, or MQTT, but this repo intentionally uses polling to keep the demo self-contained.
- **Bulk seals**: Horizon supports `bulkSeal` mode for large collections of hashes, but this demo intentionally stays on `individualSeal` because it keeps prompt and response verification easy to understand.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ai-sdk/xai` | Vercel AI SDK provider for xAI Grok |
| `ai` | Vercel AI SDK core (`generateText`) |
| `axios` | HTTP client for Horizon SealAPI |
| `dotenv` | Load `.env` credentials |
| `readline-sync` | Synchronous CLI prompt |
