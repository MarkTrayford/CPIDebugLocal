#!/usr/bin/env node

/**
 * Groovy Debugger Server
 * Express.js server for receiving and decoding Groovy debugger encoded data via URL
 * 
 * Usage:
 *   node groovy-server.js
 * 
 * Then visit:
 *   http://localhost:4004/debug/      << Use this to save data locally
 *   http://localhost:4004/contiva/      << Add this URL to cpi helper plugin to convert and reroute to Contiva IDE
 * 
 * The server decodes the data, saves it to files, and can open Contiva IDE in Chrome.
 */

const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { encodeContivaData , openInChrome } = require('./contiva-encoder');

const app = express();
const PORT = process.env.PORT || 4004;

// ════════════════════════════════════════════════════════════
// 📋 LOGGING UTILITY
// ════════════════════════════════════════════════════════════
const logger = {
  info: (msg) => console.log(`   ℹ️  ${msg}`),
  success: (msg) => console.log(`   ✅ ${msg}`),
  error: (msg) => console.error(`   ❌ ${msg}`),
  warn: (msg) => console.warn(`   ⚠️  ${msg}`),
  debug: (msg) => console.log(`   🔍 ${msg}`),
  section: (msg) => console.log(`\n${'═'.repeat(60)}\n${msg}\n${'═'.repeat(60)}`),
  table: (title, data) => {
    console.log(`   📊 ${title}:`);
    Object.entries(data).forEach(([key, value]) => {
      console.log(`      ${key}: ${value}`);
    });
  }
};

// Configuration for data dump location
const DATA_DUMP_BASE = process.env.DATA_DUMP_PATH || 'C:\\CPIViewer\\DataDump';
const DATA_DUMP_DEBUG = path.join(DATA_DUMP_BASE, 'Debug');
const DATA_DUMP_PROPERTIES = path.join(DATA_DUMP_BASE, 'Debug');

logger.debug(`Data dump base path: ${DATA_DUMP_BASE}`);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (optional - for a simple dashboard)
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n📡 [${timestamp}] ${req.method} ${req.path}`);
  
  // Log request body if present (truncate if too long)
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyStr = JSON.stringify(req.body);
    if (bodyStr.length > 200) {
      logger.debug(`Body: ${bodyStr.substring(0, 200)}... (${bodyStr.length} total chars)`);
    } else {
      logger.debug(`Body: ${bodyStr}`);
    }
  }
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    logger.debug(`Response: ${res.statusCode} - ${typeof data === 'string' ? data.substring(0, 100) : 'JSON'}`);
    return originalSend.call(this, data);
  };
  
  next();
});

/**
 * Decodes a Groovy Debugger encoded string
 * Reverses: URL-safe Base64 -> Standard Base64 -> Inflate -> JSON
 */
function decodeGroovyString(urlSafeBase64) {
  logger.debug(`Starting decode: ${urlSafeBase64.substring(0, 40)}...`);
  
  // Step 1: Restore standard Base64 from URL-safe format
  let standardBase64 = urlSafeBase64
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  logger.debug(`Step 1: Converted URL-safe to standard Base64 (${standardBase64.length} chars)`);

  // Step 2: Restore padding
  const paddingNeeded = (4 - (standardBase64.length % 4)) % 4;
  standardBase64 += '='.repeat(paddingNeeded);
  logger.debug(`Step 2: Added ${paddingNeeded} padding chars`);

  // Step 3: Decode Base64 to binary
  const buffer = Buffer.from(standardBase64, 'base64');
  logger.debug(`Step 3: Decoded Base64 to binary (${buffer.length} bytes)`);

  // Step 4: Inflate (decompress) the raw Deflate data
  const decompressed = zlib.inflateRawSync(buffer);
  logger.debug(`Step 4: Decompressed data (${decompressed.length} bytes)`);

  // Step 5: Convert to UTF-8 string
  const jsonString = decompressed.toString('utf-8');
  logger.debug(`Step 5: Converted to UTF-8 string (${jsonString.length} chars)`);

  // Step 6: Parse JSON
  const parsed = JSON.parse(jsonString);
  logger.success(`Decoded successfully`);
  
  return parsed;
}

/**
 * Converts CPIHelper format to Contiva format
 */
function cpiHelperToContiva(cpiHelperData) {
  logger.debug(`Converting CPIHelper to Contiva format`, cpiHelperData);
  
  const input = cpiHelperData.input || {};
  const script = cpiHelperData.script || {};
  
  logger.debug(`  Input keys: ${Object.keys(input).join(', ')}`);
  logger.debug(`  Script keys: ${Object.keys(script).join(', ')}`);

  const contiva = {
    currentSessionType: 'groovy',
    scriptInput: input.body || '',
    script: script.code || '',
    functionName: script.function || 'processData',
    headers: input.headers || {},
    properties: input.properties || {}
  };
  
  logger.success(`Converted to Contiva format with ${Object.keys(contiva).length} fields`);
  return contiva;
}

/**
 * Opens Chrome with the Contiva IDE URL
 */
// function openInChrome(encodedData) {
//   return new Promise((resolve, reject) => {
//     const url = `https://ide.contiva.com/cpi?data=${encodedData}`;
//     console.log(`\n🌐 Opening Chrome with URL:`);
//     console.log(`${url}\n`);

