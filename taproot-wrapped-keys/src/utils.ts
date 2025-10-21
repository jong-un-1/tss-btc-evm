import { LitContracts } from "@lit-protocol/contracts-sdk";
import * as ethers from "ethers";
import { LIT_RPC } from "@lit-protocol/constants";
import "dotenv/config";

export const getEnv = (name: string): string => {
    const env = process.env[name];
    if (env === undefined || env === "")
        throw new Error(
            `${name} ENV is not defined, please define it in the .env file`
        );
    return env.replace('"', "");
};

export const createPkp = async () => {
    const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");
    const ethersWallet = new ethers.Wallet(
        ETHEREUM_PRIVATE_KEY,
        new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );

    const litContracts = new LitContracts({
        signer: ethersWallet,
        network: "datil-dev",
        debug: false,
    });
    await litContracts.connect();

    const pkp = (await litContracts.pkpNftContractUtils.write.mint()).pkp;

    console.log(pkp);
    return pkp;
};
