export async function ensureSelectedChainAck(
  sendSetSelectedChain: (chainId: string) => Promise<unknown>,
  chainId: string
): Promise<void> {
  await sendSetSelectedChain(chainId);
}
