import React from "react";
import { useNavigate } from "react-router";
import type { BlockfrostLimitPresentation } from "@keplr-wallet/background";
import { getBlockfrostLimitBannerMessage } from "../../utils/cardano-blockfrost";

const bannerStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  marginBottom: "8px",
  background: "rgba(255, 193, 7, 0.1)",
  border: "1px solid rgba(255, 193, 7, 0.3)",
  borderRadius: "8px",
  fontSize: "14px",
  color: "#ffc107",
};

const ctaButtonStyle: React.CSSProperties = {
  marginTop: "10px",
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid rgba(255, 193, 7, 0.5)",
  background: "transparent",
  color: "#ffc107",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 500,
};

export const CardanoBlockfrostRateLimitBanner: React.FC<{
  presentation?: BlockfrostLimitPresentation;
}> = ({ presentation }) => {
  const navigate = useNavigate();

  if (
    !presentation ||
    (!presentation.showBuiltinLimitCta && !presentation.showUserKeyLimitWarning)
  ) {
    return null;
  }

  const message = getBlockfrostLimitBannerMessage(presentation);

  return (
    <div style={bannerStyle}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
        <i
          className="fas fa-exclamation-triangle"
          style={{ marginTop: "2px" }}
        />
        <div style={{ flex: 1 }}>
          <div>{message}</div>
          {presentation.showBuiltinLimitCta ? (
            <button
              type="button"
              style={ctaButtonStyle}
              onClick={() => navigate("/setting/cardano/blockfrost-api")}
            >
              Enter Blockfrost API key
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
