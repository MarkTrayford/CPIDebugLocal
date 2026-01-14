# CPIDebugLocal

A Node.js project for decoding and encoding Groovy debugger data. This includes an Express.js server that receives encoded debug data, decodes it, and can reroute it to the Contiva IDE.

## Project Overview

This project consists of two main components:

1. **Groovy Server** (`groovy-server.js`) - An Express.js HTTP server that listens for encoded Groovy debugger data and decodes it
2. **Contiva Encoder** (`contiva-encoder.js`) - Handles encoding/decoding of Contiva format data with Base64, DEFLATE, and ZIP compression

## Features

- Decode Base64-encoded, DEFLATE-compressed Groovy debugger data
- Encode Contiva format data back to Base64 strings
- REST API endpoints for receiving debug data
- File saving and management of decoded debug data
- Integration with Contiva IDE via Chrome

## Installation

```bash
npm install
```

## Usage

### Start the Server

```bash
npm start
# or
npm run server
```

The server will start on `http://localhost:4004` (configurable via PORT environment variable)

### Available Endpoints

- `GET /debug/` - Receive and decode debug data, save locally
- `GET /contiva/` - Receive debug data and convert/reroute to Contiva IDE

### Available Scripts

- `npm start` - Start the Groovy server
- `npm run decode` - Run the decoder
- `npm run analyze` - Run advanced analysis
- `npm run decode-universal` - Run universal decoder

## Data Flow

The encoding/decoding process follows these steps:

**Encoding:**
1. Contiva JSON object
2. Convert to ZIP file
3. Apply DEFLATE compression
4. Encode to Base64
5. URL-encode the result

**Decoding:**
1. URL-decode the string
2. Decode from Base64
3. Decompress DEFLATE data
4. Extract ZIP contents
5. Parse resulting JSON

## Dependencies

- `express` - HTTP server framework
- `archiver` - ZIP file creation
- `unzipper` - ZIP file extraction
- `pako` - DEFLATE compression/decompression

## License

MIT