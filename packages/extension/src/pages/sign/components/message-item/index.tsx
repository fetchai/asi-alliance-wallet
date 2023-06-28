import React, { FunctionComponent } from "react";
import { Column, Columns } from "../../../../components/column";
import { Box } from "../../../../components/box";
import { ColorPalette } from "../../../../styles";
import { Gutter } from "../../../../components/gutter";
import { Body3, H5 } from "../../../../components/typography";

export const MessageItem: FunctionComponent<{
  icon: React.ReactElement;
  title: string;
  content: string | React.ReactElement;
}> = ({ icon, title, content }) => {
  return (
    <Box padding="1rem">
      <Columns sum={1}>
        <Box
          width="3rem"
          minWidth="3rem"
          height="3rem"
          alignX="center"
          alignY="center"
        >
          {icon}
        </Box>

        <Gutter size="0.75rem" />

        <Column weight={1}>
          <Box minHeight="3rem" alignY="center">
            <H5 color={ColorPalette["gray-10"]}>{title}</H5>
            <Gutter size="2px" />
            <Body3 color={ColorPalette["gray-200"]}>{content}</Body3>
          </Box>
        </Column>
      </Columns>
    </Box>
  );
};
