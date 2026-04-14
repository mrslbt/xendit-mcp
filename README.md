# xendit-mcp

[![xendit-mcp MCP server](https://glama.ai/mcp/servers/mrslbt/xendit-mcp/badges/score.svg)](https://glama.ai/mcp/servers/mrslbt/xendit-mcp)

MCP server for [Xendit](https://www.xendit.co/) payment APIs.

Manage invoices, send disbursements, check balances, and track transactions across Southeast Asia. One API key, one install.

## Install

```bash
npx xendit-mcp
```

Or install globally:

```bash
npm install -g xendit-mcp
```

## Setup

1. Sign up at [Xendit Dashboard](https://dashboard.xendit.co/) (free, includes test mode)
2. Go to Settings > API Keys and generate a key
3. Use your test key (`xnd_development_...`) to try it out, or your live key for real transactions

### Claude Desktop

Add to your `claude_desktop_config.json`:

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
claude mcp add xendit -- npx -y xendit-mcp
```

Then set your environment variable:

```bash
export XENDIT_API_KEY="your-api-key"
```

## Tools

| Tool | Description |
|------|-------------|
| `get_balance` | Check account balance by type (CASH, HOLDING, TAX) |
| `list_invoices` | List invoices with filters for status, date range, currency |
| `get_invoice` | Get details of a specific invoice |
| `create_invoice` | Create a payment invoice and get a payment link |
| `expire_invoice` | Expire an active invoice |
| `list_transactions` | List payments, disbursements, refunds, and fees |
| `create_disbursement` | Send money to a bank account or e-wallet |
| `get_disbursement` | Check disbursement status |
| `list_disbursement_banks` | List available banks and e-wallets by country |

## Prompts

| Prompt | Description |
|--------|-------------|
| `check_balance` | Check your account balance |
| `recent_payments` | Show payments received in the last N days |
| `create_payment_link` | Create a payment link for a customer |
| `unpaid_invoices` | List all pending invoices |
| `send_payout` | Send money to a bank account |
| `daily_summary` | Get today's payment activity summary |

## Resources

| Resource | URI | Description |
|----------|-----|-------------|
| Supported Banks | `xendit://banks` | Common bank codes for Indonesia and the Philippines |
| API Info | `xendit://info` | Xendit API details and rate limits |

## Example queries

```
What's my current Xendit balance?
Saldo Xendit saya berapa?

Create an invoice for Rp 500,000 for "Website design deposit"
Buatkan invoice Rp 500.000 untuk "Deposit desain website"

Show me all unpaid invoices
Tampilkan semua invoice yang belum dibayar

Send Rp 1,000,000 to Ahmad at BCA
Kirim Rp 1.000.000 ke Ahmad di BCA

What payments came in today?
Ada pembayaran masuk hari ini?

List available banks for disbursement in the Philippines
```

## Supported countries

Xendit operates in Indonesia, the Philippines, Thailand, Vietnam, and Malaysia. This server supports all currencies available through the Xendit API (IDR, PHP, THB, VND, MYR, USD).

## Test mode

Xendit gives you separate test and live API keys. Use your test key (`xnd_development_...`) to try everything without moving real money. All tools work the same in test mode.

## License

MIT
