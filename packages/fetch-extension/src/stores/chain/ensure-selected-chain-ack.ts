export async function ensureSelectedChainAck(
  sendSelectSelectedChain: (
    chainId: string
  ) => PromiseLike<{ chainId: string; revision: number }>,
  chainId: string
): Promise<{ chainId: string; revision: number }> {
  return await sendSelectSelectedChain(chainId);
}
