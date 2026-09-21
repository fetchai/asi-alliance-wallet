import { MemoryKVStore } from "@keplr-wallet/common";
jest.mock("../keyring", () => ({
  KeyRingStatus: {
    EMPTY: "empty",
    LOCKED: "locked",
    UNLOCKED: "unlocked",
    NOTLOADED: "notloaded",
  },
}));
import { PermissionService } from "./service";
import { KeyRingStatus } from "../keyring";

describe("PermissionService EMPTY wallet behavior", () => {
  let service: PermissionService;
  const env = { isInternalMsg: false } as any;

  beforeEach(() => {
    service = new PermissionService(new MemoryKVStore("permission-test"), []);
    (service as any).keyRingService = {
      checkReadiness: jest.fn(async () => KeyRingStatus.EMPTY),
    };
  });

  it("checkOrGrantBasicAccessPermission is no-op when wallet is empty", async () => {
    const grantSpy = jest
      .spyOn(service, "grantBasicAccessPermission")
      .mockResolvedValue(undefined);
    const checkSpy = jest
      .spyOn(service, "checkBasicAccessPermission")
      .mockResolvedValue(undefined);

    await service.checkOrGrantBasicAccessPermission(
      env,
      ["cosmoshub-4"],
      "https://example.app"
    );

    expect(grantSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it("checkOrGrantPermission is no-op when wallet is empty", async () => {
    const grantSpy = jest
      .spyOn(service, "grantPermission")
      .mockResolvedValue(undefined);
    const checkSpy = jest
      .spyOn(service, "checkPermission")
      .mockImplementation(() => {});

    await service.checkOrGrantPermission(
      env,
      "/access",
      ["cosmoshub-4"],
      "basic-access",
      "https://example.app"
    );

    expect(grantSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });

  it("checkOrGrantGlobalPermission is no-op when wallet is empty", async () => {
    const grantSpy = jest
      .spyOn(service, "grantGlobalPermission")
      .mockResolvedValue(undefined);
    const checkSpy = jest
      .spyOn(service, "checkGlobalPermission")
      .mockImplementation(() => {});

    await service.checkOrGrantGlobalPermission(
      env,
      "/access",
      "get-chain-infos-without-endpoints",
      "https://example.app"
    );

    expect(grantSpy).not.toHaveBeenCalled();
    expect(checkSpy).not.toHaveBeenCalled();
  });
});
