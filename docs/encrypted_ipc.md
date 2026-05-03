# Encrypted IPC Communication

Pulsar supports AES-256-GCM encryption of its stdio MCP transport to prevent sensitive data leakage in shared or multi-tenant environments.

## How It Works

When `PULSAR_IPC_ENCRYPTION_KEY` is set, Pulsar replaces the default plaintext stdio transport with `EncryptedStdioServerTransport`. Every JSON-RPC message (request and response) is wrapped in a versioned encrypted envelope before being written to stdout, and every incoming line from stdin is decrypted and authenticated before processing.

The envelope format is newline-delimited JSON:

```json
{
  "v": 1,
  "nonce": "<12-byte base64>",
  "ciphertext": "<base64>",
  "tag": "<16-byte base64>"
}
```

- **Algorithm**: AES-256-GCM  
- **Nonce**: 12 random bytes, freshly generated per message  
- **Tag**: 16-byte GCM authentication tag — any tampered or miskeyed frame is rejected and the connection is closed  

If `PULSAR_IPC_ENCRYPTION_KEY` is not set, Pulsar falls back to the standard plaintext `StdioServerTransport` with no behaviour change.

## Configuration

Add the key to your environment or `.env` file:

```env
# 32-byte key — provide as 64 hex characters or base64
PULSAR_IPC_ENCRYPTION_KEY=<your-64-hex-char-or-base64-key>
```

### Generating a Key

```bash
# hex (recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# base64
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Client Requirements

Any MCP client connecting to an encryption-enabled Pulsar instance **must** send and receive the same versioned envelope format using the same 32-byte key. Plaintext frames are rejected immediately and the transport is closed.

## Security Properties

| Property | Detail |
|---|---|
| Algorithm | AES-256-GCM |
| Key size | 256 bits (32 bytes) |
| Nonce | 96-bit random per message |
| Integrity | GCM authentication tag — rejects tampered/miskeyed frames |
| Key in logs | Redacted via pino `redact` paths (`PULSAR_IPC_ENCRYPTION_KEY`) |
| Key in CLI args | Never passed as a process argument |
| Key in stderr | Never emitted |

## Error Handling

| Condition | Behaviour |
|---|---|
| Malformed JSON frame | `onerror` callback fired; connection closed |
| Missing envelope fields | `onerror` callback fired; connection closed |
| GCM authentication failure | `onerror` callback fired; connection closed |
| Invalid nonce/tag length | `onerror` callback fired; connection closed |
| Plaintext frame received | `onerror` callback fired; connection closed |
