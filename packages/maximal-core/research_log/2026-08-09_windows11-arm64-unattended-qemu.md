# Research: Fully unattended Windows 11 ARM64 install under QEMU on macOS, driven from the host
Started: 2026-08-09T17:29:25-07:00 | Status: in_progress

## Problem
Need a scripted, zero-GUI-click pipeline: build a QEMU VM on Apple Silicon,
unattended-install Windows 11 ARM64 (autounattend.xml), then drive it
remotely from macOS (SSH) to install Bun and run `bun install` + `bun test`
against a Bun/TypeScript repo. This is a QEMU-direct approach (not UTM's GUI),
complementary to the existing `docs/dev/windows-vm-utm.md` (UTM-based,
manual OOBE bypass via Shift+F10). Host is confirmed elsewhere in this repo's
research_log as an Apple M2 Ultra Mac Studio, macOS 26.5, with only ~51 GB
free disk — disk footprint of the unattended install matters. Six concrete
sub-questions to answer: (1) minimal autounattend.xml content incl. ARM64
processorArchitecture value, (2) delivery mechanism (ISO/CD-ROM) and how to
build it on macOS, (3) LabConfig TPM/SecureBoot/RAM bypass registry commands
and whether they still work on 24H2/25H2, (4) FirstLogonCommands for OpenSSH
Server enablement + authorized_keys + firewall, (5) host->guest file transfer
options under QEMU on macOS (9p/virtiofs, SMB via -netdev user,smb=, or scp),
(6) rough install time and resulting qcow2 disk footprint.

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
</content>
