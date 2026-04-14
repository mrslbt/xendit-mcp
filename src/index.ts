#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const XENDIT_API_BASE = "https://api.xendit.co";

function getApiKey(): string {
  const key = process.env.XENDIT_API_KEY;
  if (!key) {
    throw new Error(
      "XENDIT_API_KEY not set. Get one at https://dashboard.xendit.co/settings/developers#api-keys"
    );
  }
  return key;
}

function authHeader(): string {
  return "Basic " + Buffer.from(getApiKey() + ":").toString("base64");
}

async function xenditRequest(
  path: string,
  options: {
    method?: string;
    params?: Record<string, string>;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}
): Promise<unknown> {
  const { method = "GET", params, body, headers = {} } = options;

  let url = `${XENDIT_API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.error_code || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Xendit API error (${res.status}): ${errorMessage}`);
  }

  const text = await res.text();
  if (!text) return { success: true };
  return JSON.parse(text);
}

const server = new McpServer({
  name: "xendit-mcp",
  version: "0.1.0",
});

// --- Tools ---

// Balance
server.tool(
  "get_balance",
  "Get your Xendit account balance. Returns available balance by account type (CASH, HOLDING, TAX).",
  {
    accountType: z
      .enum(["CASH", "HOLDING", "TAX"])
      .default("CASH")
      .describe("Account type to check"),
    currency: z
      .string()
      .optional()
      .describe("Currency code (e.g., IDR, PHP). Defaults to your account's primary currency."),
  },
  async ({ accountType, currency }) => {
    const params: Record<string, string> = { account_type: accountType };
    if (currency) params.currency = currency;

    const data = await xenditRequest("/balance", { params });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// List invoices
server.tool(
  "list_invoices",
  "List invoices from your Xendit account with optional filters for status, date range, and pagination.",
  {
    status: z
      .enum(["PENDING", "PAID", "SETTLED", "EXPIRED"])
      .optional()
      .describe("Filter by invoice status"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(10)
      .describe("Number of invoices to return (1-100)"),
    createdAfter: z
      .string()
      .optional()
      .describe("Return invoices created after this date (ISO 8601, e.g., 2025-01-01T00:00:00Z)"),
    createdBefore: z
      .string()
      .optional()
      .describe("Return invoices created before this date (ISO 8601)"),
    currency: z
      .string()
      .optional()
      .describe("Filter by currency (IDR, PHP, etc.)"),
  },
  async ({ status, limit, createdAfter, createdBefore, currency }) => {
    const params: Record<string, string> = { limit: String(limit) };
    if (status) params.statuses = `["${status}"]`;
    if (createdAfter) params.created_after = createdAfter;
    if (createdBefore) params.created_before = createdBefore;
    if (currency) params.currency = currency;

    const data = (await xenditRequest("/v2/invoices", { params })) as Array<Record<string, unknown>>;

    const invoices = data.map((inv) => ({
      id: inv.id,
      externalId: inv.external_id,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      description: inv.description,
      payerEmail: inv.payer_email,
      invoiceUrl: inv.invoice_url,
      created: inv.created,
      paidAt: inv.paid_at,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(invoices, null, 2) }],
    };
  }
);

// Get single invoice
server.tool(
  "get_invoice",
  "Get details of a specific Xendit invoice by ID.",
  {
    invoiceId: z.string().describe("Xendit invoice ID"),
  },
  async ({ invoiceId }) => {
    const data = await xenditRequest(`/v2/invoices/${invoiceId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Create invoice
server.tool(
  "create_invoice",
  "Create a new payment invoice. Returns a payment link your customer can use to pay.",
  {
    externalId: z.string().describe("Your unique reference ID for this invoice"),
    amount: z.number().positive().describe("Invoice amount"),
    currency: z
      .enum(["IDR", "PHP", "THB", "VND", "MYR", "USD"])
      .default("IDR")
      .describe("Currency code"),
    description: z.string().optional().describe("Invoice description shown to the payer"),
    payerEmail: z.string().optional().describe("Payer's email address"),
    invoiceDuration: z
      .number()
      .optional()
      .describe("Invoice expiry duration in seconds (default: 86400 = 24 hours)"),
  },
  async ({ externalId, amount, currency, description, payerEmail, invoiceDuration }) => {
    const body: Record<string, unknown> = {
      external_id: externalId,
      amount,
      currency,
    };
    if (description) body.description = description;
    if (payerEmail) body.payer_email = payerEmail;
    if (invoiceDuration) body.invoice_duration = invoiceDuration;

    const data = await xenditRequest("/v2/invoices", { method: "POST", body });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Expire invoice
server.tool(
  "expire_invoice",
  "Expire an active invoice so it can no longer be paid.",
  {
    invoiceId: z.string().describe("Xendit invoice ID to expire"),
  },
  async ({ invoiceId }) => {
    const data = await xenditRequest(`/invoices/${invoiceId}/expire!`, { method: "POST" });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// List transactions
server.tool(
  "list_transactions",
  "List transactions from your Xendit account. Includes payments received, disbursements, fees, and adjustments.",
  {
    types: z
      .enum(["PAYMENT", "DISBURSEMENT", "REFUND", "FEE", "ADJUSTMENT"])
      .optional()
      .describe("Filter by transaction type"),
    status: z
      .enum(["SUCCESS", "PENDING", "FAILED", "VOIDED"])
      .optional()
      .describe("Filter by status"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of transactions (1-50)"),
    currency: z.string().optional().describe("Filter by currency"),
    createdGte: z.string().optional().describe("Created on or after (ISO 8601)"),
    createdLte: z.string().optional().describe("Created on or before (ISO 8601)"),
  },
  async ({ types, status, limit, currency, createdGte, createdLte }) => {
    const params: Record<string, string> = { limit: String(limit) };
    if (types) params.types = types;
    if (status) params.statuses = status;
    if (currency) params.currency = currency;
    if (createdGte) params["created[gte]"] = createdGte;
    if (createdLte) params["created[lte]"] = createdLte;

    const data = (await xenditRequest("/transactions", { params })) as {
      data?: Array<Record<string, unknown>>;
      has_more?: boolean;
    };

    const transactions = (data.data ?? []).map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      channel: tx.channel_code,
      reference: tx.reference_id,
      created: tx.created,
      settled: tx.settled_at,
      fee: tx.fee,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { hasMore: data.has_more, transactions },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Create disbursement
server.tool(
  "create_disbursement",
  "Send money to a bank account or e-wallet. Supports Indonesian and Philippine banks.",
  {
    externalId: z.string().describe("Your unique reference ID"),
    amount: z.number().positive().describe("Amount to send"),
    bankCode: z.string().describe("Bank code (e.g., BCA, BNI, BRI, MANDIRI, BPI, BDO)"),
    accountHolderName: z.string().describe("Recipient's name as registered with the bank"),
    accountNumber: z.string().describe("Recipient's bank account number"),
    description: z.string().optional().describe("Transfer description"),
    currency: z
      .enum(["IDR", "PHP", "THB", "VND", "MYR"])
      .default("IDR")
      .describe("Currency code"),
  },
  async ({ externalId, amount, bankCode, accountHolderName, accountNumber, description, currency }) => {
    const body: Record<string, unknown> = {
      external_id: externalId,
      amount,
      bank_code: bankCode,
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      currency,
    };
    if (description) body.description = description;

    const idempotencyKey = `${externalId}-${Date.now()}`;
    const data = await xenditRequest("/v2/disbursements", {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Get disbursement
server.tool(
  "get_disbursement",
  "Check the status of a disbursement by ID.",
  {
    disbursementId: z.string().describe("Xendit disbursement ID"),
  },
  async ({ disbursementId }) => {
    const data = await xenditRequest(`/v2/disbursements/${disbursementId}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// List available banks for disbursement
server.tool(
  "list_disbursement_banks",
  "List banks and e-wallets available for disbursements in a specific country.",
  {
    channelCategory: z
      .enum(["BANK", "EWALLET"])
      .optional()
      .describe("Filter by channel type"),
    currency: z
      .enum(["IDR", "PHP", "THB", "VND", "MYR"])
      .optional()
      .describe("Filter by currency"),
  },
  async ({ channelCategory, currency }) => {
    const params: Record<string, string> = {};
    if (channelCategory) params.channel_category = channelCategory;
    if (currency) params.currency = currency;

    const data = await xenditRequest("/available_disbursements_banks", { params });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

// --- Prompts ---

server.prompt(
  "check_balance",
  "Check your Xendit account balance",
  {
    currency: z.string().optional().describe("Currency (IDR, PHP, etc.)"),
  },
  ({ currency }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: currency
            ? `Check my Xendit ${currency} balance`
            : `Check my Xendit balance`,
        },
      },
    ],
  })
);

server.prompt(
  "recent_payments",
  "Show recent payments received",
  {
    days: z.string().optional().describe("Number of days to look back (default: 7)"),
  },
  ({ days }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Show me payments received in the last ${days || "7"} days from Xendit`,
        },
      },
    ],
  })
);

server.prompt(
  "create_payment_link",
  "Create a payment link for a customer",
  {
    amount: z.string().describe("Amount to charge"),
    description: z.string().describe("What the payment is for"),
    currency: z.string().optional().describe("Currency (default: IDR)"),
  },
  ({ amount, description, currency }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Create a Xendit invoice for ${currency || "IDR"} ${amount} for "${description}" and give me the payment link`,
        },
      },
    ],
  })
);

