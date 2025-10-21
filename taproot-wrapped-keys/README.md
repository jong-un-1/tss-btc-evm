# BTC Taproot Wrapped Keys - Lit Protocol 密钥管理方案

基于 Lit Protocol 可信执行环境 (TEE) 的比特币 Taproot 密钥对生成和交易签名解决方案。本项目展示了如何在 Lit Action 内部创建 BTC Taproot 密钥对并执行 Schnorr 签名，这是一个自定义包装密钥实现，专门处理非 ECDSA 兼容的 Schnorr 签名。

## 核心功能

- **Taproot 密钥对生成**: 在 Lit TEE 内安全生成 BTC Taproot 密钥
- **Schnorr 签名**: 支持比特币 Taproot 升级的 Schnorr 签名算法
- **密钥加密存储**: 使用 PKP 会话签名加密私钥
- **交易构造**: 完整的 Taproot 交易创建和签名流程
- **网络广播**: 支持将签名交易广播到比特币网络

## 技术架构

### 项目结构
```
taproot-wrapped-keys/
├── src/
│   ├── index.ts              # 主执行入口和交易逻辑
│   ├── utils.ts              # 工具函数和环境变量处理
│   └── actions/
│       └── taproot-action.ts # Lit Action 核心签名逻辑
├── actions/
│   └── taproot-action.js     # 编译后的 Lit Action 代码
├── esbuild.js                # 构建配置
├── *.shim.js                 # 浏览器环境兼容性垫片
└── package.json              # 项目依赖配置
```

### 核心依赖
- **@lit-protocol/lit-node-client**: Lit 网络客户端
- **@lit-protocol/lit-auth-client**: Lit 认证客户端
- **bitcoinjs-lib**: 比特币交易处理库
- **@bitcoin-js/tiny-secp256k1-asmjs**: 椭圆曲线加密算法
- **ecpair**: 密钥对管理
- **ethers**: 以太坊交互

## 前置要求

