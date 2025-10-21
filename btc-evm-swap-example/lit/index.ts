import { generateBtcEthSwapLitActionCode } from "./create-swap-action";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import {
    LitNetwork,
    AuthMethodType,
    AuthMethodScope,
    LIT_CHAINS,
    LIT_RPC,
} from "@lit-protocol/constants";
import { LitAbility } from "@lit-protocol/types";
import {
    LitActionResource,
    createSiweMessageWithRecaps,
    generateAuthSig,
    LitPKPResource,
} from "@lit-protocol/auth-helpers";
import { ethers } from "ethers";
import bs58 from "bs58";
import { ec as EC } from "elliptic";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import * as bitcoin from "bitcoinjs-lib";
import axios from "axios";
import BN from "bn.js";
import * as bip66 from "bip66";

const ec = new EC("secp256k1");
bitcoin.initEccLib(ecc);

// const Btc_Endpoint = "https://mempool.space";
const Btc_Endpoint = "https://blockstream.info";

interface SwapObject {
    btcA: string;
    evmA: string;
    btcB: string;
    evmB: string;
    btcNetwork: string;
    btcSats: string;
    evmChain: string;
    evmAmount: string;
    decimals: string;
    currencyType: string;
    expirationDays: string;
    chainId?: number;
}

interface Pkp {
    publicKey: string;
    ethAddress: string;
    tokenId: string;
}

// https://coinfaucet.eu/en/btc-testnet/ faucet that supports p2kh
// A sends on btc to B, B sends on evm to A
const swapObject: SwapObject = {
    btcA: "mmnxChcUSLdPGuvSmkpUr7ngrNjfTYKcRq",
    evmA: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    btcB: "mmnxChcUSLdPGuvSmkpUr7ngrNjfTYKcRq",
    evmB: "0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB",
    btcNetwork: "testnet",
    btcSats: "1000",
    evmChain: "yellowstone",
    evmAmount: "0.01",
    decimals: "18",
    currencyType: "NATIVE",
    expirationDays: "4",
};

let mintedPKP: Pkp,
    action_ipfs: string;

// major functions ----------------------------

const litNodeClient = new LitNodeClient({
    litNetwork: LitNetwork.DatilDev,
    debug: false,
});

export async function createLitAction() {
    console.log("creating lit action..");
    swapObject.chainId = LIT_CHAINS[swapObject.evmChain].chainId;
    const litAction = await generateBtcEthSwapLitActionCode(swapObject);
    const ipfsCid = await uploadViaPinata(litAction);

    console.log("Lit Action code:\n", litAction);
    console.log("IPFS CID: ", ipfsCid);
    return ipfsCid;
}

export async function mintGrantBurnPKP(_action_ipfs: string) {
    _action_ipfs ? null : (_action_ipfs = action_ipfs);

    console.log("minting started..");
    const signer = await getEvmWallet();

    const litContracts = new LitContracts({
        // signer: signer,
        network: LitNetwork.DatilDev,
        debug: false,
    });

    await litContracts.connect();

    const bytesAction = await stringToBytes(_action_ipfs);

    const pkpMintCost = await litContracts.pkpNftContract.read.mintCost();

    const tx =
        await litContracts.pkpHelperContract.write.mintNextAndAddAuthMethods(
            AuthMethodType.LitAction,
            [AuthMethodType.LitAction],
            [bytesAction],
            ["0x"],
            [[AuthMethodScope.SignAnything]],
            false,
            true,
            {
                value: pkpMintCost,
            }
        );

    const receipt = await tx.wait();
    console.log(
        "pkp minted, added lit action as auth, and transferred to itself: ",
        receipt
    );

    const pkpInfo = await getPkpInfoFromMintReceipt(receipt, litContracts);
    console.log("pkp: ", pkpInfo);

    return pkpInfo;
}