server.prompt(
  "unpaid_invoices",
  "List all unpaid invoices",
  {},
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `List all pending (unpaid) invoices from Xendit`,
        },
      },
    ],
  })
);

server.prompt(
  "send_payout",
  "Send money to a bank account",
  {
    amount: z.string().describe("Amount to send"),
    bank: z.string().describe("Bank name or code (e.g., BCA, BNI, BPI)"),
    recipient: z.string().describe("Recipient name"),
  },
  ({ amount, bank, recipient }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Send IDR ${amount} to ${recipient} at ${bank} via Xendit`,
        },
      },
    ],
  })
);

server.prompt(
  "daily_summary",
  "Get a summary of today's payment activity",
  {},
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Give me a summary of today's Xendit transactions: total payments received, total disbursements sent, and current balance`,
        },
      },
    ],
  })
);

// --- Resources ---

server.resource(
  "supported-banks",
  "xendit://banks",
  {
    description: "Common bank codes for Indonesia and the Philippines",
    mimeType: "application/json",
  },
  async () => ({
    contents: [
      {
        uri: "xendit://banks",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            note: "Use list_disbursement_banks tool for the full live list. Common codes below.",
            indonesia: [
              { code: "BCA", name: "Bank Central Asia" },
              { code: "BNI", name: "Bank Negara Indonesia" },
              { code: "BRI", name: "Bank Rakyat Indonesia" },
              { code: "MANDIRI", name: "Bank Mandiri" },
              { code: "PERMATA", name: "Bank Permata" },
              { code: "CIMB", name: "CIMB Niaga" },
              { code: "BSI", name: "Bank Syariah Indonesia" },
            ],
            philippines: [
              { code: "BPI", name: "Bank of the Philippine Islands" },
              { code: "BDO", name: "BDO Unibank" },
              { code: "UNIONBANK", name: "UnionBank of the Philippines" },
              { code: "METROBANK", name: "Metropolitan Bank and Trust" },
              { code: "LANDBANK", name: "Land Bank of the Philippines" },
            ],
            currencies: ["IDR", "PHP", "THB", "VND", "MYR", "USD"],
          },
          null,
          2
        ),
      },
    ],
  })
);

server.resource(
  "api-info",
  "xendit://info",
  {
    description: "Xendit API information and rate limits",
    mimeType: "application/json",
  },
  async () => ({
    contents: [
      {
        uri: "xendit://info",
        mimeType: "application/json",
        text: JSON.stringify(
          {
            name: "Xendit",
            description: "Payment gateway for Southeast Asia. Supports invoices, disbursements, virtual accounts, and e-wallets.",
            countries: ["Indonesia", "Philippines", "Thailand", "Vietnam", "Malaysia"],
            rateLimits: {
              test: "60 requests/minute per endpoint",
              live: "600 requests/minute per endpoint",
            },
            docs: "https://developers.xendit.co/api-reference/",
            dashboard: "https://dashboard.xendit.co/",
          },
          null,
          2
        ),
      },
    ],
  })
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Xendit MCP server running on stdio");
  if (!process.env.XENDIT_API_KEY) {
    console.error(
      "Warning: XENDIT_API_KEY not set. Tools will fail until configured. Get your key at https://dashboard.xendit.co/settings/developers#api-keys"
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
