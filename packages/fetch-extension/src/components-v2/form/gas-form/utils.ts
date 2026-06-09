import { HttpBatchClient, Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { QueryClient, createProtobufRpcClient } from "@cosmjs/stargate";
import { ServiceClientImpl } from "cosmjs-types/cosmos/base/node/v1beta1/query";

export async function getMinimumGasPrice(
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
    if (minimumGasPrice) {
      return minimumGasPrice.replace(/[a-zA-Z].*/, "");
    }

    return fallbackGasPrice;
  } catch {
    return fallbackGasPrice;
  } finally {
    tmClient?.disconnect();
  }
}
