import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';

/**
 * Balance adapter that provides reactive balance streams following Lace patterns
 * Adapts the imperative CardanoService to reactive observables
 * Based on Lace's useObservable pattern and balance stream management
 */
export class BalanceAdapter {
  private balanceSubject: BehaviorSubject<any>;
  private isPolling = false;
  private pollingInterval?: ReturnType<typeof setInterval>;

  constructor(
    private getBalanceFn: () => Promise<any>,
    private pollingIntervalMs: number = 30000,
    initialBalance?: any
  ) {
    // Initialize with provided balance or null
    this.balanceSubject = new BehaviorSubject<any>(initialBalance || null);
  }

  /**
   * Get balance as observable stream
   * Follows Lace pattern: wallet.balance.utxo.total$ equivalent
   */
  get balance$(): Observable<any> {
    return this.balanceSubject.asObservable();
  }

  /**
   * Get current balance value
   */
  get currentBalance(): any {
    return this.balanceSubject.value;
  }

  /**
   * Get current balance value for caching before destruction
   */
  getCachedBalance(): any {
    return this.balanceSubject.value;
  }

  /**
   * Start reactive balance polling
   * Graceful fallback on errors - continues with cached value
   */
  startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    console.log(`Starting Cardano balance polling every ${this.pollingIntervalMs / 1000}s`);

    this.pollingInterval = setInterval(async () => {
      try {
        await this.refreshBalance();
      } catch (error) {
        console.warn('Balance polling error:', error);
        // Graceful fallback - continue with cached balance
      }
    }, this.pollingIntervalMs);

    // Initial poll
    this.refreshBalance().subscribe({
      next: () => {},
      error: (error) => console.warn('Initial balance poll failed:', error)
    });
  }

  /**
   * Stop balance polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      this.isPolling = false;
      console.log('Stopped Cardano balance polling');
    }
  }

  /**
   * Manually refresh balance
   * Returns observable for reactive consumption
   */
  refreshBalance(): Observable<any> {
    return new Observable(subscriber => {
      this.getBalanceFn()
        .then(balance => {
          this.balanceSubject.next(balance);
          subscriber.next(balance);
          subscriber.complete();
        })
        .catch(error => {
          console.warn('Failed to fetch balance:', error);
          // Graceful fallback - emit cached balance if available
          const cachedBalance = this.balanceSubject.value;
          if (cachedBalance && cachedBalance !== null) {
            subscriber.next(cachedBalance);
          } else {
            // If no cached balance, emit zero balance instead of error
            subscriber.next({
              utxo: {
                available: { coins: BigInt(0) },
                total: { coins: BigInt(0) },
                unspendable: { coins: BigInt(0) }
              },
              rewards: BigInt(0),
              deposits: BigInt(0),
              assetInfo: new Map()
            });
          }
          subscriber.complete();
        });
    }).pipe(
      retry(2), // Retry up to 2 times on failure
      catchError(error => {
        console.warn('Balance refresh failed after retries:', error);
        // Return cached balance or zero balance structure
        const cachedBalance = this.balanceSubject.value;
        if (cachedBalance && cachedBalance !== null) {
          return of(cachedBalance);
        }
        return of({
          utxo: {
            available: { coins: BigInt(0) },
            total: { coins: BigInt(0) },
            unspendable: { coins: BigInt(0) }
          },
          rewards: BigInt(0),
          deposits: BigInt(0),
          assetInfo: new Map()
        });
      })
    );
  }

  /**
   * Force immediate balance update
   */
  async forceRefresh(): Promise<any> {
    try {
      const balance = await this.getBalanceFn();
      this.balanceSubject.next(balance);
      return balance;
    } catch (error) {
      console.warn('Force refresh failed:', error);
      return this.balanceSubject.value;
    }
  }

  /**
   * Check if adapter is currently polling
   */
  get isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Get balance age in milliseconds
   */
  get balanceAge(): number {
    const lastUpdate = this.balanceSubject.value?.lastUpdated;
    return lastUpdate ? Date.now() - lastUpdate : Infinity;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPolling();
    this.balanceSubject.complete();
  }
}
