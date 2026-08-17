import { flow, makeObservable, observable } from "mobx";
import * as Keychain from "react-native-keychain";
import { KVStore, toGenerator } from "@keplr-wallet/common";
import { KeyRingStore } from "@keplr-wallet/stores";
import { Platform } from "react-native";

export class KeychainStore {
  @observable
  protected _isBiometrySupported: boolean = false;

  @observable
  protected _biometryType: Keychain.BIOMETRY_TYPE | null = null;

  @observable
  protected _isBiometryOn: boolean = false;

  @observable
  protected _isAutoLockOn: boolean = false;

  // Fresh options each call: react-native-keychain mutates authenticationPrompt
  // (adds cancel). Reusing a frozen/static object throws on Android/Hermes.
  protected static getReadOptions(): Keychain.GetOptions {
    return {
      authenticationPrompt: {
        title: "Biometric Authentication",
        cancel: "Cancel",
      },
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    };
  }

  // iOS: no auth prompt on write so SecItemAdd does not challenge.
  // Android (keychain v10+): BIOMETRY_CURRENT_SET encrypt needs a prompt.
  protected static getWriteOptions(): Keychain.SetOptions {
    if (Platform.OS === "android") {
      return {
        authenticationPrompt: {
          title: "Biometric Authentication",
          cancel: "Cancel",
        },
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      };
    }
    return {
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
    };
  }

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly keyRingStore: KeyRingStore
  ) {
    makeObservable(this);

    this.init();
  }

  get isBiometrySupported(): boolean {
    return this._isBiometrySupported;
  }

  get biometryType(): Keychain.BIOMETRY_TYPE | null {
    return this._biometryType;
  }

  get isBiometryOn(): boolean {
    return this._isBiometryOn;
  }

  get isAutoLockOn(): boolean {
    return this._isAutoLockOn;
  }

  @flow
  *tryUnlockWithBiometry() {
    if (!this.isBiometryOn) {
      throw new Error("Biometry is off");
    }

    const credentials = yield* toGenerator(
      Keychain.getGenericPassword(KeychainStore.getReadOptions())
    );
    if (credentials) {
      yield this.keyRingStore.unlock(credentials.password);
    } else {
      throw new Error("Failed to get credentials from keychain");
    }
  }

  @flow
  *turnOnBiometry(password: string) {
    const valid = yield* toGenerator(this.keyRingStore.checkPassword(password));
    if (!valid) {
      throw new Error("Invalid password");
    }

    // Delete before write so setGenericPassword always hits SecItemAdd /
    // a fresh Android Keystore entry instead of updating an existing one
    // (which can require auth and fail after disable → re-enable).
    yield* toGenerator(Keychain.resetGenericPassword());

    let result: false | Keychain.Result;
    try {
      result = yield* toGenerator(
        Keychain.setGenericPassword(
          "keplr",
          password,
          KeychainStore.getWriteOptions()
        )
      );
    } catch (e: any) {
      throw new Error(
        e?.message
          ? `Failed to enable biometrics: ${e.message}`
          : "Failed to enable biometrics"
      );
    }

    if (!result) {
      throw new Error("Failed to enable biometrics");
    }

    this._isBiometryOn = true;
    yield this.save();
  }

  @flow
  *turnOffBiometry() {
    if (this.isBiometryOn) {
      const credentials = yield* toGenerator(
        Keychain.getGenericPassword(KeychainStore.getReadOptions())
      );
      if (credentials) {
        if (
          yield* toGenerator(
            this.keyRingStore.checkPassword(credentials.password)
          )
        ) {
          const result = yield* toGenerator(Keychain.resetGenericPassword());
          if (result) {
            this._isBiometryOn = false;
            yield this.save();
          }
        } else {
          throw new Error(
            "Failed to get valid password from keychain. This may be due to changes of biometry information"
          );
        }
      } else {
        throw new Error("Failed to get credentials from keychain");
      }
    }
  }

  @flow
  *turnOffBiometryWithPassword(password: string) {
    if (this.isBiometryOn) {
      if (yield* toGenerator(this.keyRingStore.checkPassword(password))) {
        const result = yield* toGenerator(Keychain.resetGenericPassword());
        if (result) {
          this._isBiometryOn = false;
          yield this.save();
        }
      } else {
        throw new Error("Invalid password");
      }
    }
  }

  @flow
  *reset() {
    if (this.isBiometryOn) {
      const result = yield* toGenerator(Keychain.resetGenericPassword());
      if (result) {
        this._isBiometryOn = false;
        yield this.save();
      }
    }
  }

  @flow
  protected *init() {
    // No need to await.
    this.restore();
    this.restoreAutoLock();
    // iOS only: restore last known type so the label stays correct when
    // Face ID is temporarily unavailable (not enrolled / no app permission).
    if (Platform.OS === "ios") {
      this.restoreBiometryType();
    }

    const type = yield* toGenerator(Keychain.getSupportedBiometryType());
    this._isBiometrySupported = type != null;
    if (type != null) {
      this._biometryType = type;
      if (Platform.OS === "ios") {
        yield this.kvStore.set("lastBiometryType", type);
      }
    }
    // iOS: if type is null, _biometryType keeps the value from restoreBiometryType()
    // Android: _biometryType is set to null when type is null (unchanged behaviour)
  }

  @flow
  protected *restore() {
    const saved = yield* toGenerator(this.kvStore.get("isBiometryOn"));
    this._isBiometryOn = saved === true;
  }

  @flow
  protected *restoreBiometryType() {
    const saved = yield* toGenerator(
      this.kvStore.get<string>("lastBiometryType")
    );
    if (saved) {
      this._biometryType = saved as Keychain.BIOMETRY_TYPE;
    }
  }

  @flow
  protected *restoreAutoLock() {
    const saved = yield* toGenerator(this.kvStore.get<boolean>("isAutoLockOn"));
    this._isAutoLockOn = saved === true;
  }

  @flow
  *toggleAutoLock(isAutoLockOn: boolean) {
    this._isAutoLockOn = isAutoLockOn;
    yield this.saveAutoLock();
  }

  protected async save() {
    await this.kvStore.set("isBiometryOn", this.isBiometryOn);
  }

  protected async saveAutoLock() {
    await this.kvStore.set<boolean>("isAutoLockOn", this.isAutoLockOn);
  }
}
