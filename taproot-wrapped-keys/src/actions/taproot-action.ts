bitcoin.initEccLib(ecc);

const signTaprootTransaction = async (
    PRIVATE_KEY: string,
    TRANSACTION_HEX: string,
    SIGHASH: string,
    BROADCAST: boolean
) => {
    if (PRIVATE_KEY.startsWith("0x") || PRIVATE_KEY.startsWith("0X")) {
        PRIVATE_KEY = PRIVATE_KEY.slice(2);
    }
    console.log("🔄 Signing the transaction");
    const TRANSACTION = bitcoin.Transaction.fromHex(TRANSACTION_HEX);

    const hashBuffer = Buffer.from(SIGHASH, "hex");
    const signature = Buffer.from(
        signSchnorr(hashBuffer, Buffer.from(PRIVATE_KEY, "hex"))
    );
    TRANSACTION.setWitness(0, [signature]);
    console.log("✅ Taproot transaction signed");

    console.log("🔄 Broadcasting transaction...");
    const signedTx = TRANSACTION.toHex();
    console.log("signedTx: ", signedTx);

    let response = `signedTx: ${signedTx}`;

    if (BROADCAST == true) {
        const broadcastResponse = await fetch(`${BTC_ENDPOINT}/api/tx`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: signedTx,
        });
        const txid = await broadcastResponse.text();
        console.log(
            `✅ Transaction broadcast successfully. TXID: ${BTC_ENDPOINT}/tx/${txid}`
        );
        response = `txid: ${txid}`;
    }
    return response;
};

function getFirstSessionSig(pkpSessionSigs: any) {
    const sessionSigsEntries = Object.entries(pkpSessionSigs);

    if (sessionSigsEntries.length === 0) {
        throw new Error(
            `Invalid pkpSessionSigs, length zero: ${JSON.stringify(
                pkpSessionSigs
            )}`
        );
    }

    const [[, sessionSig]] = sessionSigsEntries;

    return sessionSig;
}
function getPkpAddressFromSessionSig(pkpSessionSig: any) {
    const sessionSignedMessage = JSON.parse(pkpSessionSig.signedMessage);
    const capabilities = sessionSignedMessage.capabilities;

    if (!capabilities || capabilities.length === 0) {
        throw new Error(
            `Capabilities in the session's signedMessage is empty, but required.`
        );
    }
    const delegationAuthSig = capabilities.find(
        (capability: { algo: string }) => capability.algo === "LIT_BLS"
    );
    if (!delegationAuthSig) {
        throw new Error(
            "SessionSig is not from a PKP; no LIT_BLS capabilities found"
        );
    }
    const pkpAddress = delegationAuthSig.address;
    console.log(`pkpAddress to permit decryption: ${pkpAddress}`);

    return pkpAddress;
}

function getPkpAccessControlCondition(pkpAddress: string) {
    if (!ethers.utils.isAddress(pkpAddress)) {
        throw new Error(
            `pkpAddress is not a valid Ethereum Address: ${pkpAddress}`
        );
    }

    return {
        contractAddress: "",
        standardContractType: "",
        chain: "ethereum",
        method: "",
        parameters: [":userAddress"],
        returnValueTest: {
            comparator: "=",
            value: pkpAddress,
        },
    };
}

/**
 * Main execution function that handles Taproot wallet creation and transaction signing through a PKP
 * @async
 * @function go
 */

/**
 * Creates a new wallet and encrypts it within the action
 * @async
 * @method createWallet
 * @param {string} method - Should be "createWallet"
 * @param {Object} pkpSessionSigs - Session signatures for PKP authentication
 * @returns {Object} Object containing:
 *   - publicKey: The wallet's public key
 *   - ciphertext: The encrypted wallet data
 *   - dataToEncryptHash: Hash of the encrypted data
 */

/**
 * Signs a taproot transaction
 * @async
 * @method signTaprootTxn
 * @param {string} method - Should be "signTaprootTxn"
 * @param {Object} pkpSessionSigs - Session signatures for PKP authentication
 * @param {string} ciphertext - The encrypted wallet data
 * @param {string} dataToEncryptHash - Hash of the encrypted data
 * @param {string} transactionHex - Transaction data in hexadecimal format
 * @param {string} sigHash - Signature hash type
 * @param {boolean} broadcast - Whether to broadcast the transaction
 * @returns {Object} Decrypted data response
 */
const go = async () => {
    try {
        const LIT_PREFIX = "lit_";
        if (method === "createWallet") {
            const sessionSig = getFirstSessionSig(pkpSessionSigs);
            const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
            const ACC = getPkpAccessControlCondition(pkpAddress);
            const result = await Lit.Actions.runOnce(
                { waitForResponse: true, name: "encryptedPrivateKey" },
                async () => {
                    const wallet = ethers.Wallet.createRandom();
                    const publicKey = wallet.publicKey;
                    const privateKey = wallet.privateKey;
                    const { ciphertext, dataToEncryptHash } =
                        await Lit.Actions.encrypt({
                            accessControlConditions: [ACC],
                            to_encrypt: new TextEncoder().encode(
                                `${LIT_PREFIX}${privateKey}`
                            ),
                        });
                    return JSON.stringify({
                        ciphertext,
                        dataToEncryptHash,
                        publicKey: publicKey.toString(),
                    });
                }
            );

            Lit.Actions.setResponse({ response: result });
        } else if (method === "signTaprootTxn") {
            const sessionSig = getFirstSessionSig(pkpSessionSigs);
            const pkpAddress = getPkpAddressFromSessionSig(sessionSig);
            const ACC = getPkpAccessControlCondition(pkpAddress);

            let decryptedPrivateKey;
            decryptedPrivateKey = await Lit.Actions.decryptAndCombine({
                accessControlConditions: [ACC],
                ciphertext: ciphertext,
                dataToEncryptHash: dataToEncryptHash,
                authSig: null,
                chain: "ethereum",
            });
            if (!decryptedPrivateKey) {
                console.log("decryptedPrivateKey is empty");
                return; // Exit the nodes which don't have the decryptedData
            }

            const privateKey = decryptedPrivateKey.startsWith(LIT_PREFIX)
                ? decryptedPrivateKey.slice(LIT_PREFIX.length)
                : decryptedPrivateKey;

            const response = await signTaprootTransaction(
                privateKey,
                transactionHex,
                sigHash,
                broadcast
            );
            Lit.Actions.setResponse({
                response: response,
            });
        }
    } catch (error: any) {
        Lit.Actions.setResponse({ response: error.message });
    }
};
go();
