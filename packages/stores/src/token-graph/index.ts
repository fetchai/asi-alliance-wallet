import { KVStore, toGenerator } from "@keplr-wallet/common";
import { action, flow, makeObservable, observable } from "mobx";
import { ChainGetter } from "src/common";

interface GraphDurationData {
  [key: string]: GraphDurationObject;
}

export interface GraphDurationObject {
  chartData: ChartData[];
  tokenState: TokenStateData;
}

export interface ChartData {
  value: number;
  date: string;
}

export interface TokenStateData {
  diff: number;
  time: string;
  timestamp: number;
  type: "positive" | "negative";
}

export class TokenGraphStore {
  @observable
  protected data: GraphDurationData = {};

  constructor(
    protected readonly kvStore: KVStore,
    protected readonly chainGetter: ChainGetter
  ) {
    makeObservable(this);

    this.init();
  }

  @flow
  *init() {
    const savedData = yield* toGenerator(
      this.kvStore.get<GraphDurationData>("token-graph")
    );
    this.data = savedData ? savedData : {};
  }

  @flow
  *saveData() {
    yield this.kvStore.set<GraphDurationData>("token-graph", this.data);
  }

  @action
  setData(data: GraphDurationData) {
    this.data = data;
    this.saveData();
  }

  get getData() {
    return this.data;
  }
}
