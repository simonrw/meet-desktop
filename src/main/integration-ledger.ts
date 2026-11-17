import { isRecord, readJsonFile, writeJsonFile } from "./json-file";
import type { IntegrationLedgerPort, LedgerEntries } from "./meeting-controller";

/**
 * Keeps the Integration Ledger in a JSON file, treating a missing or unreadable file as an empty ledger.
 */
export function fileLedger(file: string): IntegrationLedgerPort {
  return {
    read() {
      const saved = readJsonFile(file);
      return isRecord(saved) ? (saved as LedgerEntries) : {};
    },

    write: (entries) => writeJsonFile(file, entries),
  };
}
