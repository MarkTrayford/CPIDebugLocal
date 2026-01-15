import com.sun.net.httpserver.HttpServer
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpExchange
import java.nio.file.Files
import java.nio.file.Paths
import java.util.zip.Inflater
import java.util.Base64
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

// Decodes GroovyIDE Format and saves on filesystem


static void main(String[] args) {
    def port = 8080
    def server = HttpServer.create(new InetSocketAddress(port), 0)

    println "🚀 Groovy Simple Decoder Server"
    println "=" * 50

    // Root handler
    server.createContext("/", { exchange ->
        def response = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>Groovy Decoder Server</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
                    h1 { color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
                    .endpoint { background: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #0066cc; }
                    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔍 Groovy Decoder Server</h1>
                    <p>Simple HTTP server for decoding and saving Groovy debugger data.</p>
                    
                    <h2>Endpoints</h2>
                    <div class="endpoint">
                        <strong>GET</strong> <code>/decode/{encoded-data}</code><br>
                        Decode from URL parameter and save files
                    </div>
                    <div class="endpoint">
                        <strong>POST</strong> <code>/decode</code><br>
                        Send JSON with "data" field: <code>{"data": "encoded-string"}</code>
                    </div>
                    <div class="endpoint">
                        <strong>GET</strong> <code>/health</code><br>
                        Health check endpoint
                    </div>
                </div>
            </body>
            </html>
        """
        exchange.sendResponseHeaders(200, response.length())
        exchange.responseBody.write(response.getBytes())
        exchange.responseBody.close()
    } as HttpHandler)

    // Decode handler
    server.createContext("/debug", { exchange ->
        try {
            def method = exchange.requestMethod
            def path = exchange.requestURI.path
            def data = null

            if (method == "GET") {
                // Extract data from URL: /decode/{data}
                data = path - "/debug/"
                if (data.isEmpty()) {
                    sendJsonResponse(exchange, 400, [success: false, message: "Missing encoded data in URL"])
                    return
                }
            } else if (method == "POST") {
                // Read POST body
                def body = exchange.requestBody.text
                def json = new JsonSlurper().parseText(body)
                data = json.data
                if (!data) {
                    sendJsonResponse(exchange, 400, [success: false, message: 'Missing "data" field'])
                    return
                }
            } else {
                sendJsonResponse(exchange, 405, [success: false, message: "Method not allowed"])
                return
            }

            println "\n📨 Received ${method} request with ${data.size()} chars of data"

            // Decode the data
            def decodedData = decodeGroovyData(data)
            println "✅ Successfully decoded"

            // Save files
            def fileResult = saveDecodedFiles(decodedData)
            println "💾 Files saved successfully\n"

            def response = [
                    success: true,
                    message: 'Data decoded and saved successfully',
                    decodedData: decodedData,
                    files: fileResult
            ]
            sendJsonResponse(exchange, 200, response)

        } catch (Exception e) {
            println "❌ Error: ${e.message}"
            e.printStackTrace()
            sendJsonResponse(exchange, 400, [
                    success: false,
                    message: 'Failed to decode data',
                    error: e.message
            ])
        }
    } as HttpHandler)

    // Health check handler
    server.createContext("/health", { exchange ->
        sendJsonResponse(exchange, 200, [
                status: 'ok',
                timestamp: new Date().toString(),
                message: 'Groovy Decoder Server is running'
        ])
    } as HttpHandler)

    // Start server
    server.setExecutor(null)
    println "Server starting on http://localhost:${port}..."
    println "=" * 50
    server.start()
}

/**
 * Decodes Groovy Debugger encoded string
 * Process: URL-safe Base64 -> Standard Base64 -> Inflate -> JSON
 */
static Map<String, Object> decodeGroovyData(String urlSafeBase64) {
    // Step 1: Convert URL-safe Base64 to standard Base64
    String standardBase64 = urlSafeBase64
            .replace('-' as char, '+' as char)
            .replace('_' as char, '/' as char)

    // Step 2: Add padding if needed
    int paddingNeeded = (4 - (standardBase64.length() % 4)) % 4
    standardBase64 += '=' * paddingNeeded

    // Step 3: Decode Base64 to binary
    byte[] buffer = Base64.decoder.decode(standardBase64)
    println "  📦 Base64 decoded: ${buffer.length} bytes"

    // Step 4: Decompress with Deflate
    Inflater inflater = new Inflater(true)
    inflater.setInput(buffer)
    byte[] decompressed = new byte[10240]
    int decompressedLength = inflater.inflate(decompressed)
    inflater.end()
    println "  📦 Deflate decompressed: ${decompressedLength} bytes"

    // Step 5: Convert to UTF-8 string
    String jsonString = new String(decompressed, 0, decompressedLength, 'UTF-8')

    // Step 6: Parse JSON
    def json = new JsonSlurper().parseText(jsonString)
    return json as Map
}

/**
 * Saves decoded data to files
 */
static Map<String, String> saveDecodedFiles(Map<String, Object> decodedData) {
    def baseDir = System.getenv('DATA_DUMP_PATH') ?: 'C:\\CPIViewer\\DataDump'
    def debugDir = "${baseDir}\\Debug"
    def propertiesDir = "${baseDir}\\Properties"

    // Create directories
    Files.createDirectories(Paths.get(debugDir))
    Files.createDirectories(Paths.get(propertiesDir))

    // Generate filename with timestamp
    def timestamp = new Date().format('yyyyMMdd_HHmmss_SSS')
    def filename = "decoded"

    def input = decodedData.input ?: [:]

    // Save body file
    def bodyPath = "${propertiesDir}\\${filename}.body"
    def bodyContent = (input.body ?: '').toString()
    Files.write(Paths.get(bodyPath), bodyContent.bytes)
    println "  📄 Body saved: ${bodyPath}"

    // Save headers file
    def headersPath = "${propertiesDir}\\${filename}.header"
    def headersContent = formatAsProperties('Header Contents', input.headers ?: [:])
    Files.write(Paths.get(headersPath), headersContent.bytes)
    println "  📄 Headers saved: ${headersPath}"

    // Save properties file
    def propertiesPath = "${propertiesDir}\\${filename}.properties"
    def propertiesContent = formatAsProperties('Properties Contents', input.properties ?: [:])
    Files.write(Paths.get(propertiesPath), propertiesContent.bytes)
    println "  📄 Properties saved: ${propertiesPath}"

    return [
            body: bodyPath,
            header: headersPath,
            properties: propertiesPath
    ]
}

/**
 * Converts map to Java properties file format
 */
static String formatAsProperties(String title, Map<String, Object> data) {
    def lines = []
    lines.add("#${title}")
    lines.add("#${new Date()}")

    data.each { key, value ->
        def valStr = value instanceof String ? value : JsonOutput.toJson(value)
        // Escape special characters
        valStr = valStr.replace('\\' as char, '\\\\' as char)
                .replace('=' as char, '\\=' as char)
                .replace(':' as char, '\\:' as char)
        lines.add("${key}=${valStr}")
    }

    return lines.join('\n')
}

/**
 * Sends JSON response
 */
static void sendJsonResponse(HttpExchange exchange, int statusCode, Map<String, Object> data) {
    def jsonResponse = JsonOutput.toJson(data)
    exchange.responseHeaders.set('Content-Type', 'application/json')
    exchange.sendResponseHeaders(statusCode, jsonResponse.length())
    exchange.responseBody.write(jsonResponse.getBytes())
    exchange.responseBody.close()
}