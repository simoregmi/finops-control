# Production Change Approval Workflow walkthrough

Recorded 2026-11-11 on branch `devin/1794360002-prod-approvals`, commit
`b970e7b`, for PR #2. Local Ubuntu/Chrome, Node 22.23.4, Next.js 15.5.29
production server at `http://localhost:3000`, local SQLite.

## Setup

Dependencies were already installed. Rebuilt and restarted the production server
to use the current checkout, then reset immediately before recording:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run build
npm start
# Separate shell, from the repo root with Node 22 selected:
npm run db:reset
```

Reset reported 13 seeded flags, an empty audit log, and no change requests.
The maximized browser used Alice's simulated identity initially. No credentials
were needed. No application code was changed or committed.

## Walkthrough and observed results

1. **Alice requests a change (UI).** Opened `new_kyc_flow`: production Disabled,
   v1. Clicked Request enable, typed `new_kyc_flow`, submitted for approval.
   Request #1 appeared pending; production remained Disabled at v1. Header badge
   showed one pending request.
2. **Alice cannot approve (UI and visible DevTools).** Opened Approvals through
   the success banner. Approve was disabled, with “Your request: needs another
   approver”; the other action read Withdraw. Ran this in the visible console:
   ```javascript
   fetch('/api/approvals/1/approve', {method:'POST'})
     .then(r => r.json().then(j => console.log(r.status, JSON.stringify(j))))
   ```
   Response: **403 SELF_APPROVAL_FORBIDDEN**. Refreshed the page afterward:
   request #1 remained pending and Recently decided remained empty.
3. **Bob approves (UI).** Changed the header identity to Bob. Approve became
   enabled. Clicked Approve, then Approve and apply in the confirmation dialog.
   Success banner appeared; pending count became zero. Recently decided showed
   Approved, Alice as requester, Bob as reviewer. No further decision buttons
   appeared on the resolved row.
4. **Flag changed (UI).** Opened the flag via Recently decided: production
   Enabled, version v2, pending note gone. Development and staging remained
   Enabled, unchanged from the baseline.
5. **Audit recorded (UI).** Followed History → Open in audit log, which applies
   the `new_kyc_flow` flag filter. Exactly three events appeared:
   `production_change.requested` by Alice, `production_change.approved` by Bob,
   and `flag.environment.enabled` by Bob. Values linked requestId 1 to
   requestedBy Alice and approvedBy Bob.

Only the self-approval bypass attempt used DevTools; all normal actions used
visible application controls. No curl mutations or identity-header overrides.
The submission's HTTP 202 status was not separately inspected; its pending UI
and unchanged flag version/state were verified.

## Evidence

- `production-approvals-walkthrough.mp4`: condensed, annotated recording slowed
  to half playback speed for readability (approximately 81 seconds).
- `01-production-disabled-v1.png` through `07-audit-three-events.png`: ordered
  baseline, pending request, disabled self-approval, server 403, Bob's decision,
  enabled production, and audit evidence.
- Original annotated recording:
  `/home/ubuntu/screencasts/rec-ada06f68-bf7e-4009-a699-4f06fe1bf440/rec-ada06f68-bf7e-4009-a699-4f06fe1bf440-edited.mp4`

## Issues and scope

No application bugs were observed in this walkthrough. The HTTP 403 was an
expected negative test. Rejection/withdrawal, stale requests, duplicate decisions,
and broader regression testing were not exercised in this short recording.
Identities are simulated, not authentication; this is not proof of production
security. The database was left with request #1 approved and the three audit
events; it was not reset afterward.
