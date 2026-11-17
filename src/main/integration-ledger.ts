import { readFileSync, renameSync, writeFileSync } from "node:fs";

import type { IntegrationLedgerPort, LedgerEntries } from "./integration-lifecycle";

/**
 * Keeps the Integration Ledger in a JSON file, treating a missing or unreadable file as an empty ledger.
 */
export function fileLedger(file: string): IntegrationLedgerPort {
  return {
    read() {
      try {
        const saved: unknown = JSON.parse(readFileSync(file, "utf8"));
        return typeof saved === "object" && saved !== null && !Array.isArray(saved) ? (saved as LedgerEntries) : {};
      } catch {
        return {};
      }
    },

    write(entries) {
      // Renaming over the old file means a crash mid-write can't leave it half written.
      const partial = `${file}.partial`;
      writeFileSync(partial, JSON.stringify(entries));
      renameSync(partial, file);
    },
  };
}
