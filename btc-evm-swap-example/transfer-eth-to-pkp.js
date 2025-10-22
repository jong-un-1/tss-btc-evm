const { ethers } = require("ethers");

async function transferEthToPKP() {
    // Chronicle Yellowstone RPC
    const provider = new ethers.providers.JsonRpcProvider(
        "https://yellowstone-rpc.litprotocol.com"
    );

    // 你的钱包 - 直接使用私钥
    const privateKey = "0xf0275f717f2da1f21161506ff8f39909bd854cb2b597db69a482fe16c35f3bb8";
    const wallet = new ethers.Wallet(
        privateKey,
        provider
    );

    // PKP 地址 - 更新为新的地址
    const pkpAddress = "0x69BB1b09241242E157Fb41C85A06EB488263C4c7";

    console.log("From address:", wallet.address);
    console.log("To address:", pkpAddress);

    // 检查余额
    const balance = await wallet.getBalance();
    console.log("Your balance:", ethers.utils.formatEther(balance), "ETH");

    // 转账金额 (0.1 ETH，足够测试使用)
    const amountToSend = ethers.utils.parseEther("0.1");

    console.log("\nSending 0.1 ETH to PKP address...");

    try {
        const tx = await wallet.sendTransaction({
            to: pkpAddress,
            value: amountToSend,
        });

        console.log("Transaction hash:", tx.hash);
        console.log("Waiting for confirmation...");

        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed!");
        console.log("Block number:", receipt.blockNumber);

        // 检查 PKP 新余额
        const pkpBalance = await provider.getBalance(pkpAddress);
        console.log("\nPKP new balance:", ethers.utils.formatEther(pkpBalance), "ETH");
    } catch (error) {
        console.error("❌ Transfer failed:", error.message);
    }
}

transferEthToPKP();
