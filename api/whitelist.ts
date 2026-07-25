// Vercel serverless function: auto-whitelist any address for the confidential
// KYC gate. Uses a dedicated whitelister key (holds only the WhitelistAdminCap),
// never the deployer key. This makes the demo "open KYC" — anyone can register a
// confidential account. Testnet only.
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGrpcClient } from "@mysten/sui/grpc";

const AGUSD_PKG = "0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab";
const WHITELIST = "0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae";
const WL_ADMIN_CAP = "0x8d1d9d823c04117cc7d46516fb6d85c58eaf114aeac69eaa1111364e6b81d20a";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const address = body.address;
  if (!/^0x[0-9a-fA-F]{64}$/.test(address ?? "")) return res.status(400).json({ error: "invalid address" });

  const secret = process.env.WHITELISTER_SECRET;
  if (!secret) return res.status(500).json({ error: "whitelister not configured" });

  try {
    const kp = Ed25519Keypair.fromSecretKey(secret);
    const base = new SuiGrpcClient({ network: "testnet", baseUrl: "https://fullnode.testnet.sui.io:443" });
    const tx = new Transaction();
    tx.moveCall({
      target: `${AGUSD_PKG}::confidential_agusd::add_to_whitelist`,
      arguments: [tx.object(WL_ADMIN_CAP), tx.object(WHITELIST), tx.pure.address(address)],
    });
    tx.setSender(kp.toSuiAddress());
    tx.setGasBudget(20_000_000);
    const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer: kp, include: { effects: true } });
    if (r.FailedTransaction) {
      // already whitelisted (VecSet insert aborts) is fine — the goal is reached.
      return res.status(200).json({ ok: true, note: "already whitelisted or benign abort" });
    }
    // Wait for finality so the caller's next tx (register) sees the whitelist entry.
    await base.core.waitForTransaction({ result: r });
    return res.status(200).json({ ok: true, digest: r.Transaction.digest });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message ?? e) });
  }
}
