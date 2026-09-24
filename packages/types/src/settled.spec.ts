import { toSerializableSettledResponses } from "./settled";

describe("toSerializableSettledResponses", () => {
  it("preserves module/code/message through JSON", () => {
    const reason = Object.assign(new Error("No Ethereum public key"), {
      module: "keyring",
      code: 901,
    });
    const settled = [
      {
        status: "rejected" as const,
        reason,
      },
    ];

    const roundTrip = JSON.parse(
      JSON.stringify(toSerializableSettledResponses(settled))
    );

    expect(roundTrip[0].status).toBe("rejected");
    expect(roundTrip[0].reason.message).toContain("No Ethereum public key");
    expect(roundTrip[0].reason.module).toBe("keyring");
    expect(roundTrip[0].reason.code).toBe(901);
  });

  it("does not collapse a plain Error to empty object", () => {
    const settled = [
      {
        status: "rejected" as const,
        reason: new Error("boom"),
      },
    ];

    const roundTrip = JSON.parse(
      JSON.stringify(toSerializableSettledResponses(settled))
    );

    expect(roundTrip[0].reason.message).toBe("boom");
  });
});
