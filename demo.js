// demo.js
require('dotenv').config();
const { xai } = require('@ai-sdk/xai');
const { generateText } = require('ai');
const crypto = require('crypto');
const axios = require('axios');
const readlineSync = require('readline-sync');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const HORIZON_BASE = 'https://developers.cryptowerk.com/platform/API/v8';
const HEADERS = {
  'X-API-Key': `${process.env.HORIZON_API_KEY} ${process.env.HORIZON_API_SECRET}`,
  'Content-Type': 'application/json',
};

async function registerHash(dataHash, lookupInfo = 'Grok-CLI-demo') {
  const params = {
    hashes: dataHash,
    mode: 'bulkSeal',
    lookupInfo,
  };

  try {
    const response = await axios.post(`${HORIZON_BASE}/register`, null, {
      params,
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
  const params = {
    retrievalId,
    provideVerificationInfos: true,
    hashSequenceKnown: true,
  };

  console.log('Polling for seal (can take minutes depending on chain confirmation)...');

  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const response = await axios.post(`${HORIZON_BASE}/getseal`, null, {
        params,
        headers: HEADERS,
      });
      const doc = response.data.documents?.[0] || {};
      const seal = doc.seal || {};

      if (seal.isComplete && seal.hasBeenInsertedIntoAtLeastOneBlockchain) {
        return seal;
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
      model: xai('grok-4.20-reasoning'),
      prompt,
    });

    console.log('\nGrok Response:');
    console.log('---------------');
    console.log(grokResponse);
    console.log('\n');

    // 2. Hash it (SHA-256)
    const hash = crypto.createHash('sha256').update(grokResponse).digest('hex');
    console.log('SHA-256 Hash:', hash);

    // 3. Register with Horizon
    console.log('\nRegistering hash with Horizon...');
    const retrievalId = await registerHash(hash, `Grok-demo-${Date.now()}`);
    console.log('Retrieval ID:', retrievalId);

    // 4. Poll until sealed
    const seal = await pollForSeal(retrievalId);

    // 5. Show results
    console.log('\nSeal Success! 🎉');
    console.log('Seal Details:');
    console.log('Submitted at:', new Date(seal.submittedAt * 1000).toISOString());
    console.log('Complete:', seal.isComplete);
    console.log('In at least one blockchain:', seal.hasBeenInsertedIntoAtLeastOneBlockchain);

    const proofs = seal.proofs?.[0] || {};
    console.log('Proof method:', proofs.bundleMethod);

    const bcRegs = seal.blockchainRegistrations || [];
    bcRegs.forEach((reg, i) => {
      console.log(`\nBlockchain ${i + 1}: ${reg.blockChainDesc?.generalName || 'Unknown'}`);
      console.log('Inserted at:', new Date(reg.insertedIntoBlockchainAt * 1000).toISOString());
      if (reg.bcExplorerUrls?.length) {
        console.log('Explorer links:');
        reg.bcExplorerUrls.forEach(url => console.log(`  ${url}`));
      }
    });

    console.log('\nVerification tip: Re-hash the Grok response above and follow the Merkle proof ops in seal.proofs to verify against the blockchain tx.');
  } catch (err) {
    console.error('\nError:', err.message);
  }
}

main();
