import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { ECPairFactory } from "ecpair";
import { ethers } from "ethers";
import { LIT_ABILITY, LIT_RPC } from "@lit-protocol/constants";
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitActionResource, LitPKPResource } from "@lit-protocol/auth-helpers";
import { getEnv, createPkp } from "../src/utils";
import fs from "fs";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const BTC_ENDPOINT = getEnv("BTC_ENDPOINT");

const PKP_PUBLIC_KEY = getEnv("PKP_PUBLIC_KEY");
const LIT_ACTION = fs.readFileSync("./actions/taproot-action.js");

const action = process.argv[2];
if (action === "create-wallet") {
    createWallet();
} else if (action === "create-sign-txn") {
    createAndSignTxn();
} else if (action === "create-pkp") {
    createPkp();
} else {
    console.log("Please specify an action: create-wallet or create-sign-txn or create-pkp");
}

async function createWallet() {
    let params = {
        method: "createWallet",
    };
    const response = await executeJsHandler(PKP_PUBLIC_KEY, params);

    // @ts-ignore
    const parsedResponse = JSON.parse(response?.response);

    const publicKey = parsedResponse.publicKey;
    const ciphertext = parsedResponse.ciphertext;
    const dataHash = parsedResponse.dataToEncryptHash;

    console.log("Public Key:", publicKey);
    console.log("Ciphertext:", ciphertext);
    console.log("Data Hash:", dataHash);
}

async function createAndSignTxn() {
    const wkPublicKey = getEnv("WK_PUBLIC_KEY");
    const destinationAddress = getEnv("DESTINATION_ADDRESS");
    const amountToSend = Number(getEnv("AMOUNT_TO_SEND"));
    const fee = Number(getEnv("FEE"));
    const NETWORK =
        getEnv("NETWORK") === "mainnet"
            ? bitcoin.networks.bitcoin
            : bitcoin.networks.testnet;

    const txnResponse = await createTaprootTxn(
        wkPublicKey,
        destinationAddress,
        amountToSend,
        fee,
        NETWORK
    );
    console.log("Transactions Response: ", txnResponse);

    const ciphertext = getEnv("CIPHERTEXT");
    const dataToEncryptHash = getEnv("DATA_TO_ENCRYPT_HASH");
    const broadcast = Boolean(getEnv("BROADCAST"));

    const signResponse = await obtainSignature(
        ciphertext,
        dataToEncryptHash,
        txnResponse.Transaction,
        txnResponse.SigHash,
        broadcast
    );
    console.log("Signature Response: ", signResponse);
}

async function createTaprootTxn(
    senderPublicKey: string,
    destinationAddress: string,
    amountToSend: number,
    fee: number,
    network: any
) {
    console.log("🔄 Deriving a BTC Taproot Address from the Public Key...");
    if (senderPublicKey.startsWith("0x") || senderPublicKey.startsWith("0X")) {
        senderPublicKey = senderPublicKey.slice(2);
    }
    const keyPair = ECPair.fromPublicKey(Buffer.from(senderPublicKey, "hex"));
    const pubKey = keyPair.publicKey;
    const xOnlyPubKey = pubKey.slice(1);

    const { address, output } = bitcoin.payments.p2tr({
        pubkey: Buffer.from(xOnlyPubKey),
        network: network,
    });

    const senderAddress = address!;
    console.log("PKP Taproot Address derived: ", address);

    console.log("🔄 Fetching UTXO information...");
    const utxos = await fetch(
        `${BTC_ENDPOINT}/api/address/${senderAddress}/utxo`
    ).then((r) => r.json());
    if (!utxos.length) throw new Error("No UTXOs found");
    console.log("✅ UTXO information fetched");

    console.log("🔄 Creating new Taproot transaction...");
    const tx = new bitcoin.Transaction();
    tx.version = 2;
    tx.addInput(Buffer.from(utxos[0].txid, "hex").reverse(), utxos[0].vout);

    const sendAmount = amountToSend - fee;
    tx.addOutput(
        bitcoin.address.toOutputScript(destinationAddress, network),
        sendAmount
    );

    const hash = tx.hashForWitnessV1(
        0,
        [output!],
        [utxos[0].value],
        bitcoin.Transaction.SIGHASH_DEFAULT
    );
    console.log("✅ Taproot transaction created");
    return { Transaction: tx.toHex(), SigHash: hash.toString("hex") };
}

async function obtainSignature(
    ciphertext: string,
    dataToEncryptHash: string,
    transactionHex: string,
    sigHash: string,
    broadcast: boolean
) {
    let params = {
        method: "signTaprootTxn",
        ciphertext,
        dataToEncryptHash,
        transactionHex,
        sigHash,
        broadcast,
        BTC_ENDPOINT,
    };
    const response = await executeJsHandler(PKP_PUBLIC_KEY, params);
    return response;
}

async function executeJsHandler(pkpPublicKey: string, params: Object) {
    const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");
    const litNodeClient = new LitNodeClient({
        litNetwork: "datil-dev",
        debug: false,
    });

    try {
        await litNodeClient.connect();

        const ethersWallet = new ethers.Wallet(
            ETHEREUM_PRIVATE_KEY,
            new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
        );

        const authMethod = await EthWalletProvider.authenticate({
            signer: ethersWallet,
            litNodeClient: litNodeClient,
        });

        const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
            pkpPublicKey: pkpPublicKey,
            chain: "ethereum",
            authMethods: [authMethod],
            resourceAbilityRequests: [
                {
                    resource: new LitActionResource("*"),
                    ability: LIT_ABILITY.LitActionExecution,
                },
                {
                    resource: new LitPKPResource("*"),
                    ability: LIT_ABILITY.PKPSigning,
                },
            ],
            expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
        });

        const response = await litNodeClient.executeJs({
            sessionSigs: pkpSessionSigs,
            code: LIT_ACTION.toString(),
            jsParams: {
                ...params,
                pkpSessionSigs,
            },
        });

        return response;
    } catch (error) {
        console.log("Error: ", error);
    } finally {
        await litNodeClient?.disconnect();
    }
}
