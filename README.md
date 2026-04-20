# xendit-mcp

[![MCP Badge](https://lobehub.com/badge/mcp/mrslbt-xendit-mcp)](https://lobehub.com/mcp/mrslbt-xendit-mcp)
[![xendit-mcp MCP server](https://glama.ai/mcp/servers/mrslbt/xendit-mcp/badges/score.svg)](https://glama.ai/mcp/servers/mrslbt/xendit-mcp)

Model Context Protocol server for the [Xendit](https://www.xendit.co/) payment API. Supports invoices, disbursements, balances, and transactions across Indonesia, the Philippines, Thailand, Vietnam, and Malaysia.

## Install

```bash
npm install -g xendit-mcp
```

Or run on demand with `npx xendit-mcp`.

## Configuration

1. Sign up at the [Xendit Dashboard](https://dashboard.xendit.co/).
2. Go to Settings → API Keys and generate a key.
3. Use a test key (`xnd_development_...`) for development or a live key for production.

| Variable | Required | Description |
|---|---|---|
| `XENDIT_API_KEY` | yes | Test or live API key |
| `XENDIT_ENABLE_DISBURSEMENTS` | no | Set to `true` to enable disbursement tools (money-movement). Disabled by default. |
| `XENDIT_ALLOW_LIVE` | no | Set to `true` to allow live/production keys (prefixes `xnd_production_`, `iluma_production_`, `sk_live_`). Refused by default. |

### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xendit": {
      "command": "npx",
      "args": ["-y", "xendit-mcp"],
      "env": {
        "XENDIT_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add xendit -e XENDIT_API_KEY=your-api-key -- npx -y xendit-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` with the same shape as Claude Desktop.

## Tools

| Tool | Description |
|---|---|
| `get_balance` | Account balance by type (CASH, HOLDING, TAX). |
| `list_invoices` | List invoices filtered by status, date range, or currency. |
| `get_invoice` | Retrieve a single invoice. |
| `create_invoice` | Create a payment invoice and return a payment link. |
| `expire_invoice` | Expire an active invoice. |
| `list_transactions` | List payments, disbursements, refunds, and fees. |
| `create_disbursement` | Send funds to a bank account or e-wallet. **Disabled unless `XENDIT_ENABLE_DISBURSEMENTS=true`.** |
| `get_disbursement` | Check disbursement status. **Disabled unless `XENDIT_ENABLE_DISBURSEMENTS=true`.** |
| `list_disbursement_banks` | List supported banks and e-wallets by country. **Disabled unless `XENDIT_ENABLE_DISBURSEMENTS=true`.** |

## Prompts

| Prompt | Description |
|---|---|
| `check_balance` | Report account balance. |
| `recent_payments` | Payments received in the last N days. |
| `create_payment_link` | Generate a payment link for a customer. |
| `unpaid_invoices` | List pending invoices. |
| `daily_summary` | Today's payment activity. |

## Resources

| Resource | URI | Description |
|---|---|---|
| Supported Banks | `xendit://banks` | Bank codes for Indonesia and the Philippines. |
| API Info | `xendit://info` | Xendit API details and rate limits. |

## Example queries

```
What's my current Xendit balance?
Saldo Xendit saya berapa?

Create an invoice for Rp 500,000 for "Website design deposit".
Buatkan invoice Rp 500.000 untuk "Deposit desain website".

Show me all unpaid invoices.
Tampilkan semua invoice yang belum dibayar.

```

With `XENDIT_ENABLE_DISBURSEMENTS=true`:

```
Send Rp 1,000,000 to Ahmad at BCA.
Kirim Rp 1.000.000 ke Ahmad di BCA.

List available banks for disbursement in the Philippines.
```

## Environments

Xendit issues separate test and live API keys. Test keys operate against the Xendit sandbox, so no real funds move. Live keys (`xnd_production_...`, `iluma_production_...`, `sk_live_...`) operate against production.

## Safety

This server can move real money through the Xendit API. Key safeguards:

- **Disbursement tools are disabled by default.** `create_disbursement`, `get_disbursement`, and `list_disbursement_banks` are only registered when `XENDIT_ENABLE_DISBURSEMENTS=true`. Only enable them in trusted agent contexts where tool inputs cannot be influenced by untrusted content.
- **Live keys are refused by default.** Keys with the prefixes `xnd_production_`, `iluma_production_`, or `sk_live_` are rejected at startup unless `XENDIT_ALLOW_LIVE=true`. Always test with a development key (`xnd_development_...`) first.
- **Idempotency.** `create_disbursement` uses your `externalId` as the `Idempotency-Key`, so retries with the same `externalId` will not create duplicate transfers. Use a fresh `externalId` for each new disbursement.

Even with these gates on, review any money-moving request before approving the tool call. Treat tool inputs derived from model output as untrusted.

## Disclaimer

This is an unofficial, community-built MCP server. Not affiliated with, endorsed by, or sponsored by Xendit. Xendit is a trademark of its respective owners. Use at your own risk. The author accepts no liability for funds lost through misuse, prompt injection, or bugs.

## License

[MIT](LICENSE)