export function generateBtcAddressP2PKH(publicKey: string) {
    publicKey ? null : (publicKey = mintedPKP.publicKey);
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

export async function runLitAction(_action_ipfs: string, _mintedPKP: Pkp) {
    _action_ipfs ? null : (_action_ipfs = action_ipfs);
    _mintedPKP ? null : (_mintedPKP = mintedPKP);
    console.log("executing lit action..");

    const signer = await getEvmWallet();
    const sessionSig = await sessionSigEOA(signer, _mintedPKP);
    const authSig = await getAuthSig(signer);

    const chainProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[swapObject.evmChain].rpcUrls[0]
    );

    const evmGasConfig = {
        maxFeePerGas: ethers.BigNumber.from("1500000000"),
        chainId: LIT_CHAINS[swapObject.evmChain].chainId,
        nonce: await chainProvider.getTransactionCount(_mintedPKP.ethAddress),
        gasLimit: "21000",
    };

    const executeEvmClawback = async () => {
        await litNodeClient.connect();

        const results = await litNodeClient.executeJs({
            ipfsId: _action_ipfs,
            sessionSigs: sessionSig,
            jsParams: {
                pkpPublicKey: _mintedPKP.publicKey,
                pkpAddress: ethers.utils.computeAddress(_mintedPKP.publicKey),
                authSig: authSig,
                evmGasConfig: evmGasConfig,
            },
        });

        console.log("results", results);

        if (!results?.signatures?.evmSignature) {
            return;
        }
        await broadcastEVMTransaction(results, chainProvider);
    };

    const pkpBtcAddress = generateBtcAddressP2PKH(_mintedPKP.publicKey);
    console.log("pkpBtcAddress", pkpBtcAddress);
    const btcFeeRate = 28;

    const endpoint = `${Btc_Endpoint}/testnet/api/address/${pkpBtcAddress}/utxo`;
    const result = await fetch(endpoint);
    const utxos = await result.json();
    const firstUtxo = utxos[0];
    console.log("utxos", utxos);

    if (utxos.length === 0) {
        executeEvmClawback();
        return;
    }

    const {
        transaction: btcSuccessTransactionHex,
        transactionHash: successHash,
    } = await prepareBtcTransaction({
        senderAddress: pkpBtcAddress,
        recipientAddress: swapObject.btcB,
        firstUtxo,
        feeRate: btcFeeRate,
    });

    const {
        transaction: btcClawbackTransactionHex,
        transactionHash: clawbackHash,
    } = await prepareBtcTransaction({
        senderAddress: pkpBtcAddress,
        recipientAddress: swapObject.btcA,
        firstUtxo,
        feeRate: btcFeeRate,
    });

    await litNodeClient.connect();

    const results = await litNodeClient.executeJs({
        ipfsId: _action_ipfs,
        sessionSigs: sessionSig,
        jsParams: {
            pkpPublicKey: _mintedPKP.publicKey,
            pkpAddress: ethers.utils.computeAddress(_mintedPKP.publicKey),
            pkpBtcAddress,
            authSig: authSig,
            BTC_ENDPOINT: Btc_Endpoint,
            passedFirstUtxo: firstUtxo,
            evmGasConfig: evmGasConfig,
            btcFeeRate: btcFeeRate,
            successHash: successHash,
            clawbackHash: clawbackHash,
            successTxHex: btcSuccessTransactionHex,
            clawbackTxHex: btcClawbackTransactionHex,
        },
    });

    console.log("results", results);

    if (results.signatures == undefined) {
        return;
    } else if (!results?.signatures?.evmSignature) {
        await broadcastBtcTransaction(results);
    } else if (!results?.signatures?.btcSignature) {
        await broadcastEVMTransaction(results, chainProvider);
    } else if (
        !results?.signatures?.evmSignature &&
        !results?.signatures?.btcSignature
    ) {
        return;
    } else {
        await broadcastBtcTransaction(results);
        await broadcastEVMTransaction(results, chainProvider);
    }
}

// faucets will mostly pay higher than 1000 sats, either handle the change or transfer complete amount
async function prepareBtcTransaction({
    senderAddress,
    recipientAddress,
    firstUtxo,
    feeRate,
}) {
    function estimateTransactionSize(numInputs: number, numOutputs: number) {
        const baseSize = 10; // Version (4 bytes) + Locktime (4 bytes) + 2 bytes for number of inputs and outputs
        const inputSize = 148; // P2PKH input size
        const outputSize = 34; // P2PKH output size

        return baseSize + numInputs * inputSize + numOutputs * outputSize;
    }

    const txEndpoint = `${Btc_Endpoint}/testnet/api/tx/${firstUtxo.txid}`;
    const txResult = await fetch(txEndpoint);
    const txData = await txResult.json();
    const output = txData.vout[firstUtxo.vout];
    const scriptPubKey = output.scriptpubkey;
    const network = bitcoin.networks.testnet;

    const estimatedSize = estimateTransactionSize(1, 2);
    const feeValue = BigInt(Math.ceil(estimatedSize * feeRate));
    console.log("feeValue", feeValue);

    // for sending all balance of pkp to recipient
    // const estimatedSize = estimateTransactionSize(1, 1);
    // const feeValue = BigInt(Math.ceil(estimatedSize * feeRate));
    // const amount = BigInt(firstUtxo.value) - feeValue;

    // handling change amount
    const amount = BigInt(1000);
    const changeAmount = BigInt(firstUtxo.value) - amount - feeValue;

    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(firstUtxo.txid, "hex").reverse(), firstUtxo.vout);
    tx.addOutput(
        bitcoin.address.toOutputScript(recipientAddress, network),
        amount
    );
    if (changeAmount > 0) {
        tx.addOutput(
            bitcoin.address.toOutputScript(senderAddress, network),
            changeAmount
        );
    }
    const txHex = tx.toHex();

    const scriptPubKeyBuffer = Buffer.from(scriptPubKey, "hex");
    const sigHash = tx.hashForSignature(
        0,
        bitcoin.script.compile(scriptPubKeyBuffer),
        bitcoin.Transaction.SIGHASH_ALL
    );

    return { transaction: txHex, transactionHash: sigHash };
}

