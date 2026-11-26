import moment from "moment";

export function formatTimestamp(timestamp: number, duration: string): string {
  const date = new Date(timestamp);

  let options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };

  switch (duration) {
    default:
    case "1":
    case "7":
      options = {
        hour: "numeric",
        minute: "numeric",
        month: "short",
        day: "numeric",
      };
      break;

    case "30":
    case "90":
    case "365":
      options = {
        month: "short",
        day: "numeric",
        year: "numeric",
      };
      break;
  }

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export const convertEpochToDate = (
  epochTime: number,
  formatType: string = "DD-MMM-YYYY"
) => {
  const date = new Date(epochTime * 1000); // Multiply by 1000 to convert seconds to milliseconds
  return moment(date).format(formatType);
};
