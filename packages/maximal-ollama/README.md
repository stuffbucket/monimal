# Maximal Ollama

Node-native Ollama installation discovery, process launch, endpoint probing,
and context-length management. The desktop host calls this package behind its
validated IPC bridge; the renderer imports only its contract.

This extraction does **not** yet make Ollama optional. Core still owns Ollama
provider routing, control methods, and web-tool integration, while Settings
still presents Ollama controls. Optional delivery requires a Core provider
registration seam and feature-aware Settings composition before Ollama can be
excluded as a unit.