//     let command;

//     if (process.platform === "win32") {
//       // Windows
//       command = `start chrome "${url}"`;
//     } else if (process.platform === "darwin") {
//       // macOS
//       command = `open -a "Google Chrome" "${url}"`;
//     } else {
//       // Linux
//       command = `google-chrome "${url}"`;
//     }

//     exec(command, (error) => {
//       if (error) {
//         console.error(`⚠️  Could not open Chrome: ${error.message}`);
//         console.log(`ℹ️  Try opening this URL manually:`);
//         console.log(`${url}`);
//         resolve(); // Don't reject, just inform the user
//       } else {
//         console.log(`✅ Chrome opened successfully!`);
//         resolve();
//       }
//     });
//   });
// }

/**
 * Converts an object to Java .properties file format
 * Format: #Comment
 * #Wed Jan 14 11:53:18 UTC 2026
 * key=value
 */
function objectToPropertiesFormat(obj, title = 'Contents') {
  const lines = [];
  
  // Add header comments
  lines.push(`#${title}`);
  
  // Add timestamp comment in Java properties format
  const now = new Date();
  const dateStr = now.toUTCString();
  lines.push(`#${dateStr}`);
  
  // Add key=value pairs
  if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      let val = value;
      if (typeof value === 'object') {
        val = JSON.stringify(value);
      }
      // Escape special characters in properties format
      const escapedVal = String(val).replace(/[=:\t]/g, '\\$&');
      lines.push(`${key}=${escapedVal}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Saves decoded data to files in the configured directory structure
 * Creates three files with fixed names: debug.body, debug.header, debug.properties
 * Headers and properties use Java .properties file format
 */
function saveDecodedData(decodedData) {
  try {
    // Ensure directories exist
    console.log(`  📁 Checking directories...`);
    
    if (!fs.existsSync(DATA_DUMP_DEBUG)) {
      fs.mkdirSync(DATA_DUMP_DEBUG, { recursive: true });
      console.log(`    ✓ Created Debug directory: ${DATA_DUMP_DEBUG}`);
    } else {
      console.log(`    ✓ Debug directory exists: ${DATA_DUMP_DEBUG}`);
    }
    
    if (!fs.existsSync(DATA_DUMP_PROPERTIES)) {
      fs.mkdirSync(DATA_DUMP_PROPERTIES, { recursive: true });
      console.log(`    ✓ Created Properties directory: ${DATA_DUMP_PROPERTIES}`);
    } else {
      console.log(`    ✓ Properties directory exists: ${DATA_DUMP_PROPERTIES}`);
    }

    const input = decodedData.input || {};
    const fixedFilename = 'debug';
    
    // Save body with .body extension (as-is)
    try {
      const bodyPath = path.join(DATA_DUMP_DEBUG, `${fixedFilename}.body`);
      const bodyContent = input.body || '';
      fs.writeFileSync(bodyPath, bodyContent, 'utf-8');
      console.log(`  📄 Body saved: ${bodyPath}`);
    } catch (err) {
      console.error(`  ❌ Error saving body: ${err.message}`);
    }

    // Save headers with .header extension (properties format)
    try {
      const headersPath = path.join(DATA_DUMP_DEBUG, `${fixedFilename}.header`);
      const headersContent = objectToPropertiesFormat(input.headers || {}, 'Header Contents');
      fs.writeFileSync(headersPath, headersContent, 'utf-8');
      console.log(`  📄 Headers saved: ${headersPath}`);
    } catch (err) {
      console.error(`  ❌ Error saving headers: ${err.message}`);
    }

    // Save properties with .properties extension (properties format)
    try {
      const propertiesPath = path.join(DATA_DUMP_PROPERTIES, `${fixedFilename}.properties`);
      const propertiesContent = objectToPropertiesFormat(input.properties || {}, 'Properties Contents');
      console.log(`  🔍 Properties content length: ${propertiesContent.length} chars`);
      fs.writeFileSync(propertiesPath, propertiesContent, 'utf-8');
      console.log(`  📄 Properties saved: ${propertiesPath}`);
    } catch (err) {
      console.error(`  ❌ Error saving properties: ${err.message}`);
    }

    return {
      success: true,
      files: {
        body: path.join(DATA_DUMP_DEBUG, `${fixedFilename}.body`),
        header: path.join(DATA_DUMP_DEBUG, `${fixedFilename}.header`),
        properties: path.join(DATA_DUMP_PROPERTIES, `${fixedFilename}.properties`)
      }
    };
  } catch (error) {
    console.error(`  ❌ Error in saveDecodedData: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * GET /debug/:data
 * Decodes Groovy debugger data from URL parameter
 */
app.get('/debug/:data', (req, res) => {
  try {
    const encodedData = req.params.data;
    logger.info(`Starting decode from URL parameter`);
    logger.debug(`Encoded data length: ${encodedData.length} chars`);
    
    const decodedData = decodeGroovyString(encodedData);

    // Save decoded data to files
    logger.info(`Saving decoded data to files...`);
    const saveResult = saveDecodedData(decodedData);
    logger.success(`All files saved successfully`);

    res.json({
      success: true,
      message: 'Data decoded successfully',
      data: decodedData,
      files: saveResult.files || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Decode error: ${error.message}`);

    res.status(400).json({
      success: false,
      message: 'Failed to decode data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /debug
 * Decodes Groovy debugger data from POST body
 */
app.post('/debug', (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      logger.error(`Missing "data" field in POST body`);
      return res.status(400).json({
        success: false,
        message: 'Missing "data" field in request body',
        timestamp: new Date().toISOString()
      });
    }

    logger.info(`Decoding data from POST body`);
    logger.debug(`Data length: ${data.length} chars`);
    
    const decodedData = decodeGroovyString(data);

    // Save decoded data to files
    logger.info(`Saving decoded data to files...`);
    const saveResult = saveDecodedData(decodedData);
    logger.success(`All files saved successfully`);

    res.json({
      success: true,
      message: 'Data decoded successfully',
      data: decodedData,
      files: saveResult.files || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Decode error: ${error.message}`);

    res.status(400).json({
      success: false,
      message: 'Failed to decode data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /contiva/test
 * TEST ENDPOINT: Uses hardcoded Contiva data to test encoding directly
 */
app.get('/contiva/test', async (req, res) => {
  try {
    logger.info(`Testing /contiva/test endpoint with hardcoded Contiva data`);

    // Hardcoded test data (same as in contiva-encoder.js)
    const contivaData = {
      currentSessionType: "groovy",
      scriptInput: '{ "test": "testval3" }',
      script:
        "import com.sap.gateway.ip.core.customdev.util.Message;\n\ndef Message processData(Message message) {\n    return message;\n}",
      functionName: "processData",
      headers: {
        SAP_MessageProcessingLogID: "AGlnwRPCOT1y6HLEfkmHVDXWnnu0",
        SAP_TRACE_HEADER_1768407316206_MessageType: "STEP",
      },
      properties: {
        AnotherProp: "conf1",
        TestingProp: "conf2",
      },
    };
    
    logger.info(`Contiva data prepared`);
    
    // Encode Contiva data
    const encodedContivaData = await encodeContivaData(contivaData);
    logger.info(`Encoded to Contiva format (${encodedContivaData.length} chars)`);
    logger.info(` ${encodedContivaData}`);
    
    // Open in Chrome
    try {
      const url = await openInChrome(encodedContivaData);
      logger.success(`Full /contiva/test request completed`);
      
      res.json({
        success: true,
        message: 'Test data encoded and opened in Contiva IDE',
        encoded: encodedContivaData,
        encodedLength: encodedContivaData.length,
        url: url,
        timestamp: new Date().toISOString()
      });
    } catch (chromeError) {
      logger.warn(`Browser opening failed: ${chromeError.message}`);
      
      res.json({
        success: true,
        message: 'Data encoded successfully (browser opening failed)',
        encoded: encodedContivaData,
        encodedLength: encodedContivaData.length,
        warning: chromeError.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error(`Error in /contiva/test: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error processing test data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /contiva/:data
 * Decodes CPIHelper encoded data from URL parameter, converts to Contiva format, and opens in IDE
 */
app.get('/contiva/:data', async (req, res) => {
  try {
    const encodedData = req.params.data;
    logger.info(`Starting decode from URL parameter`);
    logger.debug(`Encoded data length: ${encodedData.length} chars`);

    // Decode the URL-safe base64 CPIHelper data
    const cpiHelperData = decodeGroovyString(encodedData);

    logger.success(`Decoded CPIHelper format`, cpiHelperData);

    if (!cpiHelperData || typeof cpiHelperData !== "object") {
      logger.error(`Invalid decoded data type: ${typeof cpiHelperData}`);
      return res.status(400).json({
        success: false,
        message: "Decoded data is not a valid object",
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`Checking for required fields...`);
    const hasInput = !!cpiHelperData.input;
    const hasScript = !!cpiHelperData.script;
    logger.debug(`  input field: ${hasInput ? "✓" : "✗"}`);
    logger.debug(`  script field: ${hasScript ? "✓" : "✗"}`);

    // Convert CPIHelper to Contiva format
    //const contivaData = cpiHelperToContiva(cpiHelperData);
    // Hardcoded test data (same as in contiva-encoder.js)
    const contivaData = {
      currentSessionType: "groovy",
      scriptInput: '{ "test": "testval3" }',
      script:
        "//import com.sap.gateway.ip.core.customdev.util.Message;\n\ndef Message processData(Message message) {\n    return message;\n}",
      functionName: "processData",
      headers: {
        SAP_MessageProcessingLogID: "AGlnwRPCOT1y6HLEfkmHVDXWnnu0",
        SAP_TRACE_HEADER_1768407316206_MessageType: "STEP",
      },
      properties: {
        AnotherProp: "conf1",
        TestingProp: "conf2",
      },
    };
    logger.info(`Converted to Contiva format`);

    // Encode Contiva data
    const encodedContivaData = await encodeContivaData(contivaData);
    logger.info(
      `Encoded to Contiva format (${encodedContivaData.length} chars)`
    );

    // Open in Chrome
    try {
      const url = await openInChrome(encodedContivaData);
      logger.success(`Full /contiva request completed`);

      res.json({
        success: true,
        message: "Data converted and opened in Contiva IDE",
        contivaData: contivaData,
        encoded: encodedContivaData.substring(0, 100) + "...",
        encodedLength: encodedContivaData.length,
        url: url,
        timestamp: new Date().toISOString(),
      });
    } catch (chromeError) {
      // Still return success but note that browser opening failed
      logger.warn(`Browser opening failed: ${chromeError.message}`);

      res.json({
        success: true,
        message: "Data converted successfully (browser opening failed)",
        contivaData: contivaData,
        encoded: encodedData.substring(0, 100) + "...",
        encodedLength: encodedData.length,
        warning: chromeError.message,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error(`/contiva request error: ${error.message}`);

    res.status(400).json({
      success: false,
      message: 'Failed to convert and encode data',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /
 * Welcome page with usage information
 */
app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Groovy Debugger Server</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
        h2 { color: #0066cc; margin-top: 30px; }
        .endpoint { background: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #0066cc; font-family: monospace; }
        .method { color: #fff; padding: 3px 8px; border-radius: 3px; margin-right: 10px; font-weight: bold; }
        .method.get { background: #61affe; }
        .method.post { background: #49cc90; }
        code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
        .example { background: #f0f8ff; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #0066cc; }
        .example code { background: #e0e8ff; }
        .note { background: #fff3cd; padding: 15px; margin: 15px 0; border-radius: 4px; border-left: 4px solid #ffc107; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 4px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔍 Groovy Debugger Server</h1>
        <p>This server decodes Groovy Debugger encoded data sent from the browser plugin.</p>

        <h2>Available Endpoints</h2>

        <div class="endpoint">
          <div><span class="method get">GET</span> <code>/debug/{encoded-string}</code></div>
          <p>Decode data passed as URL parameter</p>
          <div class="example">
            <strong>Example:</strong><br>
            <code>http://localhost:4004/debug/LYxBCsAgEAO_UnL2BZ77DC9Wt1QoKu5aKOLfu0hvmTDJQMq1C-zAUeILi7E5CLE42D89_nbYJgwu8pEaqz0NaiuVmiRarAWHluq6CiWSXuni7DlIKllJ_UDMuxePOT8</code>
          </div>
        </div>

        <div class="endpoint">
          <div><span class="method post">POST</span> <code>/debug</code></div>
          <p>Decode data passed in JSON request body</p>
          <div class="example">
            <strong>Example:</strong><br>
            <pre>curl -X POST http://localhost:4004/debug \\
  -H "Content-Type: application/json" \\
  -d '{"data":"LYxBCsAgEAO_UnL2BZ77DC9..."}'</pre>
          </div>
        </div>

        <div class="endpoint">
          <div><span class="method post">POST</span> <code>/contiva</code></div>
          <p>Convert CPIHelper format to Contiva format, encode, and open in Contiva IDE (opens Chrome)</p>
          <div class="example">
            <strong>Example:</strong><br>
            <pre>curl -X POST http://localhost:4004/contiva \\
  -H "Content-Type: application/json" \\
  -d '{
    "input": {
      "body": "your body content",
      "headers": { "Header1": "value1" },
      "properties": { "Prop1": "value1" }
    },
    "script": {
      "code": "import com.sap.gateway.ip.core.customdev.util.Message;\\ndef Message processData(Message message) { return message; }",
      "function": "processData"
    }
  }'</pre>
          </div>
        </div>

        <h2>Response Format</h2>
        <p>Both endpoints return JSON with the following structure:</p>
        <pre>{
  "success": true,
  "message": "Data decoded successfully",
  "data": { /* decoded Groovy data */ },
  "timestamp": "2026-01-14T12:34:56.789Z"
}</pre>

        <h2>Error Handling</h2>
        <p>If decoding fails, the response will include an error message:</p>
        <pre>{
  "success": false,
  "message": "Failed to decode data",
  "error": "Error description",
  "timestamp": "2026-01-14T12:34:56.789Z"
}</pre>

        <div class="note">
          <strong>ℹ️ Note:</strong> The server expects URL-safe Base64 encoded, Deflate-compressed JSON data as generated by the Groovy Debugger plugin.
        </div>

        <h2>Starting the Server</h2>
        <pre>npm run server
# or
node groovy-server.js

# With custom port:
PORT=8080 node groovy-server.js</pre>

        <p style="margin-top: 40px; color: #666; border-top: 1px solid #ddd; padding-top: 20px;">
          Server running on <code>localhost:${PORT}</code>
        </p>
      </div>
    </body>
    </html>
  `;

  res.send(html);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  logger.debug(`Health check requested`);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);
  logger.debug(`Stack: ${err.stack}`);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('🚀 Groovy Debugger Server Started');
  console.log(`${'═'.repeat(60)}`);
  
  logger.table('Server Information', {
    'Running at': `http://localhost:${PORT}`,
    'Node Version': process.version,
    'Platform': process.platform,
    'PID': process.pid
  });
  
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET  /debug/:data          - Decode from URL parameter`);
  console.log(`   POST /debug                - Decode from request body`);
  console.log(`   POST /contiva              - Convert CPIHelper to Contiva & open IDE`);
  console.log(`   GET  /                     - Welcome page`);
  console.log(`   GET  /health               - Health check`);
  
  console.log(`\n💾 Data Dump Configuration:`);
  console.log(`   Base path:  ${DATA_DUMP_BASE}`);
  console.log(`   Debug folder: ${DATA_DUMP_DEBUG}`);
  
  console.log(`\n📂 Files saved per request:`);
  console.log(`   - ${DATA_DUMP_DEBUG}\\debug.body`);
  console.log(`   - ${DATA_DUMP_DEBUG}\\debug.header`);
  console.log(`   - ${DATA_DUMP_DEBUG}\\debug.properties`);
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Ready to accept requests\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server gracefully...');
  logger.info(`Process terminated by user`);
  process.exit(0);
});
