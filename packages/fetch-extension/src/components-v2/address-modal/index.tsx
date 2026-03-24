import { Bech32Address } from "@keplr-wallet/cosmos";
import { ModularChainInfo, SupportedPaymentType } from "@keplr-wallet/types";
import { observer } from "mobx-react-lite";
import React, { useMemo } from "react";
import {
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Badge,
} from "reactstrap";
import classNames from "classnames";
import style from "./style.module.scss";

const ALLOWED_CHAINS = [
  "fetchhub-4",
  "cosmoshub-4",
  "1",
  "osmosis-1",
  "injective-1",
  "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:taproot",
  "bip122:000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f:native-segwit",
  "bip122:000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943:taproot",
  "bip122:000000000933ea01ad0ee984209779baaec3ced90fa3f408719526f8d77f4943:native-segwit",
  "bip122:00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6:taproot",
  "bip122:00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6:native-segwit",
];

type AddressItem = {
  modularChainInfo: ModularChainInfo;
  bech32Address?: string;
  ethereumAddress?: string;
  starknetAddress?: string;
  bitcoinAddress?: {
    bech32Address: string;
    paymentType: SupportedPaymentType;
  };
};

function truncate(address?: AddressItem) {
  if (!address) return "";
  if (address.starknetAddress) {
    return `${address.starknetAddress.slice(
      0,
      12
    )}...${address.starknetAddress.slice(-10)}`;
  }

  if (address.ethereumAddress) {
    return address.ethereumAddress.length === 42
      ? `${address.ethereumAddress.slice(
          0,
          12
        )}...${address.ethereumAddress.slice(-10)}`
      : address.ethereumAddress;
  }

  if (address.bech32Address) {
    return Bech32Address.shortenAddress(address.bech32Address, 24);
  }

  if (address.bitcoinAddress?.bech32Address) {
    return Bech32Address.shortenAddress(
      address.bitcoinAddress.bech32Address,
      24
    );
  }
}

interface Props {
  isOpen: boolean;
  toggle: () => void;
  addresses: AddressItem[];
  onCopy: (address: string) => void;
}

export const AddressFloatingMenu: React.FC<Props> = observer(
  ({ isOpen, toggle, addresses, onCopy }) => {
    const copy = (text?: string) => {
      if (!text) return;
      onCopy(text);
    };

    const flattenedAddresses: AddressItem[] = useMemo(() => {
      const result =
        addresses
          ?.map((address) => {
            if (address.ethereumAddress && address.bech32Address) {
              return [
                {
                  modularChainInfo: address.modularChainInfo,
                  bech32Address: address.bech32Address,
                },
                {
                  ...address,
                },
              ];
            }

            return address;
          })
          .flat()
          .filter((value) =>
            ALLOWED_CHAINS.includes(value.modularChainInfo.chainId)
          ) ?? [];

      const map = new Map<string, AddressItem>();

      result.forEach((item) => {
        const chainId = item.modularChainInfo.chainId;

        if (!map.has(chainId)) {
          map.set(chainId, item);
        }
      });

      return Array.from(map.values());
    }, [addresses]);

    const getAddress = (item: AddressItem) => {
      return (
        item.bech32Address ||
        item.ethereumAddress ||
        item.starknetAddress ||
        item.bitcoinAddress?.bech32Address
      );
    };

    return (
      <Dropdown isOpen={isOpen} toggle={toggle}>
        <DropdownToggle caret={false} tag="span">
          <img
            style={{ cursor: "pointer" }}
            src={require("@assets/svg/wireframe/copyGrey.svg")}
            alt=""
            onClick={(e: any) => {
              e?.stopPropagation();
              toggle();
            }}
          />
        </DropdownToggle>

        <DropdownMenu
          style={{ maxHeight: 300, overflowY: "auto", minWidth: "270px" }}
        >
          {flattenedAddresses.map((item, i) => {
            const address = getAddress(item);
            return (
              <DropdownItem
                key={i}
                className={classNames(
                  "d-flex align-items-center justify-content-between py-2 px-3",
                  style["dropdownItem"]
                )}
              >
                <div className="d-flex align-items-center">
                  <img
                    style={{
                      height: "18px",
                      width: "18px",
                      borderRadius: "50%",
                      marginRight: "8px",
                    }}
                    src={item?.modularChainInfo?.chainSymbolImageUrl}
                  />
                  <div>
                    <div
                      className="d-flex align-items-center"
                      style={{ fontSize: 14, opacity: 0.7 }}
                    >
                      {item?.modularChainInfo?.chainName}
                      {item.bitcoinAddress?.paymentType && (
                        <Badge
                          pill
                          style={{
                            fontSize: "12px",
                            fontWeight: 400,
                            marginLeft: "5px",
                            borderRadius: "4px",
                            padding: "2px 6px",
                            textTransform: "capitalize",
                          }}
                          color="primary"
                        >
                          {item.bitcoinAddress?.paymentType.replace(
                            /\b\w/g,
                            (char: string) => char.toUpperCase()
                          )}
                        </Badge>
                      )}
                    </div>
                    <div style={{ fontSize: 14 }}>{truncate(item)}</div>
                  </div>
                </div>

                <img
                  style={{ cursor: "pointer" }}
                  src={require("@assets/svg/wireframe/copyGrey.svg")}
                  alt=""
                  onClick={(e: any) => {
                    e?.stopPropagation();
                    copy(address);
                  }}
                />
              </DropdownItem>
            );
          })}
        </DropdownMenu>
      </Dropdown>
    );
  }
);
