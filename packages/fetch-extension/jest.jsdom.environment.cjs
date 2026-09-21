const JSDOMEnvironment = require("jest-environment-jsdom");

class FetchJsdomEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    const nextConfig = {
      ...config,
      testURL: "http://localhost/",
      testEnvironmentOptions: {
        ...(config?.testEnvironmentOptions ?? {}),
        url: "http://localhost/",
      },
    };

    super(nextConfig, context);
  }

  async setup() {
    await super.setup();
    this.dom?.reconfigure({ url: "http://localhost/" });

    const makeStorage = () => {
      let store = {};
      return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => {
          store[key] = String(value);
        },
        removeItem: (key) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: (index) => Object.keys(store)[index] ?? null,
        get length() {
          return Object.keys(store).length;
        },
      };
    };

    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const target = this.global;

    Object.defineProperty(target, "localStorage", {
      value: localStorage,
      configurable: true,
    });
    Object.defineProperty(target, "sessionStorage", {
      value: sessionStorage,
      configurable: true,
    });
    if (target.window) {
      Object.defineProperty(target.window, "localStorage", {
        value: localStorage,
        configurable: true,
      });
      Object.defineProperty(target.window, "sessionStorage", {
        value: sessionStorage,
        configurable: true,
      });
    }
  }
}

module.exports = FetchJsdomEnvironment;
