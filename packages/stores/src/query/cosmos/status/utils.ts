export const convertToEpoch = (isoString: string): number => {
  const date = new Date(isoString);
  return Math.floor(date.getTime() / 1000);
};
