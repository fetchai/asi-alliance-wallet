# Development Guidelines

- [Getting the Source](#get)
- [Setting up a New Development Environment](#setup)
- [Development](#dev)
- [Testing](#test)
- [Contributing](#contributing)

## <a name="get"></a> Getting the Source

<!-- markdown-link-check-disable -->
1. Fork the [repository](https://github.com/fetchai/fetch-wallet.git).
2. Clone your fork of the repository:
    <!-- markdown-link-check-enable -->

   ``` shell
   git clone https://github.com/fetchai/fetch-wallet.git
   ```

3. Define an `upstream` remote pointing back to the main Fetch Wallet repository:

   ``` shell
   git remote add upstream https://github.com/fetchai/fetch-wallet.git
   ```

## <a name="setup"></a> Setting up a New Development Environment

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

### Install Global Dependencies

```bash
npm install --global yarn lerna

# TODO: install [watchman](https://facebook.github.io/watchman/docs/install.html)
```
### Install and build packages

```bash
yarn && yarn build:libs
```

## <a name="dev"></a>Development

You can boot up a dev server that constantly watches for file changes in all the packages and rebuilds the changed package accordingly.

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

### Linting

We are using [Eslint](https://eslint.org/docs/latest) and [Prettier](https://prettier.io/docs/en) with added rules for formatting and linting.
Please consider configuring the local `esling + prettier` config to your IDE to speed up the development process and ensure you only commit clean code. Linting and formatting will automatically be checked during `git commit`

Alternately you can invoke lint test by typing the following in the root folder

```bash
  yarn lint-test
```

If there are issues that can be fixed by eslint automatically, you can run the following command to format your code

```bash
  yarn lint-fix
```

## <a name="test"></a>Testing

To run tests use the following command:

```bash
  yarn test
```

## <a name="contributing"></a>Contributing

<!-- markdown-link-check-disable -->
For instructions on how to contribute to the project (e.g. creating Pull Requests, commit message convention, etc), see the [contributing guide](CONTRIBUTING.md).
<!-- markdown-link-check-enable -->
