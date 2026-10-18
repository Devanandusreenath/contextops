import { Badge, type Tone } from "@/components/ui-kit";
import type { IncidentStatus, Severity, Validity, VerificationState } from "@/types";

const sev: Record<Severity, Tone> = { SEV1: "danger", SEV2: "warning", SEV3: "neutral" };
const status: Record<IncidentStatus, Tone> = { Investigating: "primary", Open: "danger", Mitigated: "warning", Resolved: "success" };
const validity: Record<Validity, Tone> = { Valid: "primary", Verified: "success", "Needs review": "warning", Superseded: "neutral" };
const verification: Record<VerificationState, Tone> = {
  Verified: "success",
  Unverified: "violet",
  Proposed: "warning",
  "Test passed": "success",
  "Test failed": "danger",
  "Requires approval": "warning",
};

export const SeverityBadge = ({ v }: { v: Severity }) => <Badge tone={sev[v]}>{v}</Badge>;
export const StatusBadge = ({ v }: { v: IncidentStatus }) => <Badge tone={status[v]}>{v}</Badge>;
export const ValidityBadge = ({ v }: { v: Validity }) => <Badge tone={validity[v]}>{v}</Badge>;
export const VerificationBadge = ({ v }: { v: VerificationState }) => <Badge tone={verification[v]}>{v}</Badge>;
