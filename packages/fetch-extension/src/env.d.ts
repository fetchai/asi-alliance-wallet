declare namespace NodeJS {
  interface ProcessEnv {
    /** node environment */
    NODE_ENV: "production" | "development" | undefined;
    
    // Cardano Blockfrost API Keys
    BLOCKFROST_API_KEY?: string;
    BLOCKFROST_PROJECT_ID_MAINNET?: string;
    BLOCKFROST_PROJECT_ID_PREVIEW?: string;
    BLOCKFROST_PROJECT_ID_PREPROD?: string;
    BLOCKFROST_PROJECT_ID_SANCHONET?: string;
    BLOCKFROST_URL_MAINNET?: string;
    BLOCKFROST_URL_PREVIEW?: string;
    BLOCKFROST_URL_PREPROD?: string;
    BLOCKFROST_URL_SANCHONET?: string;
  }
}
