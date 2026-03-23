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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function saveArtifacts({ prompt, grokResponse, promptHash, responseHash, promptSealDoc, responseSealDoc }) {
  const baseDir = ensureArtifactsDir();
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(baseDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const promptPath = path.join(runDir, 'prompt.txt');
  const responsePath = path.join(runDir, 'response.txt');
  const promptSealPath = path.join(runDir, 'prompt-seal.json');
  const responseSealPath = path.join(runDir, 'response-seal.json');
  const metaPath = path.join(runDir, 'meta.json');

  fs.writeFileSync(promptPath, prompt, 'utf8');
  fs.writeFileSync(responsePath, grokResponse, 'utf8');
  writeJson(promptSealPath, promptSealDoc.seal);
  writeJson(responseSealPath, responseSealDoc.seal);
  writeJson(metaPath, {
    promptHash,
    responseHash,
    promptRetrievalId: promptSealDoc.retrievalId,
    responseRetrievalId: responseSealDoc.retrievalId,
    promptVerificationURL: promptSealDoc.verificationURL || null,
    responseVerificationURL: responseSealDoc.verificationURL || null,
    promptBlockchainRegistrations: promptSealDoc.blockchainRegistrations || [],
    responseBlockchainRegistrations: responseSealDoc.blockchainRegistrations || [],
    promptSubmittedAt: promptSealDoc.submittedAt || null,
    responseSubmittedAt: responseSealDoc.submittedAt || null,
  });

  return {
    runDir,
    promptPath,
    responsePath,
    promptSealPath,
    responseSealPath,
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

async function registerHashes(items) {
  const body = new URLSearchParams({
    hashes: items.map(item => item.hash).join(','),
    mode: 'individualSeal',
    lookupInfos: items.map(item => item.lookupInfo).join(','),
  });

  try {
    const response = await axios.post(`${HORIZON_BASE}/register`, body.toString(), {
      headers: HEADERS,
    });
    const docs = response.data.documents || [];
    if (docs.length !== items.length) {
      throw new Error(`Expected ${items.length} retrieval IDs, got ${docs.length}`);
    }
    return docs.map((doc, index) => ({
      label: items[index].label,
      hash: items[index].hash,
      lookupInfo: items[index].lookupInfo,
      retrievalId: doc.retrievalId,
    }));
  } catch (err) {
    console.error('Register failed:', err.response?.data || err.message);
    throw err;
  }
}

function printSealDetails(label, sealDoc) {
  const seal = sealDoc.seal || {};

  console.log(`\n${label} Seal Success! 🎉`);
  console.log('Seal Details:');
  console.log('Retrieval ID:', sealDoc.retrievalId);
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

    // 2. Hash prompt and response (SHA-256)
    const promptHash = sha256Hex(prompt);
    const responseHash = sha256Hex(grokResponse);
    console.log('Prompt SHA-256 Hash:', promptHash);
    console.log('Response SHA-256 Hash:', responseHash);

    // 3. Register with Horizon
    console.log('\nRegistering prompt and response hashes with Horizon...');
    const lookupBase = `Grok-demo-${Date.now()}`;
    const registrations = await registerHashes([
      { label: 'Prompt', hash: promptHash, lookupInfo: `${lookupBase}-prompt` },
      { label: 'Response', hash: responseHash, lookupInfo: `${lookupBase}-response` },
    ]);
    registrations.forEach(reg => {
      console.log(`${reg.label} Retrieval ID:`, reg.retrievalId);
    });

    // 4. Poll until sealed
    const [promptSealDoc, responseSealDoc] = await Promise.all(
      registrations.map(reg => pollForSeal(reg.retrievalId))
    );

    // 5. Show results
    printSealDetails('Prompt', promptSealDoc);
    printSealDetails('Response', responseSealDoc);

    const artifacts = saveArtifacts({
      prompt,
      grokResponse,
      promptHash,
      responseHash,
      promptSealDoc,
      responseSealDoc,
    });
    console.log('\nArtifacts saved:');
    console.log('Prompt:', artifacts.promptPath);
    console.log('Response:', artifacts.responsePath);
    console.log('Prompt seal:', artifacts.promptSealPath);
    console.log('Response seal:', artifacts.responseSealPath);
    console.log('Metadata:', artifacts.metaPath);

    console.log('\nVerifying saved artifacts with Horizon...');
    const savedPrompt = fs.readFileSync(artifacts.promptPath, 'utf8');
    const savedResponse = fs.readFileSync(artifacts.responsePath, 'utf8');
    const savedPromptSeal = JSON.parse(fs.readFileSync(artifacts.promptSealPath, 'utf8'));
    const savedResponseSeal = JSON.parse(fs.readFileSync(artifacts.responseSealPath, 'utf8'));
    const [promptVerifyResult, responseVerifyResult] = await Promise.all([
      verifySeal({
        hash: sha256Hex(savedPrompt),
        seal: savedPromptSeal,
      }),
      verifySeal({
        hash: sha256Hex(savedResponse),
        seal: savedResponseSeal,
      }),
    ]);
    console.log('Prompt verification response:');
    console.log(JSON.stringify(promptVerifyResult, null, 2));
    console.log('\nResponse verification response:');
    console.log(JSON.stringify(responseVerifyResult, null, 2));

    console.log('\nVerification tip: Re-hash the saved prompt and response text files above and compare them against the stored seals or the blockchain proof data.');
  } catch (err) {
    console.error('\nError:', err.response?.data || err.message);
  }
}

main();
