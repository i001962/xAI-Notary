// demo.js
require('dotenv').config();
const { xai } = require('@ai-sdk/xai');
const { generateText } = require('ai');
const crypto = require('crypto');
const axios = require('axios');
const readlineSync = require('readline-sync');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const HORIZON_BASE = 'https://developers.cryptowerk.com/platform/API/v8';
const HEADERS = {
  'X-API-Key': `${process.env.HORIZON_API_KEY} ${process.env.HORIZON_API_SECRET}`,
  'Accept': 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded',
};

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ensureArtifactsDir() {
  const dir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveArtifacts({ prompt, grokResponse, hash, retrievalId, sealDoc }) {
  const baseDir = ensureArtifactsDir();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(baseDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const responsePath = path.join(runDir, 'response.txt');
  const sealPath = path.join(runDir, 'seal.json');
  const metaPath = path.join(runDir, 'meta.json');

  fs.writeFileSync(responsePath, grokResponse, 'utf8');
  fs.writeFileSync(sealPath, JSON.stringify(sealDoc.seal, null, 2));
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        prompt,
        retrievalId,
        responseHash: hash,
        verificationURL: sealDoc.verificationURL || null,
        blockchainRegistrations: sealDoc.blockchainRegistrations || [],
        submittedAt: sealDoc.submittedAt || null,
      },
      null,
      2
    )
  );

  return {
    runDir,
    responsePath,
    sealPath,
    metaPath,
  };
}

async function verifySeal({ hash, seal }) {
  const body = new URLSearchParams({
    verifyDocHashes: hash,
    seals: JSON.stringify(seal),
    provideInstructions: 'true',
  });

  const response = await axios.post(`${HORIZON_BASE}/verifyseal`, body.toString(), {
    headers: HEADERS,
  });

  return response.data;
}

async function registerHash(dataHash, lookupInfo = 'Grok-CLI-demo') {
  const body = new URLSearchParams({
    hashes: dataHash,
    mode: 'individualSeal',
    lookupInfo,
  });

  try {
    const response = await axios.post(`${HORIZON_BASE}/register`, body.toString(), {
      headers: HEADERS,
    });
    const docs = response.data.documents || [];
    if (docs.length === 0) throw new Error('No retrievalId returned');
    return docs[0].retrievalId;
  } catch (err) {
    console.error('Register failed:', err.response?.data || err.message);
    throw err;
  }
}

async function pollForSeal(retrievalId) {
  const body = new URLSearchParams({
    retrievalId,
    provideVerificationInfos: 'true',
    hashSequenceKnown: 'true',
  });

  console.log('Polling for seal (can take minutes depending on chain confirmation)...');

  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const response = await axios.post(`${HORIZON_BASE}/getseal`, body.toString(), {
        headers: HEADERS,
      });
      const doc = response.data.documents?.[0] || {};
      const seal = doc.seal || {};

      if (seal.isComplete && doc.hasBeenInsertedIntoAtLeastOneBlockchain) {
        return doc;
      }

      console.log(`Attempt ${attempt}: Not ready yet...`);
      await new Promise(r => setTimeout(r, 10000));
    } catch (err) {
      console.error('Poll error:', err.response?.data || err.message);
    }
  }
  throw new Error('Timeout waiting for seal – check Horizon status or blockchain delay');
}

async function main() {
  console.log('Grok + Horizon Notary CLI Demo');
  console.log('--------------------------------\n');

  const prompt = readlineSync.question('Enter your question/prompt for Grok: ').trim();
  if (!prompt) {
    console.log('No prompt given. Exiting.');
    return;
  }

  console.log('\nAsking Grok...');

  try {
    // 1. Call Grok via @ai-sdk/xai
    const { text: grokResponse } = await generateText({
      model: xai('grok-3-mini'),
      prompt,
    });

    console.log('\nGrok Response:');
    console.log('---------------');
    console.log(grokResponse);
    console.log('\n');

    // 2. Hash it (SHA-256)
    const hash = sha256Hex(grokResponse);
    console.log('SHA-256 Hash:', hash);

    // 3. Register with Horizon
    console.log('\nRegistering hash with Horizon...');
    const retrievalId = await registerHash(hash, `Grok-demo-${Date.now()}`);
    console.log('Retrieval ID:', retrievalId);

    // 4. Poll until sealed
    const sealDoc = await pollForSeal(retrievalId);
    const seal = sealDoc.seal || {};

    // 5. Show results
    console.log('\nSeal Success! 🎉');
    console.log('Seal Details:');
    console.log('Submitted at:', new Date(sealDoc.submittedAt).toISOString());
    console.log('Complete:', seal.isComplete);
    console.log('In at least one blockchain:', sealDoc.hasBeenInsertedIntoAtLeastOneBlockchain);

    const proofs = seal.proofs?.[0] || {};
    console.log('Proof method:', proofs.bundleMethod);

    const bcRegs = sealDoc.blockchainRegistrations || [];
    bcRegs.forEach((reg, i) => {
      console.log(`\nBlockchain ${i + 1}: ${reg.blockChainDesc?.generalName || 'Unknown'}`);
      console.log('Inserted at:', new Date(reg.insertedIntoBlockchainAt).toISOString());
      if (reg.bcExplorerUrls?.length) {
        console.log('Explorer links:');
        reg.bcExplorerUrls.forEach(url => console.log(`  ${url}`));
      }
    });

    const artifacts = saveArtifacts({ prompt, grokResponse, hash, retrievalId, sealDoc });
    console.log('\nArtifacts saved:');
    console.log('Response:', artifacts.responsePath);
    console.log('Seal:', artifacts.sealPath);
    console.log('Metadata:', artifacts.metaPath);

    console.log('\nVerifying saved artifacts with Horizon...');
    const savedResponse = fs.readFileSync(artifacts.responsePath, 'utf8');
    const savedSeal = JSON.parse(fs.readFileSync(artifacts.sealPath, 'utf8'));
    const verifyResult = await verifySeal({
      hash: sha256Hex(savedResponse),
      seal: savedSeal,
    });
    console.log('Verification response:');
    console.log(JSON.stringify(verifyResult, null, 2));

    console.log('\nVerification tip: Re-hash the Grok response above and follow the Merkle proof ops in seal.proofs to verify against the blockchain tx.');
  } catch (err) {
    console.error('\nError:', err.response?.data || err.message);
  }
}

main();
