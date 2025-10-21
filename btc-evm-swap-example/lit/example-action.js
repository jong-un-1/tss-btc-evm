const evmConditions = {"contractAddress":"","standardContractType":"","chain":"yellowstone","method":"eth_getBalance","parameters":["address"],"returnValueTest":{"comparator":">=","value":"10000000000000000"}};
const originTime = 1727704910440;
const deadlineDays = 4;
const btcSwapValue = 1000
let evmTransaction = {"to":"0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB","chainId":175188,"from":"{{pkpPublicKey}}","value":"10000000000000000","type":2};
let evmClawbackTransaction = {"to":"0x48e6a467852Fa29710AaaCDB275F85db4Fa420eB","chainId":175188,"from":"{{pkpPublicKey}}","value":"10000000000000000","type":2};

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
            `${BTC_ENDPOINT}/testnet/api/address/${pkpBtcAddress}/utxo`
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
        throw new Error(`Could not validate UTXO: ${e}`);
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