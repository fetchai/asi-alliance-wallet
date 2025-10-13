import { KVStore, toGenerator } from "@keplr-wallet/common";
import { TendermintTxTracer } from "@keplr-wallet/cosmos";
import { action, flow, makeObservable, observable } from "mobx";
import {
  updateNodeOnTxnCompleted,
  updateProposalNodeOnTxnCompleted,
  TXNTYPE,
} from "../account";
import { ChainGetter } from "../common";

export class ActivityStore {
  @observable
  protected nodes: any = {};

  @observable
  protected proposalNodes: any = {};

  @observable
  protected address: string = "";

  @observable
  protected chainId: string = "";

  @observable
  protected isNodeUpdated: boolean = false;

  @observable
  protected pendingTxn: any = {};

  @observable
  protected pendingTxnTypes: any = {
    [TXNTYPE.ibcTransfer]: false,
    [TXNTYPE.send]: false,
    [TXNTYPE.approval]: false,
    [TXNTYPE.createSecret20ViewingKey]: false,
    [TXNTYPE.delegate]: false,
    [TXNTYPE.govVote]: false,
    [TXNTYPE.nativeBridgeSend]: false,
    [TXNTYPE.redelegate]: false,
    [TXNTYPE.undelegate]: false,
    [TXNTYPE.withdrawRewards]: false,
  };

  // updates or adds new nodes to the list
  updateNodes(nodes: any) {
    const updatedNodes = { ...this.nodes, ...nodes };
    this.setNodes(updatedNodes);

    this.saveNodes();
  }

  // updates or adds new nodes to the proposal list
  updateProposalNodes(nodes: any) {
    const updatedNodes = { ...this.proposalNodes, ...nodes };
    this.setProposalNodes(updatedNodes);

    this.saveProposalNodes();
  }

  getSortedNodesByTimeStamps() {
    const sortedNodes = Object.values(this.nodes).sort((a: any, b: any) => {
      if (a.block.timestamp < b.block.timestamp) {
        return 1;
      } else if (a.block.timestamp > b.block.timestamp) {
        return -1;
      } else {
        return 0;
      }
    });

    return sortedNodes;
  }

  getSortedProposalNodesByTimeStamps() {
    const sortedNodes = Object.values(this.proposalNodes).sort(
      (a: any, b: any) => {
        if (a.block.timestamp < b.block.timestamp) {
          return 1;
        } else if (a.block.timestamp > b.block.timestamp) {
          return -1;
        } else {
          return 0;
        }
      }
    );

    return sortedNodes;
  }

  @flow
  *saveNodes(chainId?: string, address?: string, newNode?: any) {
    const nodeChainId = chainId || this.chainId;
    const nodeAddress = address || this.address;

    let currNodes = Object.keys(this.nodes).length > 0 ? this.nodes : {};

    let oldNodes = yield* toGenerator(
      this.kvStore.get<any>(
        `extension_activity_nodes-${nodeAddress}-${nodeChainId}`
      )
    );

    if (oldNodes === undefined || oldNodes === null) {
      oldNodes = {};
    }

    if (
      (this.address !== nodeAddress || this.chainId !== nodeChainId) &&
      newNode
    ) {
      currNodes = { ...newNode, ...oldNodes };
    }

    if (Object.values(currNodes).length >= Object.values(oldNodes).length) {
      yield this.kvStore.set<any>(
        `extension_activity_nodes-${nodeAddress}-${nodeChainId}`,
        JSON.parse(JSON.stringify(currNodes))
      );
    }
  }

  @flow
  *saveProposalNodes(chainId?: string, address?: string, newNode?: any) {
    const nodeChainId = chainId || this.chainId;
    const nodeAddress = address || this.address;

    let currNodes =
      Object.keys(this.proposalNodes).length > 0 ? this.proposalNodes : {};

    let oldNodes = yield* toGenerator(
      this.kvStore.get<any>(
        `extension_gov_proposal_nodes-${nodeAddress}-${nodeChainId}`
      )
    );
    if (oldNodes === undefined || oldNodes === null) {
      oldNodes = {};
    }

    if (
      (this.address !== nodeAddress || this.chainId !== nodeChainId) &&
      newNode
    ) {
      currNodes = { ...newNode, ...oldNodes };
    }

    if (Object.values(currNodes).length >= Object.values(oldNodes).length) {
      yield this.kvStore.set<any>(
        `extension_gov_proposal_nodes-${nodeAddress}-${nodeChainId}`,
        JSON.parse(JSON.stringify(currNodes))
      );
    }
  }

  @flow
  *saveAddress() {
    yield this.kvStore.set<any>("extension_activity_address", this.address);
  }

  @flow
  *saveChainId() {
    yield this.kvStore.set<any>("extension_activity_chain_id", this.chainId);
  }

  @flow
  *savePendingTxn(chainId?: string, address?: string, node?: any) {
    const nodeChainId = chainId || this.chainId;
    const nodeAddress = address || this.address;
    let currNodes =
      Object.keys(this.pendingTxn).length > 0 ? this.pendingTxn : {};

    if (
      (this.address !== nodeAddress || this.chainId !== nodeChainId) &&
      node
    ) {
      let oldNodes = yield* toGenerator(
        this.kvStore.get<any>(
          `extension_pending_txn-${nodeAddress}-${nodeChainId}`
        )
      );
      if (oldNodes === undefined || oldNodes === null) {
        oldNodes = {};
      }
      currNodes = { ...node, ...oldNodes };
    }

    yield this.kvStore.set<any>(
      `extension_pending_txn-${nodeAddress}-${nodeChainId}`,
      JSON.parse(JSON.stringify(currNodes))
    );
  }

  @flow
  *savePendingTxnTypes() {
    yield this.kvStore.set<any>(
      `extension_pending_txn_types-${this.address}-${this.chainId}`,
      JSON.parse(JSON.stringify(this.pendingTxnTypes))
    );
  }

  getNode(id: any) {
    return this.nodes[id];
  }

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainGetter: ChainGetter
  ) {
    makeObservable(this);

    this.init();
  }

  @flow
  *init() {
    const savedAddress = yield* toGenerator(
      this.kvStore.get<any>("extension_activity_address")
    );
    this.address = savedAddress;

    const savedChainId = yield* toGenerator(
      this.kvStore.get<any>("extension_activity_chain_id")
    );
    this.chainId = savedChainId;
  }

  @flow
  *accountInit() {
    try {
      const savedNodes = yield* toGenerator(
        this.kvStore.get<any>(
          `extension_activity_nodes-${this.address}-${this.chainId}`
        )
      );
      this.nodes = savedNodes !== undefined ? savedNodes : {};

      const savedProposalNodes = yield* toGenerator(
        this.kvStore.get<any>(
          `extension_gov_proposal_nodes-${this.address}-${this.chainId}`
        )
      );
      this.proposalNodes =
        savedProposalNodes !== undefined ? savedProposalNodes : {};

      const savedPendingTxn = yield* toGenerator(
        this.kvStore.get<any>(
          `extension_pending_txn-${this.address}-${this.chainId}`
        )
      );

      this.pendingTxn = savedPendingTxn !== undefined ? savedPendingTxn : {};

      const savedPendingTxnTypes = yield* toGenerator(
        this.kvStore.get<any>(
          `extension_pending_txn_types-${this.address}-${this.chainId}`
        )
      );

      this.pendingTxnTypes =
        savedPendingTxnTypes !== undefined
          ? savedPendingTxnTypes
          : this.pendingTxnTypes;

      const txTracer = new TendermintTxTracer(
        this.chainGetter.getChain(this.chainId).rpc,
        "/websocket",
        {}
      );

      Object.values(this.nodes).map((node: any) => {
        const txHash = Uint8Array.from(Buffer.from(node.id, "hex"));
        txTracer.traceTx(txHash).then((tx) => {
          updateNodeOnTxnCompleted(node.type, tx, node.id, this);
          this.removePendingTxn(node.id);
        });
      });

      Object.values(this.proposalNodes).map((node: any) => {
        const txId = node.transaction.id;
        const txHash = Uint8Array.from(Buffer.from(txId, "hex"));
        txTracer.traceTx(txHash).then((tx) => {
          updateProposalNodeOnTxnCompleted(tx, node.id, this);
          this.removePendingTxn(txId);
        });
      });

      if (Object.keys(this.pendingTxn).length === 0) {
        this.resetPendingTxnTypes();
      }
    } catch (e) {
      console.log(e);
    }
  }

  @action
  addNode(node: any) {
    const { chainId, signerAddress } = node.transaction;
    const newNode = { [node.id]: node };

    if (chainId === this.chainId && signerAddress === this.address) {
      this.updateNodes(newNode);
    } else {
      this.saveNodes(chainId, signerAddress, newNode);
    }
  }

  @action
  addProposalNode(node: any) {
    const { chainId, signerAddress } = node.transaction;
    const newNode = { [node.id]: node };

    if (chainId === this.chainId && signerAddress === this.address) {
      this.updateProposalNodes(newNode);
    } else {
      this.saveProposalNodes(chainId, signerAddress, newNode);
    }
  }

  @action
  addPendingTxn(node: any) {
    const { chainId, signerAddress } = node;
    const newNode = {
      [node.id]: node,
    };

    if (chainId === this.chainId && signerAddress === this.address) {
      const updatedNodes = { ...this.pendingTxn, ...newNode };
      this.setPendingTxn(updatedNodes);
    } else {
      this.savePendingTxn(chainId, signerAddress, newNode);
    }
  }

  @action
  removePendingTxn(nodeId: string) {
    const updatedNodes: any = {};
    Object.values(this.pendingTxn).map((node: any) => {
      if (node.id !== nodeId) {
        updatedNodes[node.id] = node;
      } else {
        this.setPendingTxnTypes(this.pendingTxn[node.id].type, false);
      }
    });
    this.setPendingTxn(updatedNodes);
  }

  @action
  resetNodes() {
    this.nodes = {};
    this.saveNodes();
  }

  @action
  resetPendingTxn() {
    this.pendingTxn = {};
    this.savePendingTxn();
  }

  @action
  resetPendingTxnTypes() {
    this.pendingTxnTypes = {
      [TXNTYPE.ibcTransfer]: false,
      [TXNTYPE.send]: false,
      [TXNTYPE.approval]: false,
      [TXNTYPE.createSecret20ViewingKey]: false,
      [TXNTYPE.delegate]: false,
      [TXNTYPE.govVote]: false,
      [TXNTYPE.nativeBridgeSend]: false,
      [TXNTYPE.redelegate]: false,
      [TXNTYPE.undelegate]: false,
      [TXNTYPE.withdrawRewards]: false,
    };
    this.savePendingTxnTypes();
  }

  @action
  setTxnStatus(
    nodeId: any,
    status: "Pending" | "Success" | "Failed" | "Unconfirmed"
  ) {
    if (this.nodes[nodeId]?.transaction) {
      this.nodes[nodeId].transaction.status = status;
      this.saveNodes();
    }
  }

  @action
  setProposalTxnStatus(
    nodeId: any,
    status: "Pending" | "Success" | "Failed" | "Unconfirmed"
  ) {
    if (this.proposalNodes[nodeId]?.transaction) {
      this.proposalNodes[nodeId].transaction.status = status;
      this.saveProposalNodes();
    }
  }

  @action
  updateTxnBalance(nodeId: any, amount: number) {
    if (this.nodes[nodeId]) {
      this.nodes[nodeId].balanceOffset = amount;
      this.saveNodes();
    }
  }

  @action
  updateTxnJson(nodeId: any, index: number, json: string[]) {
    try {
      if (this.nodes[nodeId]?.transaction?.messages?.nodes[index]?.json) {
        const currentJson = JSON.parse(
          this.nodes[nodeId].transaction.messages.nodes[index].json
        );

        const newJson = {
          delegatorAddress: currentJson.delegatorAddress,
          validatorAddress: currentJson.validatorAddress,
          amount: {
            denom: json[1],
            amount: json[0],
          },
        };

        this.nodes[nodeId].transaction.messages.nodes[index].json =
          JSON.stringify(newJson);
        this.saveNodes();
      }
    } catch (e) {
      console.log(e);
    }
  }

  @action
  updateTxnGas(nodeId: any, gasUsed: any, gasWanted: any) {
    if (this.nodes[nodeId]?.transaction) {
      this.nodes[nodeId].transaction = {
        ...this.nodes[nodeId].transaction,
        gasUsed: gasUsed,
        gasWanted,
      };
      this.saveNodes();
    }
  }

  @action
  updateProposalTxnGas(nodeId: string, gasUsed: string, gasWanted: string) {
    if (this.proposalNodes[nodeId]?.transaction) {
      this.proposalNodes[nodeId].transaction = {
        ...this.proposalNodes[nodeId].transaction,
        gasUsed: gasUsed,
        gasWanted,
      };
      this.saveProposalNodes();
    }
  }

  @action
  setProposalTxnLogs(nodeId: string, log: string) {
    if (this.proposalNodes[nodeId]?.transaction) {
      this.proposalNodes[nodeId].transaction = {
        ...this.proposalNodes[nodeId].transaction,
        log,
      };
      this.saveProposalNodes();
    }
  }

  @action
  setNodes(nodes: any) {
    this.nodes = nodes;
  }

  @action
  setProposalNodes(nodes: any) {
    this.proposalNodes = nodes;
  }

  @action
  setPendingTxn(nodes: any) {
    this.pendingTxn = nodes;
    this.savePendingTxn();
  }

  @action
  setPendingTxnTypes(type: string, value: boolean) {
    this.pendingTxnTypes[type] = value;
    this.savePendingTxnTypes();
  }

  @action
  setNode(id: any, node: any) {
    this.nodes[id] = node;
  }

  @action
  setProposalNode(id: any, node: any) {
    this.proposalNodes[id] = node;
  }

  @action
  setAddress(address: string) {
    this.address = address;
    this.saveAddress();
  }

  @action
  setIsNodeUpdated(value: boolean) {
    this.isNodeUpdated = value;
  }

  @action
  setChainId(chainId: string) {
    this.chainId = chainId;
    this.saveChainId();
  }

  get getNodes() {
    return this.nodes;
  }

  get getProposalNodes() {
    return this.proposalNodes;
  }

  get checkIsNodeUpdated() {
    return this.isNodeUpdated;
  }

  get getChainId() {
    return this.chainId;
  }

  get getAddress() {
    return this.address;
  }

  get getPendingTxn() {
    return this.pendingTxn;
  }

  get getPendingTxnTypes() {
    return this.pendingTxnTypes;
  }

  get sortedNodes() {
    return this.getSortedNodesByTimeStamps();
  }

  get sortedNodesProposals() {
    return this.getSortedProposalNodesByTimeStamps();
  }
}
