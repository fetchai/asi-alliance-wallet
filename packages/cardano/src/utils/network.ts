
export function getCardanoNetworkFromChainId(chainId: string): 'mainnet' | 'testnet' {
  switch (chainId) {
    case 'cardano-mainnet':
      return 'mainnet';
    case 'cardano-preview':
    case 'cardano-preprod':
    case 'cardano-sanchonet':
      return 'testnet';
    default:

      return 'mainnet';
  }
}


export async function getCardanoChainIdFromNetwork(network: 'mainnet' | 'testnet') {
  const { Cardano } = await import('@cardano-sdk/core');
  
  return network === 'mainnet' 
    ? Cardano.ChainIds.Mainnet 
    : Cardano.ChainIds.Preview;
}


export function isCardanoChainId(chainId: string): boolean {
  return chainId.startsWith('cardano-');
}
