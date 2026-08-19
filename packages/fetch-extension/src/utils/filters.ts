export const getFilteredAddressValues = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((value) =>
    value.name.toLowerCase().includes(searchTerm)
  );

  return filteredValues;
};

export const getFilteredWallets = (values: any[], searchTerm: string) => {
  const term = searchTerm.toLowerCase().trim();
  if (!term) {
    return values;
  }

  return values.filter((value) => {
    if (value?.name?.toLowerCase().includes(term)) {
      return true;
    }

    const keyRingMeta = value?.insensitive?.keyRingMeta ?? {};
    if (!keyRingMeta.nameByChain) {
      return false;
    }

    try {
      const nameByChain = JSON.parse(keyRingMeta.nameByChain);
      return Object.values(nameByChain).some(
        (name) => typeof name === "string" && name.toLowerCase().includes(term)
      );
    } catch {
      return false;
    }
  });
};

export const getFilteredChainValues = (values: any[], searchTerm: string) => {
  const filteredValues = values?.filter((value: any) =>
    value?.chainName?.toLowerCase().includes(searchTerm)
  );

  return filteredValues;
};

export const getFilteredProposals = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((proposal: any) => {
    if (
      proposal.title.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      proposal.id.includes(searchTerm)
    )
      return true;
  });

  return filteredValues;
};
