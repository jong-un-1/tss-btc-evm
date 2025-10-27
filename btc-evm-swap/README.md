# BTC ↔ EVM Cross-Chain Swap Demo

基于 Lit Protocol 的比特币与 EVM 链跨链原子交换演示应用。

## 项目概述

这是一个使用 [Next.js](https://nextjs.org) 构建的去中心化跨链交换应用，展示了如何通过 Lit Protocol 的 MPC 网络和 Lit Actions 实现 BTC 与 EVM 链之间的原子交换。

### 核心功能

- **PKP (Programmable Key Pairs)**: 可编程密钥对管理
- **Lit Actions**: 条件执行的跨链交换逻辑
- **原子交换**: 确保跨链交易的原子性
- **时间锁**: 基于时间的交换超时机制
- **多链支持**: 支持比特币测试网和多个 EVM 链

## 技术架构

### 前端架构
```
app/
├── page.tsx              # 主界面组件
├── layout.tsx            # 应用布局
└── globals.css           # 全局样式

lit/
├── index.ts              # Lit Protocol 核心集成
├── create-swap-action.ts # 跨链交换 Lit Action 生成器
└── example-action.js     # 编译后的 Lit Action
```

### 核心依赖
- **@lit-protocol/lit-node-client**: Lit 网络客户端
- **@lit-protocol/auth-helpers**: 认证和授权助手
- **bitcoinjs-lib**: 比特币交易处理
- **ethers.js**: 以太坊交互
- **ecpair**: 椭圆曲线密钥对处理

## 快速开始

### 环境要求

在开始之前，请确保满足以下要求：

- **Node.js**: v19.9.0 或更高版本
- **npm** / **yarn** / **pnpm**: 最新稳定版本
- **浏览器**: 支持 WebAuthn 的现代浏览器 (Chrome, Firefox, Safari, Edge)

> ⚠️ **重要**: Node.js v19.9.0+ 是必需的，因为项目使用了 ES 模块和最新的加密 API。

### 1. 安装依赖

```bash
npm install
# 或
yarn install
# 或
pnpm install
```

### 2. 环境配置

创建 `.env.local` 文件 (参考 `.env.local.example`):

```env
# 以太坊私钥 (用于 PKP 认证)
NEXT_PUBLIC_ETHEREUM_PRIVATE_KEY=0x...

# Lit 网络配置
NEXT_PUBLIC_LIT_NETWORK=datil-dev

# 比特币网络配置
NEXT_PUBLIC_BTC_NETWORK=testnet
NEXT_PUBLIC_BTC_ENDPOINT=https://blockstream.info

# PKP 配置 (运行后获得)
NEXT_PUBLIC_PKP_PUBLIC_KEY=0x...
NEXT_PUBLIC_PKP_ETH_ADDRESS=0x...
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 使用指南

### 完整交换流程

1. **生成 Lit Action**
   - 点击 "Generate Lit Action" 
   - 系统将创建包含交换逻辑的 Lit Action 并上传到 IPFS

2. **铸造 PKP**
   - 点击 "Mint Grant Burn PKP"
   - 铸造新的可编程密钥对
   - 将 Lit Action 设置为认证方法

3. **获取 BTC 地址**
   - 点击 "Get BTC Address for PKP"
   - 为 PKP 生成对应的比特币地址

4. **充值测试币**
   - 使用 [比特币测试网水龙头](https://coinfaucet.eu/en/btc-testnet/) 为 BTC 地址充值
   - 确保 EVM 地址有足够的 ETH/代币

5. **执行交换**
   - 点击 "Run Lit Action"
   - 系统将检查交换条件并执行相应操作

### 交换条件逻辑

```typescript
// 条件检查优先级
if (btcConditionPass) {
    if (evmConditionsPass) {
        // 执行正常交换: BTC → 接收方, EVM → 发送方
    } else if (deadlinePassed) {
        // 超时双链回退: BTC → 发送方, EVM → 接收方
    } else {
        // BTC 单链回退: BTC → 发送方
    }
} else if (evmConditionsPass) {
    // EVM 单链回退: EVM → 发送方
}
```

## 核心组件说明

### 1. Lit Action 生成器 (`create-swap-action.ts`)

负责生成包含跨链交换逻辑的 Lit Action 代码：

```typescript
export async function generateBtcEthSwapLitActionCode(swapObject) {
    // 设置交换参数
    const originTime = Date.now();
    const evmConditions = {
        contractAddress: "",
        standardContractType: "",
        chain: swapObject.evmChain,
        method: "eth_getBalance",
        parameters: ["address"],
        returnValueTest: {
            comparator: ">=",
            value: ethers.utils.parseEther(swapObject.evmAmount).toString(),
        },
    };
    
    // 生成未签名交易
    const unsignedEvmTransaction = generateUnsignedEVMNativeTransaction({...});
    const unsignedEvmClawbackTransaction = generateUnsignedEVMNativeTransaction({...});
    
    // 替换模板变量
    const variablesToReplace = {
        originTime,
        deadlineDays: swapObject.expirationDays,
        btcSwapValue: swapObject.btcSats,
        evmConditions: JSON.stringify(evmConditions),
        evmTransaction: JSON.stringify(unsignedEvmTransaction),
        evmClawbackTransaction: JSON.stringify(unsignedEvmClawbackTransaction),
    };
    
    return processedLitAction;
}
```

### 2. PKP 管理 (`lit/index.ts`)

处理 PKP 的创建、授权和交易签名：

```typescript
export async function mintGrantBurnPKP(_action_ipfs: string) {
    const signer = await getEvmWallet();
    const litContracts = new LitContracts({
        network: LitNetwork.DatilDev,
        debug: false,
    });
    
    await litContracts.connect();
    const bytesAction = await stringToBytes(_action_ipfs);
    const pkpMintCost = await litContracts.pkpNftContract.read.mintCost();

    // 铸造 PKP 并设置 Lit Action 认证
    const tx = await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
        AuthMethodType.LitAction,
        [AuthMethodType.LitAction],
        [bytesAction],
        ["0x"],
        [[AuthMethodScope.SignAnything]],
        false,
        true,
        { value: pkpMintCost }
    );

    const receipt = await tx.wait();
    const pkpInfo = await getPkpInfoFromMintReceipt(receipt, litContracts);
    
    return pkpInfo;
}
```

### 3. 比特币地址生成

```typescript
export function generateBtcAddressP2PKH(publicKey: string) {
    if (publicKey.startsWith("0x")) {
        publicKey = publicKey.slice(2);
    }
    const pubKeyBuffer = Buffer.from(publicKey, "hex");

    const { address } = bitcoin.payments.p2pkh({
        pubkey: pubKeyBuffer,
        network: bitcoin.networks.testnet,
    });
    
    return address;
}
```

## 交换参数配置

默认交换配置 (可在代码中修改):

```typescript
const swapObject: SwapObject = {
    btcA: "mmnxChcUSLdPGuvSmkpUr7ngrNjfTYKcRq",      // BTC 发送方地址
    evmA: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB", // EVM 接收方地址
    btcB: "mmnxChcUSLdPGuvSmkpUr7ngrNjfTYKcRq",      // BTC 接收方地址
    evmB: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB", // EVM 发送方地址
    btcNetwork: "testnet",                           // 比特币网络
    btcSats: "1000",                                // BTC 金额 (satoshis)
    evmChain: "yellowstone",                        // EVM 链名称
    evmAmount: "0.01",                              // EVM 金额 (ETH)
    decimals: "18",                                 // 代币精度
    currencyType: "NATIVE",                         // 货币类型
    expirationDays: "4",                           // 超时天数
};
```

## 安全注意事项

1. **私钥安全**: 确保私钥安全存储，不要提交到版本控制
2. **测试网使用**: 当前配置仅用于测试网，生产环境需要相应调整
3. **金额验证**: 交换前验证所有金额和地址的正确性
4. **网络费用**: 确保账户有足够的网络费用

## 开发指南

### 项目结构
```
├── app/                  # Next.js 应用主目录
│   ├── page.tsx         # 主界面组件
│   ├── layout.tsx       # 应用布局
│   └── globals.css      # 全局样式
├── lit/                 # Lit Protocol 集成
│   ├── index.ts         # 核心功能实现
│   ├── create-swap-action.ts # Lit Action 生成器
│   └── example-action.js # 示例 Lit Action
├── package.json         # 项目依赖配置
├── next.config.mjs      # Next.js 配置
├── tailwind.config.ts   # Tailwind CSS 配置
└── tsconfig.json        # TypeScript 配置
```

### 自定义交换逻辑

要自定义交换逻辑，可以修改 `create-swap-action.ts` 中的原始 Lit Action 代码：

```typescript
const rawLitAction = `
// 自定义条件检查
async function customValidation() {
    // 添加自定义验证逻辑
}

// 自定义交换逻辑
async function customSwapLogic() {
    // 实现自定义交换流程
}
`;
```

### 扩展支持的链

要添加新的 EVM 链支持，需要：

1. 在 `swapObject` 中添加新链配置
2. 确保 Lit Protocol 支持该链
3. 更新链 ID 和 RPC 端点配置

## 故障排除

### 常见问题

1. **PKP 铸造失败**
   - 检查以太坊私钥是否有效
   - 确保账户有足够的 ETH 支付铸造费用

2. **Lit Action 执行失败**
   - 验证 IPFS ID 是否正确
   - 检查网络连接和 Lit 节点状态

3. **交易签名失败**
   - 确认 PKP 权限配置正确
   - 验证会话签名是否有效

### 调试技巧

- 打开浏览器控制台查看详细日志
- 使用 Lit Protocol 官方文档进行配置验证
- 检查网络状态和 RPC 端点可用性

## 相关资源

- [Lit Protocol 官方文档](https://developer.litprotocol.com/)
- [比特币测试网水龙头](https://coinfaucet.eu/en/btc-testnet/)
- [Blockstream 测试网浏览器](https://blockstream.info/testnet/)
- [Next.js 文档](https://nextjs.org/docs)

## 许可证

本项目基于 MIT 许可证开源。
