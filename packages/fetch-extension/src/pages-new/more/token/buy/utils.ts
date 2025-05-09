import crypto from "crypto";

export const generateSignature = (url: string, secretKey: string) => {
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(new URL(url).search) // Use the query string part of the URL
    .digest("base64"); // Convert the result to a base64 string
  return signature; // Return the signature
};

export const getCurrencyCodeForMoonpay = (coinDenom: string | undefined) => {
  if (!coinDenom) {
    return undefined;
  }

  switch (coinDenom) {
    case "DYDX":
      return "dydx_dydx";
    case "INJ":
      return "inj_inj";
    default:
      return coinDenom.toLowerCase();
  }
};
