"use client";
import { useState } from "react";
import {
    createLitAction,
    mintGrantBurnPKP,
    generateBtcAddressP2PKH,
    getFundsStatusPKP,
    runLitAction,
} from "../lit/index";

export default function Home() {
    const [ipfsId, setIpfsId] = useState(null);
    const [pkp, setPkp] = useState(null);
    const [btc, setBtc] = useState(null);

    return (
        <div className="flex flex-col items-center gap-[1.2rem]">
            <h1 className="mb-[1.5rem] mt-[0.8rem]">
                LIT EVM-EVM Bridge Demo (Open Console)
            </h1>
            <p>IPFS Id, {ipfsId}</p>
            <p>PKP Address, {pkp?.ethAddress}</p>
            <p className="mb-[1.5rem]">BTC Address, {btc}</p>
            <button onClick={async () => setIpfsId(await createLitAction())}>Generate Lit Action</button>
            <button onClick={async () => setPkp(await mintGrantBurnPKP(ipfsId))}>Mint Grant Burn PKP</button>
            <button
                className="mb-[1.5rem]"
                onClick={() => runLitAction(ipfsId, pkp)}
            >
                Run Lit Action
            </button>
            <button onClick={() => setBtc(generateBtcAddressP2PKH(pkp?.publicKey))}>
                Get BTC Address for PKP
            </button>
            <button onClick={async () => await  getFundsStatusPKP(pkp)}>Funds Status on PKP</button>
        </div>
    );
}
