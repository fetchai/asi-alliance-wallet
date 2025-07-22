# ASI Alliance Wallet

[![Official Website](https://img.shields.io/badge/Official%20Website-fetch.ai-blue?style=flat&logo=world&logoColor=white)](https://fetch.ai) [![Twitter Follow](https://img.shields.io/twitter/follow/fetch_ai?style=social)](https://twitter.com/fetch_ai)


This is the code repository of the ASI Alliance Wallet, a generic wallet for blockchains built using the [Cosmos-SDK](https://github.com/cosmos/cosmos-sdk) with support for EVM-based chains and the inter-blockchain communication (IBC) protocol. 

This is a fork of the Keplr wallet by [chainapsis](https://github.com/chainapsis).

## Official Releases

You can find the latest versions of the official managed releases on these links:

- [Browser Extension](https://chrome.google.com/webstore/detail/fetch-wallet/ellkdbaphhldpeajbepobaecooaoafpg)
    - Fetch officially supports Chrome, Firefox.
    - [iOS App](https://apps.apple.com/in/app/asi-alliance-wallet/id1641087356)
    - [Android App](https://play.google.com/store/apps/details?id=com.fetchai.wallet)
   
For help using ASI Alliance Wallet, Visit our [Doc](https://network.fetch.ai/docs/guides/asi-wallet/web-wallet/get-started).

## Building browser extension locally

### Requirements

- protoc v21.3 (recommended)

  ```sh
    # This script is example for mac arm64 user. for other OS, replace URL(starts with https://..) to be matched with your OS from https://github.com/protocolbuffers/protobuf/releases/tag/v21.3
    curl -Lo protoc-21.3.zip https://github.com/protocolbuffers/protobuf/releases/download/v21.3/protoc-21.3-osx-aarch_64.zip 
  
    #OR
  
    # This script is example for linux x86_64 user
    curl -Lo protoc-21.3.zip https://github.com/protocolbuffers/protobuf/releases/download/v21.3/protoc-21.3-linux-x86_64.zip
  
    unzip protoc-21.3.zip -d $HOME/protoc
    cp -r $HOME/protoc/include /usr/local
    cp -r $HOME/protoc/bin /usr/local
  ```

- [Node.js v18+](https://nodejs.org/)

Clone this repo and run:

Install global npm dependencies:

```bash
npm install --global yarn lerna

# TODO: install [watchman](https://facebook.github.io/watchman/docs/install.html)
```

Install and build packages:

```bash
yarn && yarn build:libs
```

### Local dev server for fetch-extension

```bash
yarn dev
```

### Local dev server for mobile

```bash
yarn android
```

```bash
yarn ios
```

In case of any error, try this and re-run the local dev server for mobile

```bash
yarn postinstall
```
