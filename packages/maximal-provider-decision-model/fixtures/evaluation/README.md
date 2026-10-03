# System One regression fixtures

These fixtures are Maximal's internal regression results, not claims of
equivalence to Nimble or Tev public benchmarks. The corpus and expected answers
are authored in this repository. No upstream harness implementation or
restricted dataset text is copied.

## Methodology sources

- Nimble's authoritative public harness is pinned to
  `bespokelabsai/nimble@62076b4f2d365b5879dafcf7f6dd072a1fe76df7`:
  `public_benchmarks.py`, `evaluate_public.py`, `compare_public.py`, and
  `summarize_public_suite.py`. It evaluates 3,880 Choice/Noul/Score decisions
  and reports label accuracy with Brier, MAE, and Wilson statistics.
- Tev's authoritative harness is pinned to
  `togethercomputer/tev1@1dde7782382c9f49d627153759b8d1deab426ce0`:
  `scripts/evaluate.py`. The Tev 4B evaluation uses 1,300 development cases.
- Ollama publishes Tev public-suite aggregate accuracy of 73.3% for 4B and
  63.5% for 0.8B. Ollama does not publish the raw per-example oracles needed
  for paired replay, so those numbers are context only and are not mixed with
  this corpus.

## Recorded captures

All captures used Ollama 0.35.0 and one complete 600-case run. Each fixture
stores every full answer/probability object, recomputable selected label,
identity metadata, corpus hash, duration, and repeat scope.

| Fixture | Exact model identity | Capture | Result |
| --- | --- | --- | --- |
| `nimble-latest.json` | `nimble:latest`, `24e550a16a7081881be2f1f0d91e8cc13a597472735c04119f035a0a85c67e0c`, qwen35, Q8_0, 9.0B | 117.626 s; 60-case balanced subset repeated twice | 100% accuracy; Score MAE 0.00213 |
| `tev1-4b.json` | `tev1:4b`, `cef45ef93cf6df8bf32bdd689b0a8fd01f88ae9034d33ce890c54f77e4cd981e`, qwen35, Q8_0, 4.2B | 76.676 s; 60-case balanced subset repeated twice | 100% accuracy; Score MAE 0.00597 |
| `tev1-0.8b.json` | `tev1:0.8b`, `d45e875d63fed9465390a4eb9e55f51f470390a446667b55d0a075a15e0336bf`, qwen35, Q8_0, 752.39M | 16.064 s; three-case primitive-stratified subset repeated twice | 71.67% accuracy; Score MAE 0.77491 |

The attempted 60-case repeat subset for Tev 0.8B was rejected because
`noul-002` changed selected label. The committed capture therefore truthfully
uses the smaller deterministic three-case subset; it does not claim stability
outside that subset.