export async function broadcastBtcTransaction(results) {
    console.log("broadcasting on btc..");

    const btcClawbackTransactionHex = results?.response?.response?.btcClawbackTransaction;
    const btcTxHex = results?.response?.response?.btcTransaction;
    const txHex = btcTxHex || btcClawbackTransactionHex;

    const btcSignature = results.signatures.btcSignature;
    const signedTx = combineBtcSignature(txHex, btcSignature);

    const broadcastResponse = await fetch(`${Btc_Endpoint}/testnet/api/tx`, {
        method: "POST",
        headers: {
            "Content-Type": "text/plain",
        },
        body: signedTx,
    });

    const txid = await broadcastResponse.text();
    console.log(`transaction broadcast successfully. tx: ${Btc_Endpoint}/testnet/tx/${txid}`);
}

async function broadcastEVMTransaction(results: any, chainProvider: any) {
    console.log("broadcasting on evm..");
    
    const evmSignature = results.signatures.evmSignature;
    const evmTx = results?.response?.response?.evmTransaction;
    const evmClawbackTx = results?.response?.response?.evmClawbackTransaction;
    const resultTx = evmTx || evmClawbackTx;

    const encodedSignature = ethers.utils.joinSignature({
        v: evmSignature.recid,
        r: `0x${evmSignature.r}`,
        s: `0x${evmSignature.s}`,
    });

    const tx = await chainProvider.sendTransaction(
        ethers.utils.serializeTransaction(resultTx, encodedSignature)
    );
    const receipt = await tx.wait();
    const blockExplorer = LIT_CHAINS[swapObject.evmChain].blockExplorerUrls[0];

    console.log(`transaction broadcast successfully. tx: ${blockExplorer}/tx/${receipt.transactionHash}`);
}

export async function getFundsStatusPKP(_mintedPKP: Pkp) {
    _mintedPKP ? null : (_mintedPKP = mintedPKP);
    console.log("checking balances on pkp..");

    const pkpBtcAddress = generateBtcAddressP2PKH(_mintedPKP.publicKey);
    const utxoResponse = await axios.get(
        `${Btc_Endpoint}/testnet/api/address/${pkpBtcAddress}/utxo`
    );

    const chainProvider = new ethers.providers.JsonRpcProvider(
        LIT_CHAINS[swapObject.evmChain].rpcUrls[0]
    );

    const balance = await chainProvider.getBalance(_mintedPKP.ethAddress);
    const balanceInTokens_EVM = ethers.utils.formatUnits(balance, 18);

    console.log(
        `balance on btc ${pkpBtcAddress}: `,
        utxoResponse?.data[0]?.value
    );
    console.log(
        `balance on evm ${_mintedPKP.ethAddress}: `,
        Number(balanceInTokens_EVM).toFixed(4)
    );
}

// helper functions ----------------------------

async function getEvmWallet() {
    const provider = new ethers.providers.JsonRpcProvider(
        LIT_RPC.CHRONICLE_YELLOWSTONE
    );
    const wallet = new ethers.Wallet(
        process.env.NEXT_PUBLIC_PRIVATE_KEY,
        provider
    );
    return wallet;
}

