import {
  createSmartNavigatorProvider,
  SmartNavigator,
} from "hooks/use-smart-navigation";
import {
  AddressBookConfig,
  AddressBookData,
  IMemoConfig,
  IRecipientConfig,
  IRecipientConfigWithICNS,
  RegisterConfig,
} from "@keplr-wallet/hooks";
import { NewMnemonicConfig } from "screens/register/mnemonic";
import { BIP44HDPath, ExportKeyRingData } from "@keplr-wallet/background";
import { ActivityEnum } from "screens/activity";

interface Configs {
  amount: string;
  denom: string;
  recipient?: any;
  memo?: string;
}

export interface State {
  isNext: boolean;
  configs: Configs;
  noChangeAccount: boolean;
}
const { SmartNavigatorProvider, useSmartNavigation } =
  createSmartNavigatorProvider(
    new SmartNavigator({
      Unlock: {
        upperScreenName: "Unlock",
      },
      "Register.Intro": {
        upperScreenName: "Register",
      },
      "Register.NewMnemonic": {
        upperScreenName: "Register",
      },
      "Register.VerifyMnemonic": {
        upperScreenName: "Register",
      },
      "Register.RecoverMnemonic": {
        upperScreenName: "Register",
      },
      "Register.MigrateETH": {
        upperScreenName: "Register",
      },
      "Register.CreateAccount": {
        upperScreenName: "Register",
      },
      "Register.Ledger": {
        upperScreenName: "Register",
      },
      "Register.TorusSignIn": {
        upperScreenName: "Register",
      },
      "Register.ImportFromExtension.Intro": {
        upperScreenName: "Register",
      },
      "Register.ImportFromExtension": {
        upperScreenName: "Register",
      },
      "Register.ImportFromExtension.SetPassword": {
        upperScreenName: "Register",
      },
      "Register.End": {
        upperScreenName: "Register",
      },
      Home: {
        upperScreenName: "HomeTab",
      },
      Activity: {
        upperScreenName: "ActivityTab",
      },
      Portfolio: {
        upperScreenName: "HomeTab",
      },
      NativeTokens: {
        upperScreenName: "HomeTab",
      },
      Inbox: {
        upperScreenName: "HomeTab",
      },
      "Staking.Dashboard": {
        upperScreenName: "Stake",
      },
      "Validator.Details": {
        upperScreenName: "Stake",
      },
      "SelectorValidator.Details": {
        upperScreenName: "Stake",
      },
      "Validator.List": {
        upperScreenName: "Stake",
      },
      Delegate: {
        upperScreenName: "Stake",
      },
      Undelegate: {
        upperScreenName: "Stake",
      },
      Redelegate: {
        upperScreenName: "Stake",
      },
      Governance: {
        upperScreenName: "Setting",
      },
      "Governance.Details": {
        upperScreenName: "Setting",
      },
      "Setting.ViewPrivateData": {
        upperScreenName: "Setting",
      },
      "Setting.Currency": {
        upperScreenName: "Setting",
      },
      "Setting.Version": {
        upperScreenName: "Setting",
      },
      "Setting.ChainList": {
        upperScreenName: "Setting",
      },
      "Setting.AddToken": {
        upperScreenName: "Setting",
      },
      "Setting.ManageTokens": {
        upperScreenName: "Setting",
      },
      "Setting.SecurityAndPrivacy": {
        upperScreenName: "Setting",
      },
      "Setting.Endpoint": {
        upperScreenName: "Setting",
      },
      AddressBook: {
        upperScreenName: "AddressBooks",
      },
      AddAddressBook: {
        upperScreenName: "AddressBooks",
      },
      EditAddressBook: {
        upperScreenName: "AddressBooks",
      },
      Tokens: {
        upperScreenName: "Others",
      },
      Camera: {
        upperScreenName: "Others",
      },
      Receive: {
        upperScreenName: "Others",
      },
      Send: {
        upperScreenName: "Others",
      },
      WebView: {
        upperScreenName: "Others",
      },
      RenameWallet: {
        upperScreenName: "Others",
      },
      DeleteWallet: {
        upperScreenName: "Others",
      },
    }).withParams<{
      "Register.Intro": {
        isBack: boolean;
      };
      "Register.NewMnemonic": {
        registerConfig: RegisterConfig;
      };
      "Register.VerifyMnemonic": {
        registerConfig: RegisterConfig;
        newMnemonicConfig: NewMnemonicConfig;
      };
      "Register.RecoverMnemonic": {
        registerConfig: RegisterConfig;
      };
      "Register.MigrateETH": {
        registerConfig: RegisterConfig;
      };
      "Register.CreateAccount": {
        registerConfig: RegisterConfig;
        mnemonic: string;
        bip44HDPath?: BIP44HDPath;
        title?: string;
      };
      "Register.Ledger": {
        registerConfig: RegisterConfig;
      };
      "Register.TorusSignIn": {
        registerConfig: RegisterConfig;
        type: "google" | "apple";
      };
      "Register.ImportFromExtension.Intro": {
        registerConfig: RegisterConfig;
      };
      "Register.ImportFromExtension": {
        registerConfig: RegisterConfig;
      };
      "Register.ImportFromExtension.SetPassword": {
        registerConfig: RegisterConfig;
        exportKeyRingDatas: ExportKeyRingData[];
        addressBooks: { [chainId: string]: AddressBookData[] | undefined };
      };
      "Register.End": {
        password?: string;
      };
      "Staking.Dashboard": {
        isTab?: boolean;
      };
      "Validator.Details": {
        validatorAddress: string;
        prevSelectedValidator?: string;
      };
      "SelectorValidator.Details": {
        prevSelectedValidator?: string;
        validatorAddress: string;
      };
      "Validator.List": {
        prevSelectedValidator?: string;
        selectedValidator?: string;
      };
      Delegate: {
        validatorAddress: string;
      };
      Undelegate: {
        validatorAddress: string;
      };
      Redelegate: {
        selectedValidatorAddress?: string;
        validatorAddress: string;
      };
      "Setting.ViewPrivateData": {
        privateData: string;
        privateDataType: string;
      };
      AddressBook: {
        recipientConfig?: IRecipientConfig;
        memoConfig?: IMemoConfig;
      };
      AddAddressBook: {
        chainId: string;
        addressBookConfig: AddressBookConfig;
      };
      "Governance.Details": {
        proposalId?: string;
      };
      Send: {
        chainId?: string;
        currency?: string;
        recipient?: string;
        state?: State;
      };
      Receive: {
        chainId?: string;
      };
      NativeTokens: {
        tokenString: string;
        tokenBalanceString: string;
      };
      Camera: {
        showMyQRButton?: boolean;
        recipientConfig?: IRecipientConfig | IRecipientConfigWithICNS;
      };
      WebView: {
        url: string;
      };
      Activity: {
        tabId?: ActivityEnum;
      };
    }>()
  );

export { SmartNavigatorProvider, useSmartNavigation };