### 1. 以太坊私钥
- 用于拥有所铸造的 PKP
- 对应的以太坊账户必须有 Lit 测试代币来支付网络请求费用
- 获取测试代币: [Lit 水龙头](https://chronicle-yellowstone-faucet.getlit.dev/)

### 2. BTC 钱包
- 用于为新创建的钱包充值和作为目标地址
- 推荐使用支持测试网的钱包（如 Unisat）
- 确保有一定的测试币余额: [BTC 测试网水龙头](https://coinfaucet.eu/en/btc-testnet/)

### 3. BTC 节点端点
- 用于获取 UTXO 信息以创建交易
- 用于从 Lit Action 内部广播交易
- 推荐使用: `https://blockstream.info` 或 `https://mempool.space`

### 4. 开发环境
- Node.js (v18 或更高版本)
- NPM 或 Yarn 包管理器

## 安装和配置

### 1. 克隆并安装依赖
```bash
git clone <repository-url>
cd taproot-wrapped-keys
npm install
```

### 2. 环境配置
```bash
cp .env.example .env
```

编辑 `.env` 文件：
```env
# === 必需配置 ===
# 以太坊私钥 (用于 PKP 铸造和认证)
ETHEREUM_PRIVATE_KEY=0x...

# 比特币网络配置
NETWORK=testnet
BTC_ENDPOINT=https://blockstream.info

# 交易参数
DESTINATION_ADDRESS=tb1...    # 接收方比特币地址
AMOUNT_TO_SEND=1000          # 发送金额 (satoshis)
FEE=500                      # 交易手续费 (satoshis)
BROADCAST=true               # 是否广播交易

# === 运行过程中获得的配置 ===
# PKP 信息 (运行 create-pkp 后获得)
PKP_PUBLIC_KEY=0x...

# Wrapped Key 信息 (运行 create-wallet 后获得)
WK_PUBLIC_KEY=0x...
CIPHERTEXT=...
DATA_TO_ENCRYPT_HASH=...
```

## 执行流程

### 1. 创建 PKP
```bash
npm run pkp
```
**功能**: 铸造新的 PKP (Programmable Key Pair)
**输出**: PKP 公钥和以太坊地址
**操作**: 将输出的 `PKP_PUBLIC_KEY` 添加到 `.env` 文件

### 2. 创建 Wrapped Key 钱包
```bash
npm run create
```
**功能**: 在 Lit Action 内生成新的 Taproot 密钥对并加密私钥
**输出**: 
- `Public Key`: Wrapped Key 的公钥 (保存到 `WK_PUBLIC_KEY`)
- `Ciphertext`: 加密的私钥数据 (保存到 `CIPHERTEXT`)
- `Data Hash`: 加密数据的哈希 (保存到 `DATA_TO_ENCRYPT_HASH`)

### 3. 获取比特币地址并充值
```bash
# 从公钥生成比特币地址
node -p "
const { generateBtcAddressP2PKH } = require('./dist/index.js');
generateBtcAddressP2PKH('YOUR_WK_PUBLIC_KEY');
"

# 使用测试网水龙头为该地址充值
# https://coinfaucet.eu/en/btc-testnet/
```

### 4. 构造并签名交易
```bash
npm run txn
```
**功能**: 创建 Taproot 交易并通过 Lit Action 签名和广播
**过程**:
1. 从 Wrapped Key 公钥获取 UTXOs
2. 构造发送到 `DESTINATION_ADDRESS` 的交易
3. 在 Lit Action 内解密私钥并签名
4. (可选) 广播交易到比特币网络

## 核心实现解析

### 1. Taproot 交易构造 (`src/index.ts`)

```typescript
async function createTaprootTxn(
    senderPublicKey: string,
    destinationAddress: string,
    amountToSend: number,
    fee: number,
    network: any
) {
    // 1. 从公钥推导 Taproot 地址
    const keyPair = ECPair.fromPublicKey(Buffer.from(senderPublicKey, "hex"));
    const pubKey = keyPair.publicKey;
    const xOnlyPubKey = pubKey.slice(1); // 获取 x-only 公钥

    const { address, output } = bitcoin.payments.p2tr({
        pubkey: Buffer.from(xOnlyPubKey),
        network: network,
    });

    // 2. 获取 UTXO 信息
    const utxos = await fetch(
        `${BTC_ENDPOINT}/api/address/${address}/utxo`
    ).then((r) => r.json());

    // 3. 构造交易
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(utxos[0].txid, "hex").reverse(), utxos[0].vout);

    const sendAmount = amountToSend - fee;
    tx.addOutput(
        bitcoin.address.toOutputScript(destinationAddress, network),
        sendAmount
    );

    // 4. 计算 Taproot 签名哈希
    const hash = tx.hashForWitnessV1(
        0,                                    // 输入索引
        [output!],                           // 输出脚本数组
        [utxos[0].value],                   // 输入金额数组
        bitcoin.Transaction.SIGHASH_DEFAULT  // Taproot 默认签名类型
    );

    return { 
        Transaction: tx.toHex(), 
        SigHash: hash.toString("hex") 
    };
}
```

### 2. Lit Action 签名逻辑 (`src/actions/taproot-action.ts`)

```typescript
const signTaprootTransaction = async (
    PRIVATE_KEY: string,
    TRANSACTION_HEX: string,
    SIGHASH: string,
    BROADCAST: boolean
) => {
    // 1. 私钥预处理
    if (PRIVATE_KEY.startsWith("0x")) {
        PRIVATE_KEY = PRIVATE_KEY.slice(2);
    }

    // 2. 交易解析
    const TRANSACTION = bitcoin.Transaction.fromHex(TRANSACTION_HEX);

    // 3. Schnorr 签名 (Taproot 专用)
    const hashBuffer = Buffer.from(SIGHASH, "hex");
    const signature = Buffer.from(
        signSchnorr(hashBuffer, Buffer.from(PRIVATE_KEY, "hex"))
    );

    // 4. 设置见证数据
    TRANSACTION.setWitness(0, [signature]);

    // 5. 广播交易 (可选)
    const signedTx = TRANSACTION.toHex();
    if (BROADCAST === true) {
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

### 3. 密钥加密与解密流程

#### 创建钱包 (加密私钥)
```typescript
if (method === "createWallet") {
    const sessionSig = getFirstSessionSig(pkpSessionSigs);
    const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
    const ACC = getPkpAccessControlCondition(pkpAddress);

    const result = await Lit.Actions.runOnce(
        { waitForResponse: true, name: "encryptedPrivateKey" },
        async () => {
            // 生成随机钱包
            const wallet = ethers.Wallet.createRandom();
            const publicKey = wallet.publicKey;
            const privateKey = wallet.privateKey;

            // 使用 PKP 访问控制条件加密私钥
            const { ciphertext, dataToEncryptHash } = await Lit.Actions.encrypt({
                accessControlConditions: [ACC],
                to_encrypt: new TextEncoder().encode(`lit_${privateKey}`),
            });

            return JSON.stringify({
                ciphertext,
                dataToEncryptHash,
                publicKey: publicKey.toString(),
            });
        }
    );
}
```

#### 签名交易 (解密私钥)
```typescript
if (method === "signTaprootTxn") {
    const sessionSig = getFirstSessionSig(pkpSessionSigs);
    const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
    const ACC = getPkpAccessControlCondition(pkpAddress);

    // 解密私钥
    let decryptedPrivateKey = await Lit.Actions.decryptAndCombine({
        accessControlConditions: [ACC],
        ciphertext: ciphertext,
        dataToEncryptHash: dataToEncryptHash,
        authSig: null,
        chain: "ethereum",
    });

    // 移除前缀
    const privateKey = decryptedPrivateKey.startsWith("lit_")
        ? decryptedPrivateKey.slice(4)
        : decryptedPrivateKey;

    // 执行签名
    const response = await signTaprootTransaction(
        privateKey,
        transactionHex,
        sigHash,
        broadcast
    );
}
```

## 安全注意事项

### 1. 私钥管理
- 私钥在 Lit TEE 内生成，永不暴露到客户端
- 使用 PKP 会话签名控制私钥访问权限
- 加密存储确保只有授权方可以解密

### 2. 网络安全
- 仅使用测试网进行开发和测试
- 生产环境需要额外的安全审计
- 确保 RPC 端点的可靠性和安全性

### 3. 交易验证
- 始终验证交易详情 (金额、地址、手续费)
- 检查 UTXO 的有效性和充足性
- 确认网络状态和确认要求

## 构建配置

### ESBuild 配置 (`esbuild.js`)
```javascript
require('esbuild').build({
    entryPoints: ['src/actions/taproot-action.ts'],
    bundle: true,
    minify: false,
    outfile: 'actions/taproot-action.js',
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    globalName: 'LitAction',
    // 浏览器环境垫片
    inject: ['./bitcoin.shim.js', './buffer.shim.js'],
})
```

### 依赖垫片
- `bitcoin.shim.js`: 比特币库浏览器兼容性
- `buffer.shim.js`: Node.js Buffer 在浏览器中的实现

## 故障排除

### 常见问题

1. **PKP 创建失败**
   - 检查以太坊私钥是否有效且有足够的测试代币
   - 确认网络连接正常

2. **Wrapped Key 创建失败**
   - 验证 PKP 公钥配置正确
   - 检查 Lit 网络连接状态

3. **交易签名失败**
   - 确认加密数据 (ciphertext, dataToEncryptHash) 正确
   - 验证 UTXO 是否存在且金额充足

4. **交易广播失败**
   - 检查比特币网络端点是否可用
   - 验证交易格式和签名正确性

### 调试技巧

```bash
# 检查钱包余额
curl "https://blockstream.info/testnet/api/address/<BTC_ADDRESS>"

# 查看 UTXO 信息
curl "https://blockstream.info/testnet/api/address/<BTC_ADDRESS>/utxo"

# 广播交易 (测试)
curl -X POST -H "Content-Type: text/plain" \
  -d "<SIGNED_TX_HEX>" \
  "https://blockstream.info/testnet/api/tx"
```

## 高级功能

### 自定义签名逻辑
可以扩展 `taproot-action.ts` 来支持更复杂的签名场景：

```typescript
// 多输入交易签名
const signMultiInputTransaction = async (inputs, outputs) => {
    // 实现多输入 Taproot 交易签名
};

// 条件签名
const conditionalSign = async (conditions) => {
    // 基于条件的签名逻辑
};
```

### 集成其他 Lit Protocol 功能
- **条件执行**: 结合 Lit Actions 的条件逻辑
- **跨链互操作**: 与 EVM 链的协同操作
- **时间锁**: 基于时间的签名控制

## 相关资源

- [Lit Protocol 官方文档](https://developer.litprotocol.com/)
- [Bitcoin Taproot 规范](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki)
- [bitcoinjs-lib 文档](https://github.com/bitcoinjs/bitcoinjs-lib)
- [比特币测试网浏览器](https://blockstream.info/testnet/)

## 许可证

本项目基于 MIT 许可证开源。
- Store these three carefully as cipher text and data to encrypt hash will always be required for signing within Lit action
- Create a new transaction hex which we want to be signed by the Lit Action
- Send the Transaction to the Lit Action with transaction hex, sighash and decryption parameters

## Migrating examples to mainnet

Do the following changes in the environment
- Change `BTC_ENDPOINT` to `https://mempool.space`
- Change `NETWORK` to mainnet

## Specific Files to Reference

- [./src/index.ts](./src/index.ts): Contains the core logic for the example
- [./src/actions/taproot-action.ts](./src/actions/taproot-action.ts): Contains the Lit Action code

