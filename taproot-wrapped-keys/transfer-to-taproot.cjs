/**
 * 将 BTC 从 P2PKH 地址转移到 Taproot 地址
 * 这个脚本使用 Wrapped Key 签名一个普通的 P2PKH 交易，将资金转移到 Taproot 地址
 */

const bitcoin = require('bitcoinjs-lib');
const ecc = require('@bitcoin-js/tiny-secp256k1-asmjs');
const { ECPairFactory } = require('ecpair');
require('dotenv').config();

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const NETWORK = bitcoin.networks.testnet;
const BTC_ENDPOINT = "https://mempool.space/testnet";

async function main() {
    const publicKeyHex = process.env.WK_PUBLIC_KEY;
    
    if (!publicKeyHex) {
        throw new Error("WK_PUBLIC_KEY not found in .env");
    }

    // 移除 0x 前缀
    const cleanPubKey = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
    const pubKeyBuffer = Buffer.from(cleanPubKey, 'hex');

    // 生成 P2PKH 地址（资金来源）
    const p2pkhPayment = bitcoin.payments.p2pkh({
        pubkey: pubKeyBuffer,
        network: NETWORK,
    });
    const p2pkhAddress = p2pkhPayment.address;

    // 生成 Taproot 地址（资金目标）
    const keyPair = ECPair.fromPublicKey(pubKeyBuffer);
    const xOnlyPubKey = Buffer.from(keyPair.publicKey.slice(1));
    const taprootPayment = bitcoin.payments.p2tr({
        pubkey: xOnlyPubKey,
        network: NETWORK,
    });
    const taprootAddress = taprootPayment.address;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 地址信息:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n💰 P2PKH 地址 (资金来源):\n   ${p2pkhAddress}`);
    console.log(`\n🔷 Taproot 地址 (资金目标):\n   ${taprootAddress}\n`);

    // 获取 UTXO
    console.log('🔄 正在获取 UTXO...');
    const utxos = await fetch(`${BTC_ENDPOINT}/api/address/${p2pkhAddress}/utxo`)
        .then(r => r.json());

    if (!utxos || utxos.length === 0) {
        throw new Error(`P2PKH 地址 ${p2pkhAddress} 没有找到 UTXO`);
    }

    console.log(`✅ 找到 ${utxos.length} 个 UTXO`);
    const utxo = utxos[0];
    console.log(`   TXID: ${utxo.txid}`);
    console.log(`   Vout: ${utxo.vout}`);
    console.log(`   金额: ${utxo.value} satoshis`);

    // 创建交易
    const fee = 2000; // 手续费 (satoshis)
    const sendAmount = utxo.value - fee;

    console.log(`\n💸 转账金额: ${sendAmount} satoshis`);
    console.log(`⛽ 手续费: ${fee} satoshis`);

    const psbt = new bitcoin.Psbt({ network: NETWORK });

    // 获取完整的交易数据
    console.log('\n🔄 正在获取交易数据...');
    const utxoTxHex = await fetch(`${BTC_ENDPOINT}/api/tx/${utxo.txid}/hex`)
        .then(r => r.text());

    // 添加输入
    psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxoTxHex, 'hex'),
    });

    // 添加输出 - 转到 Taproot 地址
    psbt.addOutput({
        address: taprootAddress,
        value: sendAmount,
    });

    console.log('✅ PSBT 创建成功');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  下一步需要签名');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📝 PSBT Base64:');
    console.log(psbt.toBase64());
    console.log('\n⚠️  由于这是 P2PKH 交易，需要使用标准 ECDSA 签名，而不是 Schnorr 签名。');
    console.log('⚠️  当前的 Lit Action 只支持 Schnorr 签名（用于 Taproot）。');
    console.log('\n💡 建议方案：');
    console.log('   1. 使用在线工具手动签名这个 PSBT');
    console.log('   2. 或者直接使用水龙头充值到 Taproot 地址');
    console.log(`   3. Taproot 地址: ${taprootAddress}`);
}

main().catch(console.error);
