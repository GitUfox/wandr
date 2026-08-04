import { useState, useEffect } from "react";
import { getAccount, subscribeAccount, initAccounts } from "../lib/sync.js";

/**
 * React view of the account/sync state. Safe on every build: when Supabase
 * isn't configured, initAccounts is a no-op and `configured` stays false —
 * account surfaces render their "not connected yet" state.
 */
export function useAccount() {
  const [account, setAccount] = useState(getAccount);

  useEffect(() => {
    initAccounts();                      // idempotent
    return subscribeAccount(setAccount); // unsubscribe on unmount
  }, []);

  return account;
}
