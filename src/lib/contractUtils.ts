import {
  arcPredictionMarketV3Abi,
  arcPredictionMarketV4Abi
} from "../contracts/arcPredictionMarketAbi";
import { arcPredictionMarketV5Abi } from "../contracts/arcPredictionMarketV5Abi";
import type { MarketContractVersion } from "../types";

export function stablecoinMarketAbi(version: MarketContractVersion) {
  if (version === "v5") return arcPredictionMarketV5Abi;
  return version === "v4" ? arcPredictionMarketV4Abi : arcPredictionMarketV3Abi;
}
