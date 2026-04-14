import { useQuery } from "@tanstack/react-query";
import { useStore } from "../../stores";
import { isValidBech32Address } from "./utils";

export const useAccountQuery = (
  address: string,
  options?: {
    enabled?: boolean;
  }
) => {
  const { chainStore, queriesStore } = useStore();

  const chainId = chainStore.current.chainId;
  const bech32Prefix = chainStore.current.bech32Config.bech32PrefixAccAddr;

  const queries = queriesStore.get(chainId);

  const enabled =
    !!address &&
    isValidBech32Address(address, bech32Prefix) &&
    options?.enabled;

  return useQuery({
    queryKey: ["account", chainId, address],
    queryFn: async () => {
      const accountData = await queries.cosmos.queryAccount
        .getQueryBech32Address(address)
        .waitFreshResponse();
      return accountData?.data ? accountData.data : null;
    },
    enabled,
    staleTime: 0,
  });
};
