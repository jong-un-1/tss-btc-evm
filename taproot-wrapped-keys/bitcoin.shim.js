import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { signSchnorr } from "@bitcoinerlab/secp256k1";

globalThis.bitcoin = bitcoin;
globalThis.ecc = ecc;
globalThis.signSchnorr = signSchnorr;
