# Lit Protocol Wrapped Keys 深度分析

本文档提供 Lit Protocol Wrapped Keys 的全面技术分析，包括核心概念、工作原理、安全架构以及在比特币 Taproot 签名中的实际应用。

---

## 📚 目录

- [核心概念](#核心概念)
- [Wrapped Keys vs PKPs 对比](#wrapped-keys-vs-pkps-对比)
- [工作原理](#工作原理)
- [安全架构](#安全架构)
- [项目实现分析](#项目实现分析)
- [技术栈详解](#技术栈详解)
- [使用场景指南](#使用场景指南)
- [最佳实践](#最佳实践)

---

## 核心概念

### 什么是 Wrapped Keys？

**Wrapped Keys** 是 Lit Protocol 提供的一种安全且灵活的密钥管理解决方案。它将私钥加密存储，并通过 Programmable Key Pairs (PKPs) 控制访问权限。

#### 核心特点

1. **加密存储**: 私钥使用 Lit Network 的 BLS 公钥加密，存储在 AWS DynamoDB 中
2. **TEE 保护**: 私钥仅在单个 Lit 节点的可信执行环境 (TEE) 中解密
3. **PKP 访问控制**: 每个 Wrapped Key 都关联一个 PKP，控制解密权限
4. **完全可编程**: 签名逻辑完全在 Lit Action 中实现，支持自定义算法
5. **广泛兼容**: 支持任何有 JavaScript 签名库的区块链网络

### 为什么需要 Wrapped Keys？

传统的 PKPs 使用分布式 MPC 签名，但**仅支持 ECDSA 算法**。这限制了对以下场景的支持：

- ❌ Bitcoin Taproot (Schnorr 签名)
- ❌ Solana (EdDSA 签名)
- ❌ 其他非 ECDSA 曲线的区块链
- ❌ 导入现有私钥

**Wrapped Keys 解决了这些限制**，通过在 Lit Action 中实现自定义签名逻辑，支持任意签名算法。

---

## Wrapped Keys vs PKPs 对比

### 技术对比表

| 特性 | Wrapped Keys | PKPs (Programmable Key Pairs) |
|------|--------------|-------------------------------|
| **密钥生成** | 标准椭圆曲线密钥对 | MPC 生成的分布式密钥 |
| **密钥存储** | 加密后存储在 DynamoDB | 密钥份额分布在 Lit 节点中 |
| **签名位置** | 单个节点的 TEE 中 | 分布式 MPC 签名 (多节点) |
| **签名算法** | 任意算法 (通过 Lit Action) | 仅 ECDSA |
| **区块链支持** | 任何有 JS 库的链 | 主要是 EVM 兼容链 |
| **访问控制** | 由 PKP 控制解密权限 | 直接通过 Auth Methods |
| **灵活性** | 🔥 极高 - 完全可编程 | 中等 - 预定义签名流程 |
| **安全模型** | TEE + 加密 + 访问控制 | 分布式 MPC (阈值签名) |
| **密钥导入** | ✅ 支持导入现有密钥 | ❌ 不支持 |
| **性能** | 更快 (单节点签名) | 较慢 (需要多节点协调) |
| **去中心化程度** | 中等 (依赖 TEE) | 高 (完全分布式) |

### 协同工作关系

Wrapped Keys 和 PKPs 并非互斥关系，而是**协同工作**：

```
┌─────────────────────────────────────────────────┐
│                    用户层                        │
│         (Web3 应用、钱包、DApp)                  │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│              PKP (访问控制层)                    │
│  • 管理身份验证                                  │
│  • 控制 Wrapped Key 的解密权限                   │
│  • 定义访问条件 (Access Control Conditions)      │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│           Wrapped Key (密钥存储层)               │
│  • 加密存储实际私钥                              │
│  • 只能被授权的 PKP 解密                         │
│  • 支持任意签名算法                              │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│         Lit Action (签名执行层)                  │
│  • 在 TEE 中解密私钥                             │
│  • 执行自定义签名逻辑                            │
│  • 签名后立即清除内存                            │
└─────────────────────────────────────────────────┘
```

**关键点**：
- ✅ 每个 Wrapped Key 必须关联一个 PKP
- ✅ PKP 充当"门禁"，决定谁能使用 Wrapped Key
- ✅ 这种设计实现了灵活性和安全性的完美平衡

---

## 工作原理

### 1. 密钥生成和存储流程

```
用户请求创建 Wrapped Key
    │
    ├─→ 1. 生成/导入私钥
    │      • 使用标准椭圆曲线算法
    │      • 支持 secp256k1, ed25519 等
    │
    ├─→ 2. 获取 PKP 会话签名
    │      • 验证用户身份
    │      • 派生 PKP 以太坊地址
    │
    ├─→ 3. 设置访问控制条件 (ACC)
    │      • 指定只有该 PKP 地址可以解密
    │      • 可以添加额外条件 (时间、金额等)
    │
    ├─→ 4. 使用 Lit BLS 公钥加密私钥
    │      • 生成 ciphertext (密文)
    │      • 生成 dataToEncryptHash (数据哈希)
    │
    ├─→ 5. 存储加密元数据到 DynamoDB
    │      • 私钥本身不存储，只存储密文
    │      • 返回唯一的 Wrapped Key ID
    │
    └─→ 6. 返回给用户
           • Wrapped Key ID
           • 公钥 (用于生成区块链地址)
           • ciphertext 和 dataToEncryptHash (用于后续解密)
```

#### 代码示例 (来自本项目)

```typescript
// src/actions/taproot-action.ts
const go = async () => {
    if (method === "createWallet") {
        const sessionSig = getFirstSessionSig(pkpSessionSigs);
        const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
        
        // 设置访问控制条件：只有该 PKP 可以解密
        const ACC = getPkpAccessControlCondition(pkpAddress);
        
        const result = await Lit.Actions.runOnce(
            { waitForResponse: true, name: "encryptedPrivateKey" },
            async () => {
                // 1. 生成随机钱包
                const wallet = ethers.Wallet.createRandom();
                const publicKey = wallet.publicKey;
                const privateKey = wallet.privateKey;
                
                // 2. 加密私钥
                const { ciphertext, dataToEncryptHash } =
                    await Lit.Actions.encrypt({
                        accessControlConditions: [ACC],
                        to_encrypt: new TextEncoder().encode(
                            `${LIT_PREFIX}${privateKey}`
                        ),
                    });
                    
                // 3. 返回加密结果
                return JSON.stringify({
                    ciphertext,
                    dataToEncryptHash,
                    publicKey: publicKey.toString(),
                });
            }
        );
        
        Lit.Actions.setResponse({ response: result });
    }
};
```

### 2. 签名流程详解

```
用户请求签名
    │
    ├─→ 1. 提供必要参数
    │      • Wrapped Key ID (或 ciphertext + hash)
    │      • PKP Session Signatures
    │      • 要签名的数据/交易
    │
    ├─→ 2. SDK 调用 Lit Action
    │      • 传递加密元数据
    │      • 传递 PKP 会话签名
    │
    ├─→ 3. Lit Action 验证权限
    │      • 从 Session Sig 中提取 PKP 地址
    │      • 验证该地址是否满足访问控制条件
    │
    ├─→ 4. 在 TEE 中解密私钥
    │      • 只有验证通过才能解密
    │      • 解密在隔离的 TEE 环境中进行
    │      • 私钥仅存在于 TEE 的临时内存中
    │
    ├─→ 5. 执行自定义签名逻辑
    │      • 可以是 ECDSA, Schnorr, EdDSA 等任意算法
    │      • 使用第三方库 (如 bitcoinjs-lib)
    │      • 完全由 Lit Action 代码控制
    │
    ├─→ 6. 清除 TEE 内存
    │      • 签名完成后立即清除解密的私钥
    │      • 确保私钥不会泄露
    │
    └─→ 7. 返回签名结果
           • 签名后的数据/交易
           • (可选) 广播到区块链网络
```

#### 代码示例 (Taproot 交易签名)

```typescript
// src/actions/taproot-action.ts
else if (method === "signTaprootTxn") {
    const sessionSig = getFirstSessionSig(pkpSessionSigs);
    const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
    const ACC = getPkpAccessControlCondition(pkpAddress);
    
    // 1. 解密私钥 (在 TEE 中)
    let decryptedPrivateKey = await Lit.Actions.decryptAndCombine({
        accessControlConditions: [ACC],
        ciphertext: ciphertext,
        dataToEncryptHash: dataToEncryptHash,
        authSig: null,
        chain: "ethereum",
    });
    
    if (!decryptedPrivateKey) {
        console.log("decryptedPrivateKey is empty");
        return; // 权限验证失败
    }
    
    // 2. 移除前缀
    const privateKey = decryptedPrivateKey.startsWith(LIT_PREFIX)
        ? decryptedPrivateKey.slice(LIT_PREFIX.length)
        : decryptedPrivateKey;
    
    // 3. 使用 Schnorr 签名 Taproot 交易
    const response = await signTaprootTransaction(
        privateKey,
        transactionHex,
        sigHash,
        broadcast
    );
    
    // 4. 返回签名结果 (私钥已在 TEE 中清除)
    Lit.Actions.setResponse({
        response: response,
    });
}

// Schnorr 签名实现
const signTaprootTransaction = async (
    PRIVATE_KEY: string,
    TRANSACTION_HEX: string,
    SIGHASH: string,
    BROADCAST: boolean
) => {
    const TRANSACTION = bitcoin.Transaction.fromHex(TRANSACTION_HEX);
    const hashBuffer = Buffer.from(SIGHASH, "hex");
    
    // 使用 Schnorr 签名算法 (Taproot 要求)
    const signature = Buffer.from(
        signSchnorr(hashBuffer, Buffer.from(PRIVATE_KEY, "hex"))
    );
    
    TRANSACTION.setWitness(0, [signature]);
    
    // 可选：广播到比特币网络
    if (BROADCAST) {
        const signedTx = TRANSACTION.toHex();
        const broadcastResponse = await fetch(`${BTC_ENDPOINT}/api/tx`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: signedTx,
        });
        const txid = await broadcastResponse.text();
        return `txid: ${txid}`;
    }
    
    return `signedTx: ${TRANSACTION.toHex()}`;
};
```

### 3. 访问控制机制

访问控制条件 (Access Control Conditions, ACC) 定义了谁可以解密 Wrapped Key。

#### 基本访问控制：只允许特定 PKP

```typescript
function getPkpAccessControlCondition(pkpAddress: string) {
    return {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
            comparator: "=",
            value: pkpAddress, // 只有这个地址可以访问
        },
    };
}
```

#### 高级访问控制示例

```typescript
// 示例 1: 要求持有特定 NFT
const nftAccessControl = {
    contractAddress: "0x...", // NFT 合约地址
    standardContractType: "ERC721",
    chain: "ethereum",
    method: "balanceOf",
    parameters: [":userAddress"],
    returnValueTest: {
        comparator: ">",
        value: "0", // 至少持有 1 个 NFT
    },
};

// 示例 2: 时间限制
const timeAccessControl = {
    contractAddress: "",
    standardContractType: "",
    chain: "ethereum",
    method: "eth_getBlockByNumber",
    parameters: ["latest"],
    returnValueTest: {
        comparator: ">",
        value: "1735689600", // Unix 时间戳
    },
};

// 示例 3: 组合条件 (AND/OR)
const combinedAccessControl = [
    nftAccessControl,
    { operator: "and" },
    timeAccessControl,
];
```

---

## 安全架构

### 三层安全防护

```
┌─────────────────────────────────────────────────────────┐
│                    第一层: 加密层                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 使用 Lit Network BLS 公钥加密私钥                │   │
│  │ • 只有 Lit 节点能解密                            │   │
│  │ • 密文存储在 DynamoDB                            │   │
│  │ • 私钥本身永不暴露                               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  第二层: 访问控制层                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 访问控制条件 (ACC)                               │   │
│  │ • 验证 PKP 地址                                  │   │
│  │ • 可添加额外条件 (NFT持有、时间限制等)           │   │
│  │ • 不满足条件无法解密                             │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  第三层: TEE 执行层                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 可信执行环境 (Trusted Execution Environment)    │   │
│  │ • 私钥只在 TEE 中短暂存在                        │   │
│  │ • 签名过程隔离执行                               │   │
│  │ • 完成后立即清除内存                             │   │
│  │ • 防止侧信道攻击                                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 安全特性详解

#### 1. 端到端加密

```typescript
// 加密流程
const { ciphertext, dataToEncryptHash } = await Lit.Actions.encrypt({
    accessControlConditions: [ACC],
    to_encrypt: new TextEncoder().encode(privateKey),
});

// 存储到 DynamoDB
// • ciphertext: 加密后的私钥
// • dataToEncryptHash: 数据哈希，用于完整性验证
// • 原始私钥从未离开 TEE
```

#### 2. TEE (Trusted Execution Environment)

**什么是 TEE？**
- 硬件级别的隔离环境
- CPU 提供的安全区域 (如 Intel SGX, AMD SEV)
- 代码和数据在加密的内存中执行
- 即使操作系统被攻破，TEE 内的数据仍然安全

**在 Wrapped Keys 中的作用**：
```
┌─────────────────────────────────────┐
│       Lit 节点 (普通环境)            │
│                                     │
│  ┌───────────────────────────────┐ │
│  │    TEE (隔离环境)              │ │
│  │                               │ │
│  │  1. 接收加密的私钥            │ │
│  │  2. 在 TEE 内解密             │ │
│  │  3. 执行签名                  │ │
│  │  4. 清除内存                  │ │
│  │  5. 返回签名结果              │ │
│  │                               │ │
│  │  私钥永不离开 TEE             │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### 3. 零信任原则

- ✅ 私钥从不以明文形式存储
- ✅ 私钥从不在网络上传输
- ✅ 私钥只在签名时短暂存在于 TEE
- ✅ 每次操作都需要重新验证权限
- ✅ 日志中不包含敏感信息

### 攻击面分析

| 攻击向量 | 防护措施 | 风险等级 |
|---------|---------|---------|
| **数据库泄露** | 私钥加密存储，无私钥 | 🟢 低 |
| **网络拦截** | 只传输密文 | 🟢 低 |
| **节点妥协** | TEE 隔离保护 | 🟡 中 |
| **PKP 私钥泄露** | 多因素认证 | 🟡 中 |
| **Lit Action 漏洞** | 代码审计 + 社区评审 | 🟡 中 |
| **侧信道攻击** | TEE 硬件保护 | 🟢 低 |

---

## 项目实现分析

本项目展示了如何使用 Wrapped Keys 实现 **Bitcoin Taproot 交易签名**，这是官方 SDK 不支持的高级用例。

### 环境要求

在开始之前，请确保满足以下要求：

- **Node.js**: v19.9.0 或更高版本
- **npm** 或 **yarn**: 最新稳定版本
- **TypeScript**: v5.0+ (项目已包含)
- **操作系统**: macOS, Linux, 或 Windows (WSL)

> ⚠️ **重要**: Node.js v19.9.0+ 是必需的，因为项目使用了 ES 模块和最新的加密 API。

### 为什么需要自定义实现？

1. **Schnorr 签名算法**
   - Taproot 使用 Schnorr 签名，而非 ECDSA
   - 官方 Wrapped Keys SDK 只支持 Ethereum (ECDSA) 和 Solana (EdDSA)
   - 必须自己实现 Schnorr 签名逻辑

2. **比特币交易格式**
   - Bitcoin 的 UTXO 模型与 Ethereum 的账户模型完全不同
   - 需要手动构建 Taproot 交易 (Witness v1)
   - 需要计算 Taproot 特定的 sighash

3. **Taproot 地址生成**
   - 使用 P2TR (Pay-to-Taproot) 地址格式
   - 需要从公钥导出 x-only pubkey
   - 生成 bech32m 编码的地址

### 项目架构

```
taproot-wrapped-keys/
│
├── src/
│   ├── index.ts                 # 主入口
│   │   ├─→ createPkp()          # 创建 PKP
│   │   ├─→ createWallet()       # 创建 Wrapped Key
│   │   └─→ createAndSignTxn()   # 签名交易
│   │
│   ├── utils.ts                 # 工具函数
│   │   ├─→ getEnv()             # 环境变量管理
│   │   └─→ createPkp()          # PKP 铸造逻辑
│   │
│   └── actions/
│       └── taproot-action.ts    # Lit Action 核心
│           ├─→ createWallet()   # 生成并加密私钥
│           └─→ signTaprootTxn() # Schnorr 签名
│
├── actions/
│   └── taproot-action.js        # 编译后的 Lit Action
│
├── esbuild.js                   # 构建配置
├── *.shim.js                    # 浏览器兼容性
└── package.json                 # 依赖管理
```

### 核心流程实现

#### 1. PKP 创建

```typescript
// src/utils.ts
export async function createPkp() {
    const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");
    const litNodeClient = new LitNodeClient({
        litNetwork: "datil-dev",
        debug: false,
    });
    
    await litNodeClient.connect();
    
    const ethersWallet = new ethers.Wallet(
        ETHEREUM_PRIVATE_KEY,
        new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );
    
    // 认证
    const authMethod = await EthWalletProvider.authenticate({
        signer: ethersWallet,
        litNodeClient: litNodeClient,
    });
    
    // 铸造 PKP NFT
    const mintInfo = await litNodeClient.mintWithAuth({
        authMethod: authMethod,
        scopes: [
            AuthMethodScope.SignAnything,
            AuthMethodScope.PersonalSign,
        ],
    });
    
    console.log("PKP Public Key:", mintInfo.pkp.publicKey);
    console.log("PKP ETH Address:", mintInfo.pkp.ethAddress);
    console.log("PKP Token ID:", mintInfo.pkp.tokenId);
}
```

#### 2. Wrapped Key 创建 (在 Lit Action 中)

```typescript
// src/actions/taproot-action.ts
if (method === "createWallet") {
    // 1. 获取 PKP 地址
    const sessionSig = getFirstSessionSig(pkpSessionSigs);
    const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
    
    // 2. 设置访问控制
    const ACC = getPkpAccessControlCondition(pkpAddress);
    
    // 3. 生成并加密私钥
    const result = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "encryptedPrivateKey" },
        async () => {
            const wallet = ethers.Wallet.createRandom();
            const { ciphertext, dataToEncryptHash } =
                await Lit.Actions.encrypt({
                    accessControlConditions: [ACC],
                    to_encrypt: new TextEncoder().encode(
                        `lit_${wallet.privateKey}`
                    ),
                });
            return JSON.stringify({
                ciphertext,
                dataToEncryptHash,
                publicKey: wallet.publicKey,
            });
        }
    );
    
    Lit.Actions.setResponse({ response: result });
}
```

#### 3. Taproot 交易构建

```typescript
// src/index.ts
async function createTaprootTxn(
    senderPublicKey: string,
    destinationAddress: string,
    amountToSend: number,
    fee: number,
    network: any
) {
    // 1. 从公钥生成 Taproot 地址
    const keyPair = ECPair.fromPublicKey(
        Buffer.from(senderPublicKey.slice(2), "hex")
    );
    const xOnlyPubKey = keyPair.publicKey.slice(1); // 去掉前缀字节
    
    const { address, output } = bitcoin.payments.p2tr({
        pubkey: Buffer.from(xOnlyPubKey),
        network: network,
    });
    
    console.log("Taproot Address:", address);
    
    // 2. 获取 UTXO
    const utxos = await fetch(
        `${BTC_ENDPOINT}/api/address/${address}/utxo`
    ).then((r) => r.json());
    
    if (!utxos.length) throw new Error("No UTXOs found");
    
    // 3. 构建交易
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(
        Buffer.from(utxos[0].txid, "hex").reverse(),
        utxos[0].vout
    );
    
    const sendAmount = amountToSend - fee;
    tx.addOutput(
        bitcoin.address.toOutputScript(destinationAddress, network),
        sendAmount
    );
    
    // 4. 计算 Taproot sighash
    const hash = tx.hashForWitnessV1(
        0,                           // 输入索引
        [output!],                   // prevout scripts
        [utxos[0].value],           // prevout values
        bitcoin.Transaction.SIGHASH_DEFAULT
    );
    
    return {
        Transaction: tx.toHex(),
        SigHash: hash.toString("hex"),
    };
}
```

#### 4. Schnorr 签名 (在 Lit Action 中)

```typescript
// src/actions/taproot-action.ts
const signTaprootTransaction = async (
    PRIVATE_KEY: string,
    TRANSACTION_HEX: string,
    SIGHASH: string,
    BROADCAST: boolean
) => {
    const TRANSACTION = bitcoin.Transaction.fromHex(TRANSACTION_HEX);
    const hashBuffer = Buffer.from(SIGHASH, "hex");
    
    // Schnorr 签名 (Taproot 特有)
    const signature = Buffer.from(
        signSchnorr(hashBuffer, Buffer.from(PRIVATE_KEY, "hex"))
    );
    
    // 设置 Witness 数据
    TRANSACTION.setWitness(0, [signature]);
    
    const signedTx = TRANSACTION.toHex();
    
    // 可选：广播交易
    if (BROADCAST) {
        const broadcastResponse = await fetch(`${BTC_ENDPOINT}/api/tx`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: signedTx,
        });
        const txid = await broadcastResponse.text();
        return `txid: ${txid}`;
    }
    
    return `signedTx: ${signedTx}`;
};
```

### 完整执行流程

```bash
# 1. 创建 PKP (一次性操作)
npm run pkp
# 输出:
# ✅ PKP Public Key: 0x04...
# ✅ PKP ETH Address: 0x...
# ✅ PKP Token ID: ...

# 2. 创建 Wrapped Key (一次性操作)
npm run create
# 输出:
# ✅ Public Key: 0x04...
# ✅ Ciphertext: ...
# ✅ Data Hash: ...

# 3. 签名并广播交易 (可多次执行)
npm run txn
# 输出:
# 🔄 Deriving a BTC Taproot Address...
# ✅ PKP Taproot Address: tb1p...
# 🔄 Fetching UTXO information...
# ✅ UTXO information fetched
# 🔄 Creating new Taproot transaction...
# ✅ Taproot transaction created
# 🔄 Signing the transaction
# ✅ Taproot transaction signed
# 🔄 Broadcasting transaction...
# ✅ Transaction broadcast: https://mempool.space/testnet/tx/...
```

---

## 技术栈详解

### Lit Protocol 组件

```json
{
  "@lit-protocol/lit-node-client": "^7.1.0",
  "@lit-protocol/lit-auth-client": "^7.1.0",
  "@lit-protocol/auth-helpers": "^7.1.0",
  "@lit-protocol/constants": "^7.1.0"
}
```

#### 1. `@lit-protocol/lit-node-client`

**核心功能**：与 Lit 网络通信的主要客户端

```typescript
import { LitNodeClient } from "@lit-protocol/lit-node-client";

const litNodeClient = new LitNodeClient({
    litNetwork: "datil-dev",  // 或 "cayenne", "manzano", "habanero"
    debug: false,
});

await litNodeClient.connect();

// 执行 Lit Action
const response = await litNodeClient.executeJs({
    sessionSigs: pkpSessionSigs,
    code: litActionCode,
    jsParams: { /* 参数 */ },
});
```

**主要方法**：
- `connect()` - 连接到 Lit 网络
- `executeJs()` - 执行 Lit Action
- `getPkpSessionSigs()` - 获取 PKP 会话签名
- `mintWithAuth()` - 铸造 PKP NFT
- `disconnect()` - 断开连接

#### 2. `@lit-protocol/lit-auth-client`

**核心功能**：处理身份验证

```typescript
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";

// 使用以太坊钱包认证
const authMethod = await EthWalletProvider.authenticate({
    signer: ethersWallet,
    litNodeClient: litNodeClient,
});
```

**支持的认证方式**：
- `EthWalletProvider` - 以太坊钱包
- `WebAuthnProvider` - WebAuthn (生物识别)
- `DiscordProvider` - Discord OAuth
- `GoogleProvider` - Google OAuth
- `StytchProvider` - Stytch OTP

#### 3. `@lit-protocol/auth-helpers`

**核心功能**：资源权限管理

```typescript
import {
    LitActionResource,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { LIT_ABILITY } from "@lit-protocol/constants";

// 定义资源权限
const resourceAbilityRequests = [
    {
        resource: new LitActionResource("*"),
        ability: LIT_ABILITY.LitActionExecution,
    },
    {
        resource: new LitPKPResource("*"),
        ability: LIT_ABILITY.PKPSigning,
    },
];
```

### Bitcoin 组件

```json
{
  "bitcoinjs-lib": "^6.1.7",
  "@bitcoin-js/tiny-secp256k1-asmjs": "^2.2.3",
  "ecpair": "^3.0.0-rc.0"
}
```

#### 1. `bitcoinjs-lib`

**核心功能**：比特币交易处理

```typescript
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

// 初始化椭圆曲线库
bitcoin.initEccLib(ecc);

// 创建 Taproot 地址
const { address, output } = bitcoin.payments.p2tr({
    pubkey: xOnlyPubKey,
    network: bitcoin.networks.testnet,
});

// 构建交易
const tx = new bitcoin.Transaction();
tx.addInput(prevTxHash, vout);
tx.addOutput(outputScript, amount);

// 计算 Taproot sighash
const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevoutScripts,
    prevoutValues,
    bitcoin.Transaction.SIGHASH_DEFAULT
);
```

#### 2. `ecpair`

**核心功能**：椭圆曲线密钥对管理

```typescript
import { ECPairFactory } from "ecpair";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

const ECPair = ECPairFactory(ecc);

// 从公钥创建密钥对
const keyPair = ECPair.fromPublicKey(publicKeyBuffer);

// 从私钥创建密钥对
const keyPair = ECPair.fromPrivateKey(privateKeyBuffer);
```

### 构建工具

#### ESBuild 配置

Lit Actions 需要编译成单文件 JavaScript，以便在 Lit 节点中执行。

```javascript
// esbuild.js
import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const bitcoinShim = readFileSync('./bitcoin.shim.js', 'utf8');
const bufferShim = readFileSync('./buffer.shim.js', 'utf8');

await esbuild.build({
    entryPoints: ['./src/actions/taproot-action.ts'],
    bundle: true,
    outfile: './actions/taproot-action.js',
    format: 'esm',
    platform: 'browser',
    banner: {
        js: `${bufferShim}\n${bitcoinShim}`,
    },
    external: ['crypto'], // Lit 节点提供
});
```

**为什么需要 Shims？**
- Lit Actions 运行在浏览器环境中
- `bitcoinjs-lib` 依赖 Node.js 的 `buffer` 和 `crypto` 模块
- Shims 提供这些模块的浏览器兼容版本

---

## Lit Action 技术限制

在部署和使用 Lit Action 之前，了解 Lit Protocol 为防止拒绝服务攻击（DoS）和资源过度消耗而设立的技术约束非常重要。

### 执行时间限制

不同网络环境有不同的执行时间限制：

| 网络环境 | 时间限制 | 使用场景 |
|---------|---------|---------|
| **Datil** | 30 秒 | 生产环境 |
| **Datil-test** | 30 秒 | 测试环境 |
| **Datil-dev** | 60 秒 | 开发环境 |

> ⚠️ **重要**: 超过时间限制的 Lit Action 将被自动终止，不会返回结果。

**最佳实践**：
```typescript
// ✅ 优化异步操作
const results = await Promise.all([
    operation1(),
    operation2(),
    operation3(),
]); // 并行执行，节省时间

// ❌ 避免串行执行
const result1 = await operation1();
const result2 = await operation2();
const result3 = await operation3(); // 串行执行，耗时过长
```

### 代码大小限制

- **最大大小**: 100 MB
- **推荐大小**: < 5 MB (更快的加载和执行)

**本项目实际大小**：
- Taproot Action: 0.7822 MB ✅ (远低于限制)

**优化策略**：

1. **使用代码压缩工具**
   ```bash
   # 使用 esbuild 压缩
   esbuild src/actions/taproot-action.ts \
     --bundle \
     --minify \
     --outfile=actions/taproot-action.js
   ```

2. **移除未使用的依赖**
   ```typescript
   // ❌ 导入整个库
   import * as bitcoin from 'bitcoinjs-lib';
   
   // ✅ 只导入需要的模块
   import { Transaction, payments } from 'bitcoinjs-lib';
   ```

3. **使用 Tree Shaking**
   - ESBuild 自动移除未使用的代码
   - 确保使用 ES 模块 (`import`/`export`)

### 内存使用限制

- **RAM 限制**: 256 MB
- **适用范围**: Lit Action 执行期间的内存占用

**内存优化技巧**：

```typescript
// ✅ 及时释放大型对象
let largeData = await fetchLargeData();
const processed = processData(largeData);
largeData = null; // 手动释放，帮助 GC

// ✅ 流式处理大数据
for (const chunk of dataChunks) {
    await processChunk(chunk); // 逐块处理
}

// ❌ 避免在内存中累积大量数据
const allData = []; // 危险！可能超出内存限制
for (const item of items) {
    allData.push(await fetchItem(item));
}
```

### 网络请求限制

虽然 Lit Actions 可以进行网络请求（fetch），但需要注意：

- **建议**: 将请求数量控制在最小
- **超时**: 网络请求时间计入总执行时间
- **失败处理**: 实现重试和错误处理机制

```typescript
// ✅ 带超时和重试的网络请求
async function fetchWithTimeout(url: string, timeout = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
```

### 性能监控建议

在 Lit Action 中添加性能监控：

```typescript
const go = async () => {
    const startTime = Date.now();
    
    try {
        // 1. 密钥操作
        const t1 = Date.now();
        const decrypted = await Lit.Actions.decryptAndCombine({...});
        console.log(`Decrypt time: ${Date.now() - t1}ms`);
        
        // 2. 签名操作
        const t2 = Date.now();
        const signature = await signTransaction(...);
        console.log(`Sign time: ${Date.now() - t2}ms`);
        
        // 3. 总执行时间
        console.log(`Total time: ${Date.now() - startTime}ms`);
        
        Lit.Actions.setResponse({ response: signature });
    } catch (error) {
        console.error(`Error after ${Date.now() - startTime}ms:`, error);
        throw error;
    }
};
```

### 约束对比表

| 限制类型 | 限制值 | 本项目实际 | 状态 |
|---------|--------|-----------|------|
| **执行时间** (Datil-dev) | 60 秒 | ~2-5 秒 | ✅ 安全 |
| **代码大小** | 100 MB | 0.78 MB | ✅ 优秀 |
| **内存使用** | 256 MB | < 50 MB | ✅ 安全 |

### 故障排查

如果遇到限制问题：

1. **超时错误**
   ```
   Error: Lit Action execution timed out
   ```
   - 优化异步操作，使用并行处理
   - 减少网络请求次数
   - 简化复杂计算逻辑

2. **代码过大错误**
   ```
   Error: Lit Action code size exceeds limit
   ```
   - 启用代码压缩 (`minify`)
   - 移除未使用的依赖
   - 拆分为多个 Lit Actions

3. **内存不足错误**
   ```
   Error: Out of memory
   ```
   - 避免一次性加载大量数据
   - 使用流式处理
   - 及时释放不需要的对象

---

## 使用场景指南

### 何时使用 Wrapped Keys？

#### ✅ 推荐场景

1. **非 ECDSA 签名算法**
   - Bitcoin Taproot (Schnorr)
   - Solana (EdDSA)
   - Cosmos (Tendermint)
   - 任何需要自定义签名的场景

2. **导入现有私钥**
   - 迁移现有钱包到 Lit 生态
   - 将传统密钥升级为可编程密钥
   - 为现有密钥添加访问控制

3. **复杂签名逻辑**
   - 多步骤签名流程
   - 条件性签名 (如时间锁)
   - 与外部 API 交互后再签名

4. **跨链应用**
   - 支持多条异构链
   - 统一的密钥管理界面
   - 跨链资产管理

#### ❌ 不推荐场景

1. **仅需要 ECDSA 签名的 EVM 链**
   - 直接使用 PKPs 更简单
   - PKPs 有更好的去中心化保证

2. **极高频率的签名操作**
   - Wrapped Keys 每次都需要解密
   - PKPs 的 MPC 签名可能更高效

3. **不需要可编程性的场景**
   - 如果只是简单的转账
   - 使用标准钱包更合适

### 何时使用 PKPs？

#### ✅ 推荐场景

1. **EVM 兼容链**
   - Ethereum, Polygon, BSC, Arbitrum 等
   - 简单的 ECDSA 签名足够

2. **需要最高去中心化保证**
   - MPC 签名分布在多个节点
   - 没有单点故障

3. **不需要导入现有密钥**
   - 创建新的钱包/身份
   - 完全由 Lit 网络管理

### 混合使用方案

实际应用中，可以同时使用 PKPs 和 Wrapped Keys：

```
用户身份 (PKP)
    │
    ├─→ EVM 链交易
    │   └─→ 使用 PKP 直接签名
    │
    ├─→ Bitcoin 交易
    │   └─→ 使用 Wrapped Key (Schnorr 签名)
    │
    ├─→ Solana 交易
    │   └─→ 使用 Wrapped Key (EdDSA 签名)
    │
    └─→ 复杂业务逻辑
        └─→ 使用 Wrapped Key (自定义逻辑)
```

---

## 最佳实践

### 1. 安全实践

#### ✅ Do's

```typescript
// ✅ 始终在 .env 文件中存储敏感信息
ETHEREUM_PRIVATE_KEY=0x...
CIPHERTEXT=...
DATA_TO_ENCRYPT_HASH=...

// ✅ 在 Wrapped Key 中添加前缀，便于识别和验证
const LIT_PREFIX = "lit_";
const encryptedKey = `${LIT_PREFIX}${privateKey}`;

// ✅ 使用严格的访问控制条件
const ACC = {
    parameters: [":userAddress"],
    returnValueTest: {
        comparator: "=",
        value: pkpAddress, // 精确匹配
    },
};

// ✅ 在 Lit Action 中验证输入参数
if (!ciphertext || !dataToEncryptHash) {
    throw new Error("Missing required parameters");
}

// ✅ 在生产环境中关闭 debug 日志
const litNodeClient = new LitNodeClient({
    litNetwork: "datil-test",
    debug: false, // 避免泄露敏感信息
});
```

#### ❌ Don'ts

```typescript
// ❌ 不要在代码中硬编码私钥
const PRIVATE_KEY = "0x1234..."; // 危险！

// ❌ 不要在日志中打印敏感信息
console.log("Private Key:", privateKey); // 危险！

// ❌ 不要使用过于宽松的访问控制
const ACC = {
    returnValueTest: {
        comparator: ">=",
        value: "0", // 任何人都能访问！
    },
};

// ❌ 不要忘记清理敏感变量
let privateKey = decryptedKey;
// ... 使用 privateKey
// 应该在使用后: privateKey = null;
```

### 2. 性能优化

#### 缓存 Lit Node Client

```typescript
// ✅ 复用 client 实例
let litNodeClientInstance: LitNodeClient | null = null;

async function getLitNodeClient() {
    if (!litNodeClientInstance) {
        litNodeClientInstance = new LitNodeClient({
            litNetwork: "datil-dev",
            debug: false,
        });
        await litNodeClientInstance.connect();
    }
    return litNodeClientInstance;
}

// ✅ 在应用关闭时断开连接
process.on('SIGINT', async () => {
    if (litNodeClientInstance) {
        await litNodeClientInstance.disconnect();
    }
    process.exit(0);
});
```

#### 批量操作

```typescript
// ✅ 批量签名多个交易
const signatures = await Promise.all(
    transactions.map(tx => 
        litNodeClient.executeJs({
            sessionSigs: pkpSessionSigs,
            code: litActionCode,
            jsParams: { transaction: tx },
        })
    )
);
```

### 3. 错误处理

```typescript
// ✅ 完善的错误处理
async function signTransaction(params: SignParams) {
    try {
        const response = await litNodeClient.executeJs({
            sessionSigs: pkpSessionSigs,
            code: litActionCode,
            jsParams: params,
        });
        
        if (!response || !response.response) {
            throw new Error("Empty response from Lit Action");
        }
        
        return response;
    } catch (error) {
        if (error instanceof Error) {
            // 分类错误类型
            if (error.message.includes("not authorized")) {
                console.error("❌ Access denied: Check PKP permissions");
            } else if (error.message.includes("network")) {
                console.error("❌ Network error: Check Lit network status");
            } else {
                console.error("❌ Unknown error:", error.message);
            }
        }
        throw error;
    } finally {
        // 清理资源
        await litNodeClient?.disconnect();
    }
}
```

### 4. 测试策略

#### 单元测试

```typescript
// tests/wrapped-key.test.ts
import { describe, it, expect } from 'vitest';

describe('Wrapped Key Operations', () => {
    it('should create a valid Taproot address', () => {
        const publicKey = "0x04...";
        const address = deriveTaprootAddress(publicKey);
        
        expect(address).toMatch(/^tb1p[a-z0-9]{58}$/); // Testnet Taproot
    });
    
    it('should encrypt and decrypt private key', async () => {
        const privateKey = "0x1234...";
        const { ciphertext, dataToEncryptHash } = await encryptPrivateKey(
            privateKey,
            accessControlConditions
        );
        
        expect(ciphertext).toBeTruthy();
        expect(dataToEncryptHash).toBeTruthy();
        
        const decrypted = await decryptPrivateKey(
            ciphertext,
            dataToEncryptHash
        );
        
        expect(decrypted).toBe(privateKey);
    });
});
```

#### 集成测试

```typescript
// tests/integration.test.ts
describe('End-to-End Transaction Signing', () => {
    it('should sign and broadcast a Taproot transaction', async () => {
        // 1. 创建 PKP
        const pkp = await createPkp();
        
        // 2. 创建 Wrapped Key
        const wrappedKey = await createWrappedKey(pkp);
        
        // 3. 生成 Taproot 地址
        const address = await deriveTaprootAddress(wrappedKey.publicKey);
        
        // 4. 构建交易
        const tx = await createTaprootTransaction(
            address,
            destinationAddress,
            amount
        );
        
        // 5. 签名交易
        const signedTx = await signTaprootTransaction(
            wrappedKey,
            tx
        );
        
        // 6. 验证签名
        expect(signedTx).toBeTruthy();
        expect(signedTx.witness.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout
});
```

### 5. 监控和日志

```typescript
// ✅ 结构化日志
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

// 使用日志
logger.info('Creating Wrapped Key', {
    pkpPublicKey: pkpPublicKey.slice(0, 10) + '...', // 只记录前缀
    timestamp: new Date().toISOString(),
});

logger.error('Failed to sign transaction', {
    error: error.message,
    txHash: txHash,
    timestamp: new Date().toISOString(),
});
```

### 6. 环境管理

```bash
# .env.example
# === 必需配置 ===
ETHEREUM_PRIVATE_KEY=                # 以太坊私钥
NETWORK=testnet                      # bitcoin 网络
BTC_ENDPOINT=https://blockstream.info # BTC 节点

# === 运行时生成 ===
PKP_PUBLIC_KEY=                      # npm run pkp 后获得
WK_PUBLIC_KEY=                       # npm run create 后获得
CIPHERTEXT=                          # npm run create 后获得
DATA_TO_ENCRYPT_HASH=                # npm run create 后获得

# === 交易参数 ===
DESTINATION_ADDRESS=                 # 接收地址
AMOUNT_TO_SEND=1000                 # 发送金额 (satoshis)
FEE=500                             # 手续费 (satoshis)
BROADCAST=true                       # 是否广播
```

---

## 总结

### 关键要点

1. **Wrapped Keys 补充了 PKPs 的不足**
   - PKPs: 分布式 MPC + ECDSA → 适合 EVM 链
   - Wrapped Keys: TEE + 任意算法 → 适合所有链

2. **安全性通过三层保护实现**
   - 加密存储 + 访问控制 + TEE 执行
   - 私钥永不暴露在不安全环境

3. **完全可编程**
   - 在 Lit Action 中实现任意签名逻辑
   - 支持第三方库 (bitcoinjs-lib, ethers, etc.)

4. **本项目展示了高级用法**
   - 自定义 Schnorr 签名实现
   - 完整的 Bitcoin Taproot 交易流程
   - 从密钥生成到交易广播的端到端解决方案

### 下一步

- 📖 阅读 [README.md](./README.md) 了解快速开始
- 🚀 查看 [DEPLOYMENT.md](./DEPLOYMENT.md) 了解详细部署步骤
- 💻 探索 [src/actions/taproot-action.ts](./src/actions/taproot-action.ts) 理解核心实现
- 🔗 访问 [Lit Protocol 官方文档](https://developer.litprotocol.com/) 深入学习

---

## 参考资源

### 官方文档
- [Wrapped Keys Overview](https://developer.litprotocol.com/user-wallets/wrapped-keys/overview)
- [PKPs Overview](https://developer.litprotocol.com/user-wallets/pkps/overview)
- [Lit Actions](https://developer.litprotocol.com/sdk/serverless-signing/overview)
- [Access Control Conditions](https://developer.litprotocol.com/sdk/access-control/evm/basic-examples)

### 技术文档
- [Bitcoin BIP 341 - Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [Schnorr Signatures](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki)
- [bitcoinjs-lib Documentation](https://github.com/bitcoinjs/bitcoinjs-lib)

### 社区资源
- [Lit Protocol Discord](https://litgateway.com/discord)
- [Lit Protocol GitHub](https://github.com/LIT-Protocol/js-sdk)
- [Bitcoin Stack Exchange](https://bitcoin.stackexchange.com/)

---

**最后更新**: 2025年10月27日  
**版本**: 1.0.0
**作者**: Mars Team
