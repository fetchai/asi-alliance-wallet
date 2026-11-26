import React from "react";

export const StatusButton = ({
  title,
  status,
}: {
  title: string;
  status: "Success" | "Pending" | "Active" | "Failed";
}) => {
  const backgroundColor = (status: string) => {
    switch (status) {
      case "Success":
        return "rgba(45, 227, 118, 1)";

      case "Pending":
        return "rgba(237, 195, 44, 1)";

      case "Active":
        return "rgba(255, 255, 255, 1)";

      case "Failed":
        return "rgba(240, 70, 70, 1)";

      default:
        return "rgba(255, 255, 255, 1)";
    }
  };

  return (
    <div
      style={{
        background: backgroundColor(status),
        height: "31px",
        width: "fit-content",
        padding: "6px 12px",
        borderRadius: "8px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color:
          status === "Failed" ? "rgba(255, 255, 255, 1)" : "rgba(0, 13, 61, 1)",
        fontSize: "12px",
        fontWeight: 400,
      }}
    >
      {title}
    </div>
  );
};
