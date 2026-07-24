# agUSD — Confidential Synthetic Dollar (Sui devnet, LIVE)

A private-credit-backed synthetic dollar deployed on **Sui devnet**, built on
Mysten Labs' **Confidential Transfers** framework (`contra`). Balances and
transfer amounts are hidden on-chain via **Twisted ElGamal + zero-knowledge
proofs**; registration is **KYC-whitelist-gated**; the issuer holds an auditor
viewing-key hook + freeze/seize controls.

Deployed by `0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4`
on devnet (chain-id `e5e60035`).

## Live object IDs

| What | Object ID |
|---|---|
| **contra framework** (republished, devnet was wiped) | `0x2b5cd3982ebe5cbf244bf73f4b995764dac30847400361244426145dc686eb4f` |
| contra `TokenRegistry` (shared) | `0x750370c126bf8ea3f846d5f910162afc2050e2c5667ef833bc29ffd4e6cedaae` |
| contra `AccountRegistry` (shared) | `0xec30a3a87e8c77c8c2c2417ae923658bd46bcfa8fe457d958290cb6112cf1330` |
| **agUSD package** | `0x466f40a01ecb81048174fdc4e2971776b61f6c569990b2ada9657fdd159138e0` |
| agUSD `Pool` (public 1:1 USDC reserve, shared) | `0x17554400fbccab1e3df8dee0c36052be5be77f12b32f8b1eb694f798ed4af7ae` |
| `AgusdAdminCap` (issuer) | `0x0db3222595fb21f75a663c4747044fed4a623194d479ecd61e22698aea537e53` |
| test `UsdcTreasury` (permissionless faucet) | `0xa662e769720c70a63a1a5f0d6382b1919039f7adf8073c228b8987296c18441a` |
| **`ConfidentialToken<AGUSD>`** (shared) | `0x0adc7586504f5a71be687fc90d30b8be0c174be4014eb58319c05ca921eff71c` |
| **KYC `Whitelist`** (shared) | `0x5d664fb268db88b4e081bed343589ff60b4d21114421d8bbceabb219e8c73cb2` |
| `WhitelistAdminCap` (Agama compliance) | `0x71408e781d4428aadb889a6fa42713a7cd258676a55ddd7532d54918b50844c1` |
| `ManagementCap<AGUSD>` (issuer) | `0x07a1274abc3305f83162743cba8f48df9f1c46657805ef9156227e49681f971f` |
| contra `Pool<AGUSD>` (confidential reserve) | `0xf4ac3782351207533a5e9e892194e031d5f55c59c35ad6813649da5288109495` |

Explorer: `https://suiscan.xyz/devnet/object/<id>` or
`https://suivision.xyz/package/0x466f40a01ecb81048174fdc4e2971776b61f6c569990b2ada9657fdd159138e0?network=devnet`

## Publish transactions

- contra publish: `Ed1uVWqre85ELmBLvmKvCboz7wzYFjpArXdUSjLHsYBy`
- agUSD publish: (see `/tmp/agusd-publish2.json`)
- `setup_and_keep` (created ConfidentialToken + Whitelist): success

## Move sources

`onchain/agusd-move/sources/` — `usdc.move`, `agusd.move`, `confidential_agusd.move`.
Built against the `contra` framework with the **devnet toolchain**
(`sui 1.76.0-devnet` via `suiup default set sui@devnet`) — the stable homebrew
CLI can't resolve the `rangeproofs` (bulletproofs) native.

## Flow (what each layer hides)

1. **mint** — `agusd::mint(pool, usdc)` → agUSD 1:1 (public amount).
2. **register** — KYC-gated `confidential_agusd::register` → a `TokenAccount<AGUSD>`.
3. **wrap** — public agUSD → confidential balance (amount of the wrap op is visible; balance after is encrypted).
4. **transfer** — confidential→confidential: **amount hidden** (ElGamal + ZK).
5. **unwrap** — back to public agUSD.
6. **audit** — Agama/regulator decrypts balances/transfers off-chain via the auditor key.

## Next (task 5)

TypeScript `ContraClient` script driving register → wrap → confidential transfer,
showing the encrypted amount on-chain vs. the decrypted amount via viewing key.