function combineBtcSignature(rawTxHex: string, btcSignature: any) {
    console.log("converting signature format..");
    let r: any = Buffer.from(btcSignature.r, "hex");
    let s: any = Buffer.from(btcSignature.s, "hex");
    let rBN = new BN(r);
    let sBN = new BN(s);

    if (sBN.cmp(ec.curve.n.divn(2)) === 1) {
        sBN = ec.curve.n.sub(sBN);
    }

    r = rBN.toArrayLike(Buffer, "be", 32);
    s = sBN.toArrayLike(Buffer, "be", 32);

    const ensurePositive = (buffer: Buffer) => {
        if (buffer[0] & 0x80) {
            const newBuffer = Buffer.alloc(buffer.length + 1);
            newBuffer[0] = 0x00;
            buffer.copy(newBuffer, 1);
            return newBuffer;
        }
        return buffer;
    }

    r = ensurePositive(r);
    s = ensurePositive(s);

    let derSignature: any;
    try {
        derSignature = bip66.encode(r, s);
    } catch (error) {
        console.error("Error during DER encoding:", error);
        throw error;
    }

    const tx = bitcoin.Transaction.fromHex(rawTxHex);

    const signatureWithHashType = Buffer.concat([
        derSignature,
        Buffer.from([bitcoin.Transaction.SIGHASH_ALL]),
    ]);

    const scriptSig = bitcoin.script.compile([
        signatureWithHashType,
        Buffer.from(btcSignature.publicKey, "hex"),
    ]);

    tx.setInputScript(0, scriptSig);

    return tx.toHex();
}

async function getAuthSig(_signer: ethers.Wallet) {
    await litNodeClient.connect();

    const toSign = await createSiweMessageWithRecaps({
        uri: "http://localhost:3000",
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        walletAddress: await _signer.getAddress(),
        nonce: await litNodeClient.getLatestBlockhash(),
        litNodeClient,
        // resources: []
    });

    const authSig = await generateAuthSig({
        signer: _signer,
        toSign,
    });
    return authSig;
}

async function uploadViaPinata(_litActionCode: string) {
    const formData = new FormData();

    const file = new File([_litActionCode], "Action.txt", {
        type: "text/plain",
    });
    const pinataMetadata = JSON.stringify({
        name: "EVM-SWAP",
    });
    const pinataOptions = JSON.stringify({
        cidVersion: 0,
    });

    formData.append("file", file);
    formData.append("pinataMetadata", pinataMetadata);
    formData.append("pinataOptions", pinataOptions);

    const key = process.env.NEXT_PUBLIC_PINATA_API;

    const request = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
            },
            body: formData,
        }
    );
    const response = await request.json();
    console.log(response);
    return response.IpfsHash;
}

async function stringToBytes(_string: any) {
    const bytes = `0x${Buffer.from(bs58.decode(_string)).toString("hex")}`;
    return bytes;
}

const getPkpInfoFromMintReceipt = async (txReceipt, litContractsClient) => {
    const pkpMintedEvent = txReceipt.events.find(
        (event) =>
            event.topics[0] ===
            "0x3b2cc0657d0387a736293d66389f78e4c8025e413c7a1ee67b7707d4418c46b8"
    );

    const publicKey = "0x" + pkpMintedEvent.data.slice(130, 260);
    const tokenId = ethers.utils.keccak256(publicKey);
    const ethAddress =
        await litContractsClient.pkpNftContract.read.getEthAddress(tokenId);

    return {
        tokenId: ethers.BigNumber.from(tokenId).toString(),
        publicKey,
        ethAddress,
    };
};

async function sessionSigEOA(_signer: ethers.Wallet, _mintedPKP: Pkp) {
    console.log("creating session sigs..");

    await litNodeClient.connect();

    const sessionSigs = await litNodeClient.getSessionSigs({
        pkpPublicKey: _mintedPKP.publicKey,
        chain: "ethereum",
        resourceAbilityRequests: [
            {
                resource: new LitPKPResource("*"),
                ability: LitAbility.PKPSigning,
            },
            {
                resource: new LitActionResource("*"),
                ability: LitAbility.LitActionExecution,
            },
        ],
        authNeededCallback: async (params) => {
            if (!params.uri) {
                throw new Error("Params uri is required");
            }

            if (!params.resourceAbilityRequests) {
                throw new Error("Params uri is required");
            }

            const toSign = await createSiweMessageWithRecaps({
                uri: params.uri,
                expiration: new Date(
                    Date.now() + 1000 * 60 * 60 * 24
                ).toISOString(), // 24 hours,
                resources: params.resourceAbilityRequests,
                walletAddress: await _signer.getAddress(),
                nonce: await litNodeClient.getLatestBlockhash(),
                litNodeClient,
                domain: "localhost:3000",
            });

            return await generateAuthSig({
                signer: _signer,
                toSign,
            });
        },
    });

    console.log("sessionSigs: ", sessionSigs);
    return sessionSigs;
}
