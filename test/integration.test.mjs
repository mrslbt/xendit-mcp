#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const INFO = "\x1b[36m·\x1b[0m";
const SKIP = "\x1b[33m∘\x1b[0m";

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`${PASS} ${label}`);
  } else {
    failures++;
    console.log(`${FAIL} ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const hasKey = !!process.env.XENDIT_API_KEY;
const liveCalls = hasKey && !process.env.SKIP_LIVE;
const disbursementsOn = process.env.XENDIT_ENABLE_DISBURSEMENTS === "true";

if (!hasKey) {
  console.log(
    `${SKIP} XENDIT_API_KEY not set — running protocol-only checks (no live API calls).`
  );
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: {
    ...process.env,
    XENDIT_API_KEY: process.env.XENDIT_API_KEY ?? "xnd_development_dummy_key_for_protocol_only",
  },
});

const client = new Client(
  { name: "xendit-integration-test", version: "1.0.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  console.log(`${PASS} Server connected`);

  // ── Tool surface (with gating) ──────────────────
  const toolsResp = await client.listTools();
  const toolNames = toolsResp.tools.map((t) => t.name).sort();
  console.log(`${INFO} tools: ${toolNames.join(", ")}`);

  const baseTools = [
    "get_balance",
    "list_invoices",
    "get_invoice",
    "create_invoice",
    "expire_invoice",
    "list_transactions",
  ];
  const disbursementTools = ["create_disbursement", "get_disbursement", "list_disbursement_banks"];

  for (const t of baseTools) {
    check(`base tool registered: ${t}`, toolNames.includes(t));
  }

  if (disbursementsOn) {
    for (const t of disbursementTools) {
      check(`disbursement tool registered: ${t}`, toolNames.includes(t));
    }
  } else {
    for (const t of disbursementTools) {
      check(
        `disbursement tool gated off (default): ${t}`,
        !toolNames.includes(t),
        toolNames.includes(t) ? "leaked through gating" : undefined
      );
    }
  }

  // ── Prompt surface ──────────────────────────────
  const promptsResp = await client.listPrompts();
  const promptNames = promptsResp.prompts.map((p) => p.name).sort();
  for (const name of [
    "check_balance",
    "recent_payments",
    "create_payment_link",
    "unpaid_invoices",
    "daily_summary",
  ]) {
    check(`prompt registered: ${name}`, promptNames.includes(name));
  }

  // ── Resource surface ────────────────────────────
  const resourcesResp = await client.listResources();
  const resourceUris = resourcesResp.resources.map((r) => r.uri).sort();
  check("resource registered: xendit://banks", resourceUris.includes("xendit://banks"));
  check("resource registered: xendit://info", resourceUris.includes("xendit://info"));

  const banks = await client.readResource({ uri: "xendit://banks" });
  const banksBody = JSON.parse(banks.contents[0].text);
  check(
    "xendit://banks returns Indonesia bank codes",
    Array.isArray(banksBody.indonesia) && banksBody.indonesia.length > 0
  );

  // ── Live API checks (require key, skipped if absent or SKIP_LIVE=1) ──
  if (liveCalls) {
    console.log(`${INFO} Running live API calls against Xendit sandbox`);

    // get_balance — read-only, safe
    const balance = await client.callTool({
      name: "get_balance",
      arguments: {},
    });
    if (balance.isError) {
      console.log(`${INFO} get_balance error: ${JSON.stringify(balance.content)}`);
    }
    check("get_balance succeeded against real sandbox", !balance.isError);

    // list_invoices — read-only, safe
    const invoices = await client.callTool({
      name: "list_invoices",
      arguments: { limit: 3 },
    });
    if (invoices.isError) {
      console.log(`${INFO} list_invoices error: ${JSON.stringify(invoices.content)}`);
    }
    check("list_invoices succeeded against real sandbox", !invoices.isError);

    // create_invoice → get_invoice → expire_invoice (full lifecycle)
    const externalId = `xendit-mcp-test-${Date.now()}`;
    const created = await client.callTool({
      name: "create_invoice",
      arguments: {
        externalId,
        amount: 10000,
        description: "xendit-mcp integration test",
        currency: "IDR",
      },
    });
    if (created.isError) {
      console.log(`${INFO} create_invoice error: ${JSON.stringify(created.content)}`);
    }
    check("create_invoice succeeded", !created.isError);

    let invoiceId;
    if (!created.isError) {
      const text = created.content.find((c) => c.type === "text")?.text ?? "";
      try {
        const body = JSON.parse(text);
        invoiceId = body.id;
      } catch {
        // server may format differently; fall back to regex
        const m = text.match(/"id"\s*:\s*"([^"]+)"/);
        invoiceId = m?.[1];
      }
      check("create_invoice response includes invoice id", !!invoiceId);
    }

    if (invoiceId) {
      const fetched = await client.callTool({
        name: "get_invoice",
        arguments: { invoiceId },
      });
      check("get_invoice round-trip", !fetched.isError);

      const expired = await client.callTool({
        name: "expire_invoice",
        arguments: { invoiceId },
      });
      check("expire_invoice cleans up", !expired.isError);
    }
  } else {
    console.log(`${SKIP} Live API calls skipped (no key or SKIP_LIVE=1).`);
  }

  console.log(`${INFO} Closing client`);
  await client.close();
} catch (err) {
  console.log(`${FAIL} Unhandled error: ${err.message}`);
  failures++;
}

if (failures > 0) {
  console.log(`\n${FAIL} ${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\n${PASS} All checks passed`);
process.exit(0);
