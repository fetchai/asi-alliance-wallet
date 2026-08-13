/**
 * Compile-time contract check: ListAccountsResult from background and provider
 * must stay in sync. If either type is changed without updating the other,
 * this file will fail type-checking.
 */
import type { ListAccountsResult as BackgroundResult } from "@keplr-wallet/background";
import type { ListAccountsResult as ProviderResult } from "@keplr-wallet/provider";

// Assignability both ways; fails at compile time if types diverge.
const _toBg: BackgroundResult = null as unknown as ProviderResult;
const _toPv: ProviderResult = null as unknown as BackgroundResult;
void _toBg;
void _toPv;
