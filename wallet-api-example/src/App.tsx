import React, { useEffect } from "react";
import { Balances } from "./types/balance";
import { Dec, DecUtils } from "@keplr-wallet/unit";
import { sendMsgs } from "./util/sendMsgs";
import { api } from "./util/api";
import { simulateMsgs } from "./util/simulateMsgs";
import { MsgSend } from "./proto-types-gen/src/cosmos/bank/v1beta1/tx";
import "./styles/container.css";
import "./styles/button.css";
import "./styles/item.css";
import "./styles/modal.css";
import { getFetchWalletFromWindow } from "./util/getWalletFromWindow";
import { Account, NetworkConfig, WalletApi, WalletStatus } from "@fetchai/wallet-types";

function App() {
  const [balance, setBalance] = React.useState<string>("");
  const [recipient, setRecipient] = React.useState<string>("");
  const [amount, setAmount] = React.useState<string>("");
  const [wallet, setWallet] = React.useState<WalletApi>();
  const [status, setStatus] = React.useState<WalletStatus>(WalletStatus.NOTLOADED)
  const [account, setAccount] = React.useState<Account>();
  const [network, setNetwork] = React.useState<NetworkConfig>();
  const [isAccountModalOpen, setIsAccountModalOpen] = React.useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = React.useState(false);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [sendLoading, setSendLoading] = React.useState(false);

  const handleOpenAccountModal = () => {
    setIsAccountModalOpen(true);
  };

  const handleCloseAccountModal = () => {
    setIsAccountModalOpen(false);
  };

  const handleOpenNetworkModal = () => {
    setIsNetworkModalOpen(true);
  };

  const handleCloseNetworkModal = () => {
    setIsNetworkModalOpen(false);
  };

  useEffect(() => {
    init();
    window.addEventListener("fetchwallet_walletstatuschange", getStatus);
    window.addEventListener("keplr_keystorechange", getAccountAndNetworkDetails);

    return () => {
      window.removeEventListener("fetchwallet_walletstatuschange", getStatus);
      window.removeEventListener("keplr_keystorechange", getAccountAndNetworkDetails);
    }
  }, []);

  useEffect(() => {
    const getAllDetails = async () => {
      if (status === WalletStatus.UNLOCKED) {
        await getAccountAndNetworkDetails();
     }
    }
    getAllDetails();
  }, [wallet, status])

  const init = async () => {
    const fetchBrowserWallet = await getFetchWalletFromWindow();

    if (fetchBrowserWallet) {
      setWallet(fetchBrowserWallet.wallet);
      const status = await fetchBrowserWallet.wallet.status();
      setStatus(status);
    }
  };

  const getStatus = async () => {
    const currentStatus = await window.fetchBrowserWallet?.wallet.status();
    if (!status || (currentStatus && status !== currentStatus)) {
      setStatus(currentStatus ?? WalletStatus.NOTLOADED);
    }
  };

  const getAccountAndNetworkDetails = async () => {
    setDetailsLoading(true);
    const status = await window.fetchBrowserWallet?.wallet.status();
    if (!status || status !== WalletStatus.UNLOCKED) {
      setDetailsLoading(false);
      return;
    }
    
    const currentAccount = await window.fetchBrowserWallet?.wallet.accounts.currentAccount();

    if (!account || (currentAccount && account.bech32Address !== currentAccount.bech32Address)) {
      setAccount(currentAccount);
    }

    const currentNetwork = await window.fetchBrowserWallet?.wallet.networks.getNetwork();
    if (!network || (currentNetwork && network.chainId !== currentNetwork.chainId)) {
      setNetwork(currentNetwork);
    }

    if (currentAccount && currentNetwork) {
      const uri = `${currentNetwork.restUrl}/cosmos/bank/v1beta1/balances/${currentAccount.bech32Address}?pagination.limit=1000`;

      const data = await api<Balances>(uri);
      const decimal = currentNetwork.currencies[0].decimals
      const minimalDenom = currentNetwork.currencies[0].denomUnits.find(d => d.exponent === 0)?.name ?? "";
      const denom = currentNetwork.currencies[0].denomUnits.find(d => d.exponent === decimal)?.name ?? "";
      const balance = data.balances.find(
        (balance) => balance.denom === minimalDenom
      );

      if (balance) {
        const amount = new Dec(balance.amount, decimal);
        setBalance(`${amount.toString(decimal)} ${denom.toUpperCase()}`);
      } else {
        setBalance(`0 ${denom.toUpperCase()}`);
      }
    }

    setDetailsLoading(false);
  };

  const sendBalance = async () => {
    if (account && network && wallet) {
      const decimal = network.currencies[0].decimals
      const minimalDenom = network.currencies[0].denomUnits.find(d => d.exponent === 0)?.name ?? "";

      const protoMsgs = {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: MsgSend.encode({
          fromAddress: account.bech32Address,
          toAddress: recipient,
          amount: [
            {
              denom: minimalDenom,
              amount: DecUtils.getTenExponentN(decimal)
                .mul(new Dec(amount))
                .truncate()
                .toString(),
            },
          ],
        }).finish(),
      };

      try {
        setSendLoading(true);
        const gasUsed = await simulateMsgs(
          network,
          account.bech32Address,
          [protoMsgs],
          [{ denom: minimalDenom, amount: "236" }]
        );

        if (gasUsed) {
          await sendMsgs(
            wallet,
            network,
            account.bech32Address,
            [protoMsgs],
            {
              amount: [{ denom: minimalDenom, amount: "236" }],
              gas: Math.floor(gasUsed * 1.5).toString(),
            }
          );
        }
      } catch (e) {
        if (e instanceof Error) {
          console.log(e.message);
        }
      } finally {
        setSendLoading(false);
      }
    }
  };

  if (status === WalletStatus.NOTLOADED) {
    return <h1>Wallet Initialising...</h1>
  }

  if (status === WalletStatus.LOCKED) {
    return (
      <div className="item">
        <div className="item-title">Wallet Locked</div>

        <div className="item-content">
          <div>
            <button
              className="asi-button"
              disabled={!wallet}
              onClick={async () => {
                await wallet?.unlockWallet();
              }}
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === WalletStatus.EMPTY) {
    return <h1>Wallet Empty. Please create an account in the wallet</h1>
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "50px" }}>
        <button className="asi-button" onClick={handleOpenAccountModal}>
          Change Account
        </button>
        <button className="asi-button" onClick={handleOpenNetworkModal}>
          Change Network
        </button>
        <button
          className="asi-button"
          onClick={() => {
            window.fetchBrowserWallet?.wallet.lockWallet();
          }}
        >
          Sign Out
        </button>
      </div>
      <br />
      <div className="item">
        <div className="item-content">
          <div><b>Network:</b> {network?.chainId}</div>
          <div><b>Account:</b> {account?.bech32Address}</div>
          <div><b>Usable Balance:</b> {balance}</div>

          <h3>Send:</h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "-25px"
            }}
          >
            Recipient:
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            Amount:
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <button className="asi-button" onClick={sendBalance}>
            {sendLoading ? "Sending, please wait..." : "Send"}
          </button>
        </div>
      </div>

      {account && (
        <AccountSwitchModal
          isOpen={isAccountModalOpen}
          onClose={handleCloseAccountModal}
          currentAddress={account.bech32Address}
        />
      )}
      {network && (
        <NetworkSwitchModal
          isOpen={isNetworkModalOpen}
          onClose={handleCloseNetworkModal}
          currentNetworkId={network.chainId}
        />
      )}

      {detailsLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}

const NetworkSwitchModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  currentNetworkId: string;
}> = ({ isOpen, onClose, currentNetworkId }) => {
  const [selectedNetwork, setSelectedNetwork] = React.useState<string>("");
  const [networks, setNetworks] = React.useState<NetworkConfig[]>();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const getNetworks = async () => {
      setIsLoading(true);
      const networks = await window.fetchBrowserWallet?.wallet.networks.listNetworks();
      if (networks) {
        setNetworks(networks);
      }
      setIsLoading(false);
    }
    getNetworks();
  }, [isOpen])

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="close" onClick={onClose}>
          <span>&times;</span>
        </div>
        {isLoading ? (
          <div className="spinner"></div>
        ) : (
          <>
            <p>Switch network:</p>
            <select style={{ "marginBottom": "15px" }} value={selectedNetwork ?? ""} onChange={(e) => setSelectedNetwork(e.target.value)}>
              <option value="">Select Network</option>
              {networks?.filter((network) => {
                return network.chainId !== currentNetworkId;
              }).map(network => (
                <option key={network.chainId} value={network.chainId}>
                  {network.chainName}
                </option>
              ))}
            </select>
            <button
              className="asi-button"
              onClick={async () => {
                if (selectedNetwork && selectedNetwork !== currentNetworkId) {
                  await window.fetchBrowserWallet?.wallet.networks.switchToNetworkByChainId(selectedNetwork);
                  onClose();
                }
              }}
            >Submit</button>
          </>
        )}
      </div>
    </div>
  );
};

const AccountSwitchModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  currentAddress: string;
}> = ({ isOpen, onClose, currentAddress }) => {
  const [selectedAccount, setSelectedAccount] = React.useState<string>("");
  const [accounts, setAccounts] = React.useState<Account[]>();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const getAccounts = async () => {
      setIsLoading(true);
      const accounts = await window.fetchBrowserWallet?.wallet.accounts.listAccounts();
      if (accounts) {
        setAccounts(accounts);
      }
      setIsLoading(false);
    }
    getAccounts();
  }, [isOpen])

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="close" onClick={onClose}>
          <span>&times;</span>
        </div>
        {isLoading ? (
          <div className="spinner"></div>
        ) : (
          <>
            <p>Switch account:</p>
            <select style={{ "marginBottom": "15px" }} value={selectedAccount ?? ""} onChange={(e) => setSelectedAccount(e.target.value)}>
              <option value="">Select Account</option>
              {accounts?.filter((account) => {
                return account.bech32Address !== currentAddress;
              }).map(account => (
                <option key={account.bech32Address} value={account.bech32Address}>
                  {account.bech32Address}
                </option>
              ))}
            </select>
            <button
              className="asi-button"
              onClick={async () => {
                if (selectedAccount && selectedAccount !== currentAddress) {
                  await window.fetchBrowserWallet?.wallet.accounts.switchAccount(selectedAccount);
                  onClose();
                }
              }}
            >Submit</button>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
