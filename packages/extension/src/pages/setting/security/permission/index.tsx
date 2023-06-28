import React, { FunctionComponent, useState } from "react";
import { HeaderLayout } from "../../../../layouts/header";
import { BackButton } from "../../../../layouts/header/components";
import { Stack } from "../../../../components/stack";
import { observer } from "mobx-react-lite";
import { useStore } from "../../../../stores";
import { Button } from "../../../../components/button";
import { Box } from "../../../../components/box";
import styled from "styled-components";
import { SearchTextInput } from "../../../../components/input";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  TreeIcon,
} from "../../../../components/icon";
import { Column, Columns } from "../../../../components/column";
import { Body1, Body2, Button2 } from "../../../../components/typography";
import { ColorPalette } from "../../../../styles";

const Styles = {
  Container: styled(Stack)`
    padding: 0.75rem;
  `,
  Disconnect: styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;

    margin-top: 0.25rem;
  `,
};

export const SettingSecurityPermissionPage: FunctionComponent = observer(() => {
  const { permissionManagerStore } = useStore();

  const [search, setSearch] = useState("");

  return (
    <HeaderLayout title="Connected Websites" left={<BackButton />}>
      <Styles.Container gutter="0.5rem">
        <SearchTextInput
          placeholder="Search"
          value={search}
          onChange={(e) => {
            e.preventDefault();

            setSearch(e.target.value);
          }}
        />
        <Styles.Disconnect>
          <Button
            text="Disconnect All"
            color="secondary"
            size="extraSmall"
            disabled={
              Object.entries(permissionManagerStore.permissionData).length === 0
            }
            onClick={async () => {
              await permissionManagerStore.clearAllPermissions();
            }}
          />
        </Styles.Disconnect>
        {Object.entries(permissionManagerStore.permissionData)
          .filter(([origin]) => {
            const trim = search.trim();
            if (trim.length === 0) {
              return true;
            }

            return origin.toLowerCase().includes(trim.toLowerCase());
          })
          .map(([origin, value]) => {
            return <OriginView key={origin} origin={origin} value={value} />;
          })}
      </Styles.Container>
    </HeaderLayout>
  );
});

const OriginStyle = {
  Background: styled(Box)`
    padding: 0.75rem;
    background-color: ${ColorPalette["gray-600"]};
    gap: 0.75rem;

    border-radius: 0.375rem;
  `,
  All: styled.div`
    color: ${ColorPalette["gray-300"]};
  `,
  Item: styled(Box)`
    padding: 0.625rem;
    margin-right: 0.625rem;
    color: ${ColorPalette["gray-100"]};
    background-color: ${ColorPalette["gray-500"]};

    border-radius: 0.375rem;
  `,
  Count: styled(Box)`
    cursor: pointer;
    color: ${ColorPalette["gray-200"]};
  `,
};

const OriginView: FunctionComponent<{
  origin: string;
  value?:
    | {
        permissions: { chainIdentifier: string; type: string }[];
        globalPermissions: { type: string }[];
      }
    | undefined;
}> = observer(({ origin, value }) => {
  const { permissionManagerStore } = useStore();

  const [isCollapsed, setIsCollapsed] = useState(true);

  if (!value) {
    return null;
  }

  return (
    <OriginStyle.Background onClick={() => setIsCollapsed(!isCollapsed)}>
      <Columns sum={1} alignY="center">
        <OriginStyle.Item>
          <Columns sum={1} gutter="0.75rem" alignY="center">
            <Body2>{origin}</Body2>
            <Box
              cursor="pointer"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();

                await permissionManagerStore.clearOrigin(origin);
              }}
            >
              <OriginStyle.All>
                <Columns sum={1} gutter="0.125rem">
                  <Button2>All</Button2>
                  <CloseIcon width="1rem" height="1rem" />
                </Columns>
              </OriginStyle.All>
            </Box>
          </Columns>
        </OriginStyle.Item>

        <Column weight={1} />

        <OriginStyle.Count>
          <Columns sum={1} alignY="center" gutter="0.5rem">
            <Body1>
              {(value?.permissions.length ?? 0) +
                (value?.globalPermissions.length ?? 0)}
            </Body1>
            {isCollapsed ? (
              <ArrowDownIcon width="1.25rem" height="1.25rem" />
            ) : (
              <ArrowUpIcon width="1.25rem" height="1.25rem" />
            )}
          </Columns>
        </OriginStyle.Count>
      </Columns>

      {isCollapsed ? null : (
        <Stack gutter="0.75rem">
          {value.permissions.map((permission) => {
            return (
              <Columns
                sum={1}
                key={`${permission.chainIdentifier}/${permission.type}`}
              >
                <TreeIcon />
                <OriginStyle.Item
                  cursor="pointer"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    await permissionManagerStore.removePermission(
                      origin,
                      permission.chainIdentifier,
                      permission.type
                    );
                  }}
                >
                  <Columns sum={1} gutter="0.75rem" alignY="center">
                    <Body2 style={{ color: ColorPalette["gray-100"] }}>
                      {permission.chainIdentifier}
                    </Body2>
                    <Box
                      cursor="pointer"
                      style={{ color: ColorPalette["gray-300"] }}
                    >
                      <CloseIcon width="1rem" height="1rem" />
                    </Box>
                  </Columns>
                </OriginStyle.Item>
              </Columns>
            );
          })}
          {value.globalPermissions.map((globalPermission) => {
            return (
              <Columns sum={1} key={globalPermission.type}>
                <TreeIcon />
                <OriginStyle.Item
                  cursor="pointer"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    await permissionManagerStore.removeGlobalPermission(
                      origin,
                      globalPermission.type
                    );
                  }}
                >
                  <Columns sum={1} gutter="0.75rem" alignY="center">
                    <Body2 style={{ color: ColorPalette["gray-100"] }}>
                      {(() => {
                        switch (globalPermission.type) {
                          case "get-chain-infos":
                            return "Get chain infos";
                          default:
                            return `Unknown: ${globalPermission.type}`;
                        }
                      })()}
                    </Body2>
                    <Box
                      cursor="pointer"
                      style={{ color: ColorPalette["gray-300"] }}
                    >
                      <CloseIcon width="1rem" height="1rem" />
                    </Box>
                  </Columns>
                </OriginStyle.Item>
              </Columns>
            );
          })}
        </Stack>
      )}
    </OriginStyle.Background>
  );
});
