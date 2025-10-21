# BTC-EVM Swap 部署指南

## 📋 部署步骤

### 方案 A: 使用 Pinata IPFS (推荐)

#### 1. 获取 Pinata API Key

访问 https://app.pinata.cloud/developers/api-keys 并:

1. 注册/登录账户
2. 点击 "New Key"
3. 勾选权限:
   - ✅ `pinFileToIPFS`
   - ✅ `pinJSONToIPFS`
4. 命名为 "BTC-EVM-Swap"
5. 创建并复制 JWT Token

#### 2. 配置环境变量

编辑 `.env.local` 文件:

```env
NEXT_PUBLIC_PRIVATE_KEY=0xf0275f717f2da1f21161506ff8f39909bd854cb2b597db69a482fe16c35f3bb8
NEXT_PUBLIC_PINATA_API=YOUR_PINATA_JWT_TOKEN_HERE
NEXT_PUBLIC_PINATA_GATEWAY=gateway.pinata.cloud
```

#### 3. 启动应用

```bash
npm run dev
```

访问 http://localhost:3000

---

### 方案 B: 不使用 Pinata (修改代码)

如果不想注册 Pinata，可以修改代码使用 Lit Protocol 的内置 IPFS 或直接使用代码字符串。

#### 修改步骤

1. 修改 `lit/index.ts` 中的 `createLitAction` 函数
2. 修改 `mintGrantBurnPKP` 函数接受代码字符串
3. 使用 `code` 参数代替 `ipfsId`

详见下方代码修改说明。

---

## 🚀 使用流程

### 1. 生成 Lit Action
点击 "Generate Lit Action" 按钮
- 生成跨链交换逻辑
- 上传到 IPFS
- 获得 IPFS CID

### 2. 铸造 PKP
点击 "Mint Grant Burn PKP" 按钮
- 铸造新的 PKP
- 授权 Lit Action 作为认证方法
- PKP 自动转移给自己

### 3. 获取 BTC 地址
点击 "Get BTC Address for PKP" 按钮
- 为 PKP 生成 P2PKH 比特币地址
- 用于接收 BTC

### 4. 充值测试币

**比特币测试网:**
- 水龙头: https://coinfaucet.eu/en/btc-testnet/
- 充值到 PKP 的 BTC 地址

**Chronicle Yellowstone:**
- 水龙头: https://chronicle-yellowstone-faucet.getlit.dev/
- 充值到 PKP 的 ETH 地址

### 5. 检查资金状态
点击 "Funds Status on PKP" 按钮
- 验证 BTC 余额
- 验证 ETH 余额

### 6. 执行交换
点击 "Run Lit Action" 按钮
- Lit Action 检查双方资金
- 满足条件则执行原子交换
- 否则执行退款

---

## 🔧 代码修改 (方案 B)

### 修改 lit/index.ts

```typescript
// 修改 createLitAction 函数
export async function createLitAction() {
    console.log("creating lit action..");
    swapObject.chainId = LIT_CHAINS[swapObject.evmChain].chainId;
    const litAction = await generateBtcEthSwapLitActionCode(swapObject);
    
    // 不上传到 IPFS，直接返回代码
    console.log("Lit Action code generated (length:", litAction.length, "bytes)");
    return litAction; // 返回代码字符串而不是 IPFS CID
}

// 修改 mintGrantBurnPKP 函数
export async function mintGrantBurnPKP(_litActionCode: string) {
    console.log("minting started..");
    const signer = await getEvmWallet();

    const litContracts = new LitContracts({
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    // 使用代码而不是 IPFS CID
    const bytesAction = ethers.utils.toUtf8Bytes(_litActionCode);
    const hashedAction = ethers.utils.keccak256(bytesAction);

    const pkpMintCost = await litContracts.pkpNftContract.read.mintCost();

    const tx =
        await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
            AuthMethodType.LitAction,
            [AuthMethodType.LitAction],
            [hashedAction], // 使用代码哈希
            ["0x"],
            [[AuthMethodScope.SignAnything]],
            false,
            true,
            {
                value: pkpMintCost,
            }
        );

    // ... 其余代码保持不变
}

// 修改 runLitAction 函数
export async function runLitAction(_litActionCode: string, _mintedPKP: Pkp) {
    // ... 前面的代码保持不变
    
    const results = await litNodeClient.executeJs({
        code: _litActionCode, // 使用 code 而不是 ipfsId
        sessionSigs: sessionSig,
        jsParams: {
            // ... 参数保持不变
        },
    });
    
    // ... 其余代码保持不变
}
```

### 修改 app/page.tsx

```typescript
const [litActionCode, setLitActionCode] = useState(null); // 改为存储代码

<button onClick={async () => setLitActionCode(await createLitAction())}>
    Generate Lit Action
</button>
<button onClick={async () => setPkp(await mintGrantBurnPKP(litActionCode))}>
    Mint Grant Burn PKP
</button>
<button onClick={() => runLitAction(litActionCode, pkp)}>
    Run Lit Action
</button>
```

---

## ⚠️ 注意事项

1. **测试网代币**
   - Chronicle Yellowstone 需要 ETH 用于铸造 PKP
   - Bitcoin Testnet 需要 BTC 用于交换测试

2. **交易确认**
   - BTC 交易需要等待 1-6 个确认
   - EVM 交易通常 10-30 秒确认

3. **时间锁**
   - 默认过期时间是 4 天
   - 过期后可以执行退款操作

4. **Gas 费用**
   - PKP 铸造需要 ~0.001 ETH
   - 交换执行需要 Gas 费

---

## 🐛 故障排除

### 问题 1: Pinata API 错误

```
Error: Unauthorized
```

**解决方案:**
- 检查 `.env.local` 中的 `NEXT_PUBLIC_PINATA_API`
- 确保 API Key 有正确的权限

### 问题 2: PKP 铸造失败

```
Error: Insufficient funds
```

**解决方案:**
- 访问水龙头获取测试代币
- 确保地址 `0x3aEE355B3aCDAb4e738981Ff16577917FA49b19C` 有余额

### 问题 3: BTC UTXO 未找到

```
Error: No UTXOs found
```

**解决方案:**
- 确认已为 BTC 地址充值
- 等待交易确认 (1-6 个区块)
- 使用区块浏览器验证: https://mempool.space/testnet

---

## 📚 参考资源

- **Lit Protocol 文档:** https://developer.litprotocol.com/
- **Pinata 文档:** https://docs.pinata.cloud/
- **Bitcoin Testnet 水龙头:** https://coinfaucet.eu/en/btc-testnet/
- **Chronicle 水龙头:** https://chronicle-yellowstone-faucet.getlit.dev/
- **Bitcoin 测试网浏览器:** https://mempool.space/testnet
- **Chronicle 浏览器:** https://yellowstone-explorer.litprotocol.com/

---

**部署时间:** 2025年10月21日  
**Lit Protocol 版本:** v7.3.1  
**Next.js 版本:** 15.1.4
