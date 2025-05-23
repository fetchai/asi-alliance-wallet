import { MoonpayApiKey } from "../config.ui";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

export const useMoonpayCurrency = (enabled = true) => {
  return useQuery({
    queryKey: ["currencies"],
    queryFn: async () => {
      const API_KEY = MoonpayApiKey;
      const { data } = await axios.get(
        `https://api.moonpay.com/v3/currencies?apiKey=${API_KEY}`
      );
      return data;
    },
    staleTime: Infinity,
    enabled,
  });
};
