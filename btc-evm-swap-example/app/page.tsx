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

    const buttonStyle = "px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 min-w-[280px]";
    const infoStyle = "text-lg font-mono bg-gray-100 px-4 py-2 rounded border border-gray-300";

    return (
        <div className="flex flex-col items-center gap-6 p-8 min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <h1 className="text-4xl font-bold mb-8 mt-4 text-gray-800 text-center">
                🔗 BTC ↔ EVM Cross-Chain Swap
            </h1>
            <p className="text-sm text-gray-600 mb-4">Open Console (F12) to see detailed logs</p>
            
            <div className="flex flex-col gap-4 w-full max-w-2xl bg-white p-6 rounded-xl shadow-lg">
                <div className="mb-4">
                    <h3 className="text-xl font-semibold mb-4 text-gray-700">📋 Status Information</h3>
                    <div className="space-y-2">
                        <div>
                            <span className="font-semibold text-gray-600">IPFS ID:</span>
                            <p className={ipfsId ? infoStyle : "text-gray-400 italic"}>
                                {ipfsId || "Not generated yet"}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-gray-600">PKP Address:</span>
                            <p className={pkp?.ethAddress ? infoStyle : "text-gray-400 italic"}>
                                {pkp?.ethAddress || "Not minted yet"}
                            </p>
                        </div>
                        <div>
                            <span className="font-semibold text-gray-600">BTC Address:</span>
                            <p className={btc ? infoStyle : "text-gray-400 italic"}>
                                {btc || "Not generated yet"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="border-t pt-6">
                    <h3 className="text-xl font-semibold mb-4 text-gray-700">🚀 Actions</h3>
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={async () => setIpfsId(await createLitAction())}
                            className={buttonStyle}
                        >
                            1️⃣ Generate Lit Action
                        </button>
                        <button 
                            onClick={async () => setPkp(await mintGrantBurnPKP(ipfsId))}
                            className={buttonStyle}
                            disabled={!ipfsId}
                        >
                            2️⃣ Mint Grant Burn PKP
                        </button>
                        <button 
                            onClick={() => setBtc(generateBtcAddressP2PKH(pkp?.publicKey))}
                            className={buttonStyle}
                            disabled={!pkp}
                        >
                            3️⃣ Get BTC Address for PKP
                        </button>
                        <button 
                            onClick={async () => await getFundsStatusPKP(pkp)}
                            className={buttonStyle}
                            disabled={!pkp}
                        >
                            4️⃣ Funds Status on PKP
                        </button>
                        <button
                            onClick={() => runLitAction(ipfsId, pkp)}
                            className={`${buttonStyle} bg-green-600 hover:bg-green-700`}
                            disabled={!ipfsId || !pkp}
                        >
                            5️⃣ Run Lit Action (Execute Swap)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
