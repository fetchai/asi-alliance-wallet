import React, { useRef } from "react";
import { ButtonV2 } from "@components-v2/buttons/button";
import { buttonStyles } from ".";

export const JsonUploadButton = ({
  text,
  onJsonLoaded,
  onError,
}: {
  text: string;
  onJsonLoaded: (data: any) => void;
  onError: (error: string) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/json") {
      onError("Please upload a valid JSON file");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const jsonStringified = reader.result;
        onJsonLoaded(jsonStringified);
      } catch (err) {
        onError("Failed to read JSON file");
      }
    };

    reader.readAsText(file);

    // reset input so the same file can be uploaded again
    e.target.value = "";
  };

  return (
    <React.Fragment>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        hidden
      />
      <ButtonV2
        text=""
        styleProps={{
          ...buttonStyles,
          height: "35px",
          margin: "0px 0px 12px",
        }}
        variant="dark"
        onClick={handleButtonClick}
      >
        {text}
      </ButtonV2>
    </React.Fragment>
  );
};
