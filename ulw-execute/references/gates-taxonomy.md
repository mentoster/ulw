# ULW Gate Taxonomy

Use four gate types and define trigger, failure behavior, and resume point for each checkpoint.

## Pre-flight

Validates prerequisites before changes. Failure blocks entry until the missing condition is fixed.

## Revision

Evaluates produced work. Failure returns specific findings to implementation, then reruns invalidated verification. Escalate when iterations do not converge.

## Escalation

Pauses for an owner decision when evidence cannot resolve a destructive, irreversible, security-critical, or outcome-changing conflict.

## Abort

Stops to prevent damage when safety invariants, environment integrity, or recoverability fail. Preserve current state and report the exact restart point.
