# Research: Container/VM substrate for build & CI isolation on Apple Silicon M2 Ultra (colima, Incus, nested virtualization)
Started: 2026-08-06T13:15:47-07:00 | Status: in_progress

## Problem
Host is macOS on an M2 Ultra. colima provides both Docker and Incus on this box. User asked
specifically about Incus system containers as a possible build/CI isolation substrate, and
flagged that nested virtualization may be limited on Apple Silicon. Need to determine: what
substrate actually gives the most useful isolation for builds/CI on this hardware, what its
hard limits are, and whether Incus system containers are the right tool or a detour. Read-only
research spike — no file edits, no PRs.

## Awesome Lists Checked

## Searches

## Sources

## Approaches

## Recommendation

## Implementation

## Risks

METRICS: searches=0 fetches=0 high_quality=0 ratio=0.0
CHECKS: [ ] freshness [ ] went_deep [ ] found_outlier [ ] checked_awesome

## Feedback
usefulness: | implemented: | result: | notes:
