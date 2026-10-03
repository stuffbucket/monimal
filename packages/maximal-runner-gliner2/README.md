# maximal-runner-gliner2

`@maximal/maximal-runner-gliner2` MUST own local GLiNER2 classification
execution. It wraps Fastino's official Python `gliner2` runtime in a persistent
subprocess and implements the provider-neutral `classify-labels` runner
operation.

The runner MUST use the public `Classifier` and `ClassificationSchema` APIs.
It MUST return every declared label probability in request order. It MUST NOT
substitute the simpler `classify_text` API because that API returns selected
labels rather than the complete probability distribution required by the
System One provider.

## Runtime

Consumers MUST provide a Python 3.12 executable containing the exact core
versions in `runtime-requirements.txt`. The package never installs Python or
packages at runtime. A desktop packager MAY bundle that environment, but it
MUST keep the executable and worker outside ASAR and include them in signing,
notarization, and SBOM inputs. A packager that bundles the environment MUST
also include the artifact-specific licenses and notices required by
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The worker uses PyTorch MPS when available and falls back to CPU when `device`
is `auto`. Explicit `mps` mode MUST fail when MPS is unavailable. It keeps one
model loaded and releases the previous model before switching identities.
Cancellation terminates the worker because an in-flight PyTorch forward pass
cannot be interrupted safely.

## Model integrity

The built-in model registry pins repository revisions, weight sizes, and
SHA-256 digests for:

- `fastino/GLiNER2.5-Decide`
- `fastino/GLiNER2.5-Decide-1B`
- `fastino/GLiNER2.5-multi-Decide`

The worker MUST verify `model.safetensors` before activating a model. Other
runtime files are resolved by the official revision-pinned loader.

## Usage

```ts
import { Gliner2ModelRunner } from '@maximal/maximal-runner-gliner2'

const runner = new Gliner2ModelRunner({
  pythonExecutable: '/path/to/pinned/python3.12',
  cacheDirectory: '/path/to/model-cache',
  device: 'auto',
})
```

The runner is structurally compatible with the `ModelRunner` accepted by
`@maximal/maximal-provider-decision-model`.
