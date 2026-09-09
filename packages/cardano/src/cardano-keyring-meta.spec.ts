import { CARDANO_COIN_TYPE, CardanoKeyRing } from "./cardano-keyring";

describe("CardanoKeyRing mnemonic metadata", () => {
  it("marks a 24-word mnemonic as Cardano-capable without network context", async () => {
    const keyRing = new CardanoKeyRing();
    const mnemonic = `${new Array(23).fill("abandon").join(" ")} art`;

    await expect(
      keyRing.getMetaFromMnemonic(mnemonic, "password")
    ).resolves.toEqual({
      cardano: "true",
      coinType: CARDANO_COIN_TYPE.toString(),
    });
  });

  it("does not mark a non-24-word mnemonic as Cardano-capable", async () => {
    const keyRing = new CardanoKeyRing();
    const mnemonic = `${new Array(11).fill("abandon").join(" ")} about`;

    await expect(
      keyRing.getMetaFromMnemonic(mnemonic, "password")
    ).resolves.toEqual({});
  });
});
