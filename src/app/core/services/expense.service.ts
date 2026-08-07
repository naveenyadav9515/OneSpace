import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, retry, timer, throwError } from 'rxjs';
import { ApiService } from './api.service';

export interface Expense {
  _id: string;
  amount: number;
  category: string;
  merchant: string;
  tags: string[];
  notes: string;
  date: string;
  paymentMethod: string;
  gmailMessageId?: string | null;
}

export interface PendingTransaction extends Expense {
  status: 'Pending' | 'Approved' | 'Rejected';
  source?: 'gmail_auto' | 'manual' | 'simulated';
}

export interface SyncedEmail {
  id: string;
  subject: string;
  from: string;
  date: string | null;
  /** What the engine did with this email — 'created: …', 'skipped: …', 'duplicate …' */
  outcome: string;
}

/**
 * Why a sync failed. Mirrors the backend's `classifyGoogleError` codes plus the
 * pre-flight refusals the engine raises before it ever calls Google.
 */
export type SyncFailureReason =
  | 'not_connected'
  | 'no_refresh_token'
  | 'no_parsers'
  /** Another sync for this account is already running; its results will land shortly. */
  | 'sync_in_progress'
  | 'auth_expired'
  | 'invalid_grant'
  | 'insufficient_scope'
  | 'invalid_client'
  | 'redirect_uri_mismatch'
  | 'api_disabled'
  | 'rate_limited'
  | 'forbidden'
  | 'network_error'
  | 'google_unavailable'
  | 'gmail_error';

export interface SyncResult {
  /** False when the sync could not reach Gmail at all. */
  ok: boolean;
  reason: SyncFailureReason | null;
  error: string | null;
  /**
   * The stored credential is dead and the user must reconnect. Only ever true
   * for genuinely fatal failures — a rate limit or a Google outage leaves the
   * connection intact and must NOT send the user back through OAuth.
   */
  authExpired?: boolean;
  /**
   * How long to wait before syncing is worth attempting again, in seconds.
   * Set when Google is rate-limiting us — retrying inside this window does not
   * shorten the block, it extends it.
   */
  retryAfterSeconds?: number | null;
  /** Messages this run actually downloaded from Gmail. */
  processed: number;
  /**
   * New messages the server deliberately left for the next run, so no single
   * request runs long enough to time out. Zero in normal operation; non-zero
   * only on a first connect with a large backlog.
   *
   * The server queues the remainder for its background worker before replying,
   * so this is progress to report, not an action to ask the user for.
   */
  remaining?: number;
  /** Which query this run used — 'full' scans the whole retention window. */
  mode?: 'incremental' | 'full';
  created: number;
  duplicates: number;
  errors: number;
  skipped?: {
    noParser: number;
    notRelevant: number;
    parseFailed: number;
    beforeCutoff: number;
    /** Resolved by an earlier sync, so never re-downloaded. */
    alreadySynced?: number;
  };
  fetchedEmails?: SyncedEmail[];
}

export interface AutomationStatus {
  gmailConnected: boolean;
  expenseAutomationEnabled: boolean;
  enabledBanks: string[];
  supportedBanks: string[];
}

export interface ExpensePayload {
  amount: number;
  merchant: string;
  category: string;
  paymentMethod: string;
  date: string;
  tags: string[];
  notes: string;
}

export interface ExpenseSummary {
  monthlySpend: number;
  budgetTarget: number;
  budgetUsedPct: number;
  budgetStatus: string;
  spent: number;
  available: number;
  daysLeft: number;
  daysInMonth: number;
  topCategories: {
    name: string;
    amount: number;
    percentage: number;
  }[];
  spendingTrend: {
    labels: string[];
    data: number[];
    avgPerWeek: number;
    trendPct: number;
    trendStatus: string;
  };
  forecast: {
    estimatedSpend: number;
    statusText: string;
    statusColor: string;
  };
  insight: {
    highlightPct: string;
    highlightCategory: string;
    text: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly apiService = inject(ApiService);

  public readonly summary = signal<ExpenseSummary | null>(null);
  public readonly isLoading = signal<boolean>(false);

  private get apiUrl(): string {
    return this.apiService.apiUrl;
  }

  /** Fetches summary stats for the dashboard widget */
  public fetchSummary(): Observable<{ status: string, data: ExpenseSummary }> {
    this.isLoading.set(true);
    return this.http.get<{ status: string, data: ExpenseSummary }>(`${this.apiUrl}/expenses/summary`).pipe(
      retry({
        count: 8,
        delay: (error) => {
          if (error.status >= 400 && error.status < 500) return throwError(() => error);
          return timer(5000);
        }
      }),
      tap({
        next: (res) => {
          this.summary.set(res.data);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      })
    );
  }

  public fetchExpenses(): Observable<{ status: string, data: Expense[] }> {
    return this.http.get<{ status: string, data: Expense[] }>(`${this.apiUrl}/expenses`);
  }

  public createExpense(payload: ExpensePayload): Observable<{ status: string, data: Expense }> {
    return this.http.post<{ status: string, data: Expense }>(`${this.apiUrl}/expenses`, payload);
  }

  public deleteExpense(id: string): Observable<{ status: string, message: string }> {
    return this.http.delete<{ status: string, message: string }>(`${this.apiUrl}/expenses/${id}`);
  }

  public fetchPendingTransactions(): Observable<{ status: string, data: PendingTransaction[] }> {
    return this.http.get<{ status: string, data: PendingTransaction[] }>(`${this.apiUrl}/expenses/pending`);
  }

  public processPendingTransaction(
    id: string,
    payload: { action: 'approve' | 'ignore' } | ({ action: 'approve' } & ExpensePayload)
  ): Observable<{ status: string, data?: Expense, message?: string }> {
    return this.http.post<{ status: string, data?: Expense, message?: string }>(
      `${this.apiUrl}/expenses/pending/${id}`,
      payload
    );
  }

  public syncExpenses(): Observable<{ status: string, message: string, data: SyncResult }> {
    return this.http.post<{ status: string, message: string, data: SyncResult }>(`${this.apiUrl}/expenses/sync`, {});
  }

  public getGmailConnectionUrl(
    redirectUri: string
  ): Observable<{ status: string, data: { url: string } }> {
    const encodedRedirect = encodeURIComponent(redirectUri);
    return this.http.get<{ status: string, data: { url: string } }>(
      `${this.apiUrl}/auth/google/url?redirectUri=${encodedRedirect}`
    );
  }

  public completeGmailConnection(
    code: string,
    redirectUri: string
  ): Observable<{ status: string, message: string }> {
    return this.http.post<{ status: string, message: string }>(
      `${this.apiUrl}/auth/google/connect`,
      { code, redirectUri }
    );
  }

  public fetchAutomationStatus(): Observable<{ status: string, data: AutomationStatus }> {
    return this.http.get<{ status: string, data: AutomationStatus }>(
      `${this.apiUrl}/expenses/automation/status`
    );
  }

  public updateAutomationSettings(payload: {
    expenseAutomationEnabled?: boolean;
    enabledBanks?: string[];
  }): Observable<{ status: string, message: string, data: any }> {
    return this.http.patch<{ status: string, message: string, data: any }>(
      `${this.apiUrl}/expenses/automation/settings`,
      payload
    );
  }

  public disconnectGmail(): Observable<{ status: string, message: string }> {
    return this.http.post<{ status: string, message: string }>(
      `${this.apiUrl}/expenses/automation/disconnect`,
      {}
    );
  }
}
