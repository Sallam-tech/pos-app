# TEST41 restore provenance ? additional explicit security approval

14 November 2026. **OWNER EXPLICITLY APPROVED, TEST-only.** A+B backup/security work is already
approved TEST-only; this addendum concerns one newly demonstrated guard boundary.

## Actual evidence

The new genuine TEST41 fixture creates saved Settings, sale, corrected invoice,
refund/restock, expense, cost revaluation and cash records. SQLite's Online Backup
API preserves every table, hidden rowid and schema object; integrity/FK/exact41
checks pass. Reopening the isolated copy at another file identity denies Admin
login with HTTP401. Three other focused negative proof cases pass.

Cause: settingsContext includes authorizedFileNamespace (actual path/device/inode);
assertSettingsLedgers requires every immutable Settings/password/cancellation
audit context to equal the CURRENT file context. Therefore an unchanged valid
snapshot with saved Settings cannot reopen at a new identity. This is a
recoverability blocker, not evidence of a bad password or corrupt SQLite copy.

Automatic approval review rejected a proposed change accepting historical contexts,
stating that it broadens a security/financial integrity guard beyond the approved
TEST-only scope and could weaken authorization/replay protection. No part of that
rejected edit executed. Existing guards and records remain unchanged.

## Narrow implementation proposed for explicit approval

1. Keep current-file command contexts and every existing current permission,
   input, exact-schema, ledger, proof expiry and session check unchanged.
2. Only a genuine opaque restore capability may permit historical Settings
   contexts during READ validation. Mint it only after approved age decryption,
   pinned independent archive-signature verification, full EOF/hash/length/
   schema checks, exact signed snapshot reconciliation and a NEW disposable
   TEST destination. No caller flag/string/JSON key establishes this capability.
3. Bind it to destination canonical path/device/inode and immutable signed
   source snapshot/namespace. Confine both issuer and consumer to existing
   NODE_ENV=test + validated test-results roots. Persistent mode always rejects.
4. Cryptographically pin exact restored Settings/password/cancellation prefixes
   (rowid cutoffs, counts and complete typed-row SHA256). Verify these historical
   prefixes whenever using their old contexts; reject additions/changes/removals.
   Keep old audit rows and all migration bytes unchanged.
5. Generate NEW command namespaces from the actual NEW destination identity.
   Historical contexts authorize neither new writes nor replay of UNKNOWN source
   operations. Restored sessions/grants remain invalid. Old-source keys absent
   after the snapshot cannot be executed automatically to fill a recovery gap.
6. Persist a restricted DPAPI/ACL-protected signed restore record for TEST restart;
   revalidate its target identity and historical prefixes before minting a new
   capability. Require fresh role login. No production writer transfer.
7. Test forged/serialized/stale/other-file/persistent capabilities, changed signed
   prefixes, wrong archive signer/key, raw-copy denial, new-context writes, old-
   context replay denial, original-key lookups and actual restarted HTTPS/Chromium.
   Never replace the denial with a generic whitelist or rewrite historical contexts.

## Options

- **Recommended: approve this exact TEST-confined historical-validation extension**
  to the shared server code, with current-file command authority preserved.
- Keep the shared guard unchanged; encrypted archives can still be created and
  checked, but actual TEST41 application restore with saved Settings remains
  BLOCKED. No backup/restore PASS or production-readiness claim is possible.

This approval covers the precisely gated shared-code changes above; it does not
activate production, authorize real data operations or accept independent hardware.
