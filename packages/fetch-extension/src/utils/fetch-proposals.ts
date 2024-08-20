import axios from "axios";
import { CHAIN_ID_ERIDANUS } from "../config.ui.var";
export const fetchProposals = async (chainId: string) => {
  if (chainId === "fetchhub-4")
    return await axios
      .get("https://rest-fetchhub.fetch.ai/cosmos/gov/v1beta1/proposals")
      .then((response) => response.data)
      .catch((e) => console.log(e));

  if (chainId === CHAIN_ID_ERIDANUS)
    return await axios
      .get("https://rest-eridanus-1.fetch.ai/cosmos/gov/v1beta1/proposals")
      .then((response) => response.data)
      .catch((e) => console.log(e));

  if (chainId === "test-local")
    return await axios
      .get("http://localhost:1317/cosmos/gov/v1beta1/proposals")
      .then((response) => response.data)
      .catch((e) => console.log(e));

  if (chainId === "test")
    return await axios
      .get("http://34.34.58.246:1317/cosmos/gov/v1beta1/proposals")
      .then((response) => response.data)
      .catch((e) => console.log(e));

  return await axios
    .get("https://rest-dorado.fetch.ai/cosmos/gov/v1beta1/proposals")
    .then((response) => response.data)
    .catch((e) => console.log(e));
};

export const fetchVote = async (
  proposalId: string,
  address: string,
  url: string
) => {
  const response = await axios.get(
    `${url}/cosmos/gov/v1beta1/proposals/${proposalId}/votes/${address}`
  );
  return response.data;
};
