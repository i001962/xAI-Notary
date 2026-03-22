# xAI-Notary

A CLI demo that asks Grok a question, hashes the response with SHA-256, and registers the hash with the Cryptowerk Horizon SealAPI to create a verifiable blockchain proof of the AI's answer.

## What It Does

1. Prompts you for a question via the terminal
2. Sends the question to **xAI Grok** using the Vercel AI SDK (`@ai-sdk/xai`)
3. Computes the **SHA-256 hash** of the response
4. **Registers** the hash with Cryptowerk Horizon SealAPI (`/register`)
5. **Polls** Horizon until the hash is anchored on-chain (`/getseal`)
6. Prints the Grok answer, seal details, and blockchain explorer links

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

You will be prompted to enter a question. The script will call Grok, hash the response, register it with Horizon, and wait for the blockchain anchor before printing the full seal details.

## Notes

- **Model**: Using `grok-4.20-reasoning` (flagship as of 2026). Check the [xAI model docs](https://docs.x.ai/developers/models) for alternatives.
- **Polling**: Real blockchain anchors can take several minutes (Bitcoin/Ethereum confirmation times). The script polls every 10 seconds for up to ~7 minutes.
- **Verification**: To independently verify a seal, re-hash the Grok response shown and follow the Merkle proof operations in `seal.proofs` against the blockchain transaction.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ai-sdk/xai` | Vercel AI SDK provider for xAI Grok |
| `ai` | Vercel AI SDK core (`generateText`) |
| `axios` | HTTP client for Horizon SealAPI |
| `dotenv` | Load `.env` credentials |
| `readline-sync` | Synchronous CLI prompt |
