#!/usr/bin/env node

/**
 * Encoder: Contiva Format → Encoded Base64 String
 * 
 * Reverses the decode steps:
 * 1. JSON → ZIP file
 * 2. ZIP → Gzip compress
 * 3. Gzip → Base64 encode (STANDARD base64, not URL-safe)
 * 4. Base64 → URL-encode
 */

const zlib = require('zlib');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { exec } = require('child_process');
const path = require('path');

/**
 * Encodes Contiva data to an encoded base64 string
 * Reverses: JSON → ZIP → gzip → base64 → URL-safe → URL-encoded
 * 
 * @param {Object} contivaData - The Contiva format object
 * @returns {Promise<string>} URL-encoded base64 string
 */
async function encodeContivaData(contivaData) {
  return new Promise((resolve, reject) => {
    try {
      // Step 1: Convert to JSON string
      const jsonString = JSON.stringify(contivaData);
      console.log(`  📝 JSON string length: ${jsonString.length} bytes`);

      // Step 2: Create ZIP archive
      const output = new PassThrough();
      const archive = archiver('zip', { 
        zlib: { level: 9 },
        date: new Date(0)  // Use epoch time for deterministic timestamps
      });
      
      let zipBuffer = Buffer.alloc(0);
      output.on('data', (chunk) => {
        zipBuffer = Buffer.concat([zipBuffer, chunk]);
      });

      output.on('end', () => {
        try {
          console.log(`  📦 ZIP archive size: ${zipBuffer.length} bytes`);
          console.log(`  📦 ZIP hex start: ${zipBuffer.slice(0, 16).toString('hex')}`);
          console.log(`  📦 ZIP hex end: ${zipBuffer.slice(-16).toString('hex')}`);

          // Step 3: Compress ZIP with gzip (disable timestamp to make it deterministic)
          const compressed = zlib.gzipSync(zipBuffer, { mtime: 0 });
          console.log(`  📦 Gzipped size: ${compressed.length} bytes`);
          console.log(`  📦 Gzipped hex start: ${compressed.slice(0, 16).toString('hex')}`);
          console.log(`  📦 Gzipped hex end: ${compressed.slice(-16).toString('hex')}`);

          // Step 4: Encode to STANDARD base64 (NOT URL-safe - keep + and /)
          let base64 = compressed.toString('base64');
          console.log(`  🔤 Base64 length before padding: ${base64.length} chars`);
          
          // Standard base64 padding
          const paddingNeeded = (4 - (base64.length % 4)) % 4;
          base64 += '='.repeat(paddingNeeded);
          console.log(`  🔤 Base64 length with padding: ${base64.length} chars (added ${paddingNeeded} padding chars)`);
          console.log(`  🔤 First 30 chars: ${base64.slice(0, 30)}`);
          console.log(`  🔤 Ends with: ...${base64.slice(-10)}`);

          // Step 5: URL-encode the STANDARD base64 string
          // This converts: + to %2B, / to %2F, = to %3D
          const urlEncoded = encodeURIComponent(base64);
          console.log(`  🌐 URL-encoded length: ${urlEncoded.length} chars`);
          console.log(`  🌐 First 30 chars: ${urlEncoded.slice(0, 30)}`);
          console.log(`  🌐 Ends with: ...${urlEncoded.slice(-30)}`);

          resolve(urlEncoded);
        } catch (error) {
          console.error(`  ❌ Error in output.on('end'): ${error.message}`);
          reject(error);
        }
      });

      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);
      archive.append(jsonString, { 
        name: 'data.json',
        date: new Date(0)  // Fixed epoch date for deterministic output
      });
      archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Opens Chrome with the Contiva IDE URL containing the encoded data
 * 
 * @param {string} encodedData - The URL-encoded base64 string
 * @returns {Promise<void>}
 */
function openInChrome(encodedData) {
  return new Promise((resolve, reject) => {
    const url = `https://ide.contiva.com/cpi/script/debug?data=${encodedData}`;
    console.log(`\n🌐 Opening Chrome with URL:`);
    console.log(`${url}\n`);

    let command;
    
    if (process.platform === 'win32') {
      // Windows
      command = `start chrome "${url}"`;
    } else if (process.platform === 'darwin') {
      // macOS
      command = `open -a "Google Chrome" "${url}"`;
    } else {
      // Linux
      command = `google-chrome "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`⚠️  Could not open Chrome: ${error.message}`);
        console.log(`ℹ️  Try opening this URL manually:`);
        console.log(`${url}`);
        resolve(); // Don't reject, just inform the user
      } else {
        console.log(`✅ Chrome opened successfully!`);
        resolve();
      }
    });
  });
}
function decodeContivaData(encodedData) {
  // Step 1: URL-decode
  let decodedUrl = decodeURIComponent(encodedData);
  console.log(`  🌐 URL-decoded length: ${decodedUrl.length} chars`);

  // Step 2: Restore standard Base64 from URL-safe format
  let standardBase64 = decodedUrl
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  // Note: Padding '=' is already present, no need to add

  console.log(`  🔤 Standard Base64 length: ${standardBase64.length} chars`);

  // Step 3: Decode Base64 to binary
  const buffer = Buffer.from(standardBase64, 'base64');
  console.log(`  📦 Base64 decoded: ${buffer.length} bytes`);

  // Step 4: Decompress with gzip
  const decompressed = zlib.gunzipSync(buffer);
  console.log(`  📦 Gzipped decompressed: ${decompressed.length} bytes`);
  console.log(`  🎁 Magic bytes: ${decompressed.slice(0, 4).toString('hex')} (ZIP file)`);

  return {
    zipBuffer: decompressed,
    message: 'This is a ZIP archive. Extract with a ZIP tool or use the archiver library to read.'
  };
}


// ============================================================================
// EXAMPLE USAGE
// ============================================================================

if (require.main === module) {
  console.log('🔐 Contiva Format Encoder/Decoder\n');

  // Example Contiva data
  const contivaExample = {
    currentSessionType: 'groovy',
    scriptInput: '{ "test": "testval3" }',
    script: 'import com.sap.gateway.ip.core.customdev.util.Message;\n\ndef Message processData(Message message) {\n    return message;\n}',
    functionName: 'processData',
    headers: {
      SAP_MessageProcessingLogID: 'AGlnwRPCOT1y6HLEfkmHVDXWnnu0',
      SAP_TRACE_HEADER_1768407316206_MessageType: 'STEP'
    },
    properties: {
      AnotherProp: 'conf1',
      TestingProp: 'conf2'
    }
  };

  console.log('1️⃣  Original Contiva Format:');
  console.log('═'.repeat(60));
  console.log(JSON.stringify(contivaExample, null, 2));

  // Encode to base64 string
  console.log('\n2️⃣  Encoding to Base64 (via ZIP + Gzip)...');
  console.log('─'.repeat(60));
  
  encodeContivaData(contivaExample)
    .then((encoded) => {
      console.log('\n3️⃣  Encoded String:');
      console.log('═'.repeat(60));
      console.log(encoded);
      console.log(`\nTotal length: ${encoded.length} characters`);

      // Decode back to verify
      console.log('\n4️⃣  Decoding Back to Verify...');
      console.log('─'.repeat(60));
      const decoded = decodeContivaData(encoded);

      console.log('\n5️⃣  Decoded Result:');
      console.log('═'.repeat(60));
      console.log(`Type: ${decoded.message}`);
      console.log(`Size: ${decoded.zipBuffer.length} bytes`);
      console.log(`\n✅ Encoding/decoding successful!`);
      
      // Open in Chrome
      return openInChrome(encoded);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = {
  encodeContivaData,
  decodeContivaData,
  openInChrome
};
