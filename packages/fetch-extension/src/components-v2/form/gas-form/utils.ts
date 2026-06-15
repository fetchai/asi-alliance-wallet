import { HttpBatchClient, Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient, createProtobufRpcClient } from "@cosmjs/stargate";
import { ServiceClientImpl } from "cosmjs-types/cosmos/base/node/v1beta1/query";

async function getEvmMinimumGasPrice(
  rpcUrl: string,
  fallbackGasPrice: string
): Promise<string> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_gasPrice",
        params: [],
        id: 1,
      }),
    });
    const data = await response.json();
    return data?.result ? String(parseInt(data.result, 16)) : fallbackGasPrice;
  } catch {
    return fallbackGasPrice;
  }
}

async function getCosmosMinimumGasPrice(
  rpcUrl: string,
  fallbackGasPrice: string
): Promise<string> {
  let tmClient;
  try {
    const httpClient = new HttpBatchClient(rpcUrl);
    tmClient = await Tendermint37Client.create(httpClient);

    const queryClient = new QueryClient(tmClient as any);
    const rpcClient = createProtobufRpcClient(queryClient);
    const nodeService = new ServiceClientImpl(rpcClient);

    const { minimumGasPrice } = await nodeService.Config({});
    return minimumGasPrice
      ? minimumGasPrice.replace(/[a-zA-Z].*/, "")
      : fallbackGasPrice;
  } catch {
    return fallbackGasPrice;
  } finally {
    tmClient?.disconnect();
  }
}

export async function getMinimumGasPrice(
  rpcUrl: string,
  fallbackGasPrice: string,
  isEvm = false
): Promise<string> {
  return isEvm
    ? getEvmMinimumGasPrice(rpcUrl, fallbackGasPrice)
    : getCosmosMinimumGasPrice(rpcUrl, fallbackGasPrice);
}
