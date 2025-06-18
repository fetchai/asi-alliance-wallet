export const getFilteredAddressValues = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((value) =>
    value.name.toLowerCase().includes(searchTerm)
  );

  return filteredValues;
};

export const getFilteredWallets = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((value) =>
    value?.meta?.name?.toLowerCase().includes(searchTerm)
  );

  return filteredValues;
};

export const getFilteredChainValues = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((value) =>
    value._chainInfo.chainName.toLowerCase().includes(searchTerm)
  );

  return filteredValues;
};

export const getFilteredProposals = (values: any[], searchTerm: string) => {
  const filteredValues = values.filter((proposal: any) => {
    if (
      proposal.content.title
        .toLowerCase()
        .includes(searchTerm.trim().toLowerCase()) ||
      proposal.proposal_id.includes(searchTerm)
    )
      return true;
  });

  return filteredValues;
};
