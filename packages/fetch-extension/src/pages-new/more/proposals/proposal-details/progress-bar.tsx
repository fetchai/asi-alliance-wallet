import { GlassCard } from "@components-v2/glass-card";
import style from "./style.module.scss";
import React from "react";

export const ProgressBar = ({
  height,
  progressWidth,
  title,
  bgColor,
  isShowPercentage = false,
  isYourVote = false,
  borderRadius = "6px",
}: {
  height: string;
  progressWidth: number;
  title: string;
  bgColor: string;
  isShowPercentage?: boolean;
  isYourVote?: boolean;
  borderRadius?: string;
}) => {
  return (
    <GlassCard
      styleProps={{
        height: height,
        borderRadius: borderRadius,
        padding: 0,
        display: "flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          width: `${progressWidth}%`,
          backgroundColor: bgColor,
          borderRadius: borderRadius,
        }}
        className={style["turnout-progress"]}
      />
      <div
        style={{
          position: "absolute",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: "18px",
        }}
      >
        {title}
        {isShowPercentage && (
          <span style={{ color: "rgba(255,255,255,0.6)", margin: "0 6px" }}>
            {progressWidth}%
          </span>
        )}
        {isYourVote && (
          <span
            style={{
              display: "flex",
              gap: "6px",
              justifyContent: "center",
              alignItems: "center",
              border: "1px solid rgba(255, 255, 255, 0.6)",
              borderRadius: "4px",
              padding: "4px 8px",
            }}
          >
            <img src={require("@assets/svg/wireframe/check.svg")} />
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              You voted
            </div>
          </span>
        )}
      </div>
    </GlassCard>
  );
};
