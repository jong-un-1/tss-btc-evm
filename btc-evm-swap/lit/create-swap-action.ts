import { ethers } from 'ethers';

// raw lit action ----------------------------

const rawLitAction = `
const evmConditions = {{evmConditions}};
const originTime = {{originTime}};
const deadlineDays = {{deadlineDays}};
const btcSwapValue = {{btcSwapValue}}
let evmTransaction = {{evmTransaction}};
let evmClawbackTransaction = {{evmClawbackTransaction}};

evmTransaction.from = evmClawbackTransaction.from = pkpAddress;
evmConditions.parameters = [pkpAddress];
evmTransaction = { ...evmTransaction, ...evmGasConfig };
evmClawbackTransaction = { ...evmClawbackTransaction, ...evmGasConfig };

const hashTransaction = (tx) => {
    return ethers.utils.arrayify(
        ethers.utils.keccak256(
            ethers.utils.arrayify(ethers.utils.serializeTransaction(tx))
        )
    );
};

function checkHasDeadlinePassed() {
    const currentTime = Date.now();
    const deadline = originTime + (deadlineDays * 24 * 60 * 60);
    return currentTime <= deadline ? true : false;
}

async function validateUtxo() {
    try {
        const utxoResponse = await fetch(
            \`\${BTC_ENDPOINT}\/testnet/api/address/\${pkpBtcAddress}\/utxo\`
        );
        const fetchUtxo = await utxoResponse.json();
        if (fetchUtxo.length === 0) {
            return false;
        }
        const utxoToSpend = fetchUtxo[0];
        if (utxoToSpend.value < btcSwapValue) {
            return false;
        }
        if (
            utxoToSpend.txid !== passedFirstUtxo.txid ||
            utxoToSpend.vout !== passedFirstUtxo.vout
        ) {
            return false;
        }
        return true;
    } catch (e) {
        throw new Error(\`Could not validate UTXO: \${e}\`);
    }
}

async function go() {    
    const evmConditionsPass = await Lit.Actions.checkConditions({
        conditions: [evmConditions],
        authSig,
        chain: evmConditions.chain,
    });        
    if (typeof BTC_ENDPOINT === 'undefined') {
        if(evmConditionsPass) {
            await Lit.Actions.signEcdsa({
                toSign: hashTransaction(evmClawbackTransaction),
                publicKey: pkpPublicKey,
                sigName: "evmSignature",
            });
            Lit.Actions.setResponse({
                response: JSON.stringify({ evmClawbackTransaction: evmClawbackTransaction }),
            });
        } else {
            Lit.Actions.setResponse({
                response: JSON.stringify({ error: "Swap conditions not met!" }),
            });
        }
        return;
    }
    try { 
        let response = {};
        const btcConditionPass = await validateUtxo();
        const deadlinePassed = await checkHasDeadlinePassed();
        response = {...response, evmConditionsPass, btcConditionPass, deadlinePassed};

        if (btcConditionPass) {
            if (evmConditionsPass) {
                await Lit.Actions.signEcdsa({
                    toSign: hashTransaction(evmTransaction),
                    publicKey: pkpPublicKey,
                    sigName: "evmSignature",
                });
                await Lit.Actions.signEcdsa({
                    toSign: successHash,
                    publicKey: pkpPublicKey,
                    sigName: "btcSignature",
                });
                response = {
                    ...response,
                    evmTransaction,
                    btcTransaction: successTxHex,
                };
            } else if (deadlinePassed()) {
                await Lit.Actions.signEcdsa({
                    toSign: clawbackHash,
                    publicKey: pkpPublicKey,
                    sigName: "btcSignature",
                });
                await Lit.Actions.signEcdsa({
                    toSign: hashTransaction(evmClawbackTransaction),
                    publicKey: pkpPublicKey,
                    sigName: "evmSignature",
                });
                response = {
                    ...response,
                    evmClawbackTransaction,
                    btcClawbackTransaction: clawbackTxHex,
                };
            } else {
                await Lit.Actions.signEcdsa({
                    toSign: clawbackHash,
                    publicKey: pkpPublicKey,
                    sigName: "btcSignature",
                });
                response = {
                    ...response,
                    btcClawbackTransaction: clawbackTxHex,
                };

            }
        } else if (evmConditionsPass) {
            await Lit.Actions.signEcdsa({
                toSign: hashTransaction(evmClawbackTransaction),
                publicKey: pkpPublicKey,
                sigName: "evmSignature",
            });
            response = {
                ...response,
                evmClawbackTransaction: evmClawbackTransaction,
            };
        } else {
            response = {
                ...response,
                error: "Swap conditions not met!",
            };
        }

        Lit.Actions.setResponse({
            response: JSON.stringify({ response }),
        });
    } catch (err) {
        Lit.Actions.setResponse({
            response: JSON.stringify({ error: err.message }),
        });
    }
}

go();
`

// primary functions ----------------------------

export async function generateBtcEthSwapLitActionCode(swapObject) {
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
    const unsignedEvmTransaction = generateUnsignedEVMNativeTransaction({
        toAddress: swapObject.evmA,
        amount: swapObject.evmAmount,
        chainId: swapObject.chainId,
    });

    const unsignedEvmClawbackTransaction = generateUnsignedEVMNativeTransaction(
        {
            toAddress: swapObject.evmB,
            amount: swapObject.evmAmount,
            chainId: swapObject.chainId,
        }
    );

    const variablesToReplace = {
        originTime: originTime,
        deadlineDays: swapObject.expirationDays,
        btcSwapValue: swapObject.btcSats,
        evmConditions: JSON.stringify(evmConditions),
        evmTransaction: JSON.stringify(unsignedEvmTransaction),
        evmClawbackTransaction: JSON.stringify(unsignedEvmClawbackTransaction),
    };

    try {
        let result = rawLitAction;
        for (const key in variablesToReplace) {
            if (Object.prototype.hasOwnProperty.call(variablesToReplace, key)) {
                const placeholder = `{{${key}}}`;
                const value = variablesToReplace[key];
                result = result.split(placeholder).join(value);
            }
        }

        return result;
    } catch (err) {
        console.log(`Error processing Lit action code: ${err}`);
        return "";
    }

}

function generateUnsignedEVMNativeTransaction({
    toAddress,
    amount,
    chainId
}) {
    return {
        to: toAddress,
        chainId: chainId,
        from: "{{pkpPublicKey}}",
        value: ethers.utils.parseEther(amount).toString(),
        type: 2,
    };
}

