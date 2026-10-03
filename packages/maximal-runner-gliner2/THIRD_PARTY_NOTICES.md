# Third-Party Notices

This notice covers the external runtime and model identities referenced by
`@maximal/maximal-runner-gliner2`. The npm package does not contain a Python
runtime, Python wheels, or model weights.

## Fastino GLiNER2

- Component: `gliner2[local]==2.0.0`
- Source: <https://github.com/fastino-ai/GLiNER2/tree/v2.0.0>
- License: Apache License 2.0
- Copyright: Fastino and GLiNER2 contributors

GLiNER2 is loaded by the separately installed Python environment. A
distribution that bundles that environment MUST include GLiNER2's Apache
License 2.0 text and applicable notices.

## PyTorch

- Component: `torch==2.7.0`
- Source: <https://github.com/pytorch/pytorch/tree/v2.7.0>
- License: BSD-style 3-Clause license with bundled third-party notices
- Copyright: PyTorch contributors and the copyright holders identified by the
  PyTorch license

A distribution that bundles PyTorch MUST include the license and third-party
notices shipped with the exact PyTorch artifact.

## Hugging Face Transformers

- Component: `transformers==4.57.6`
- Source: <https://github.com/huggingface/transformers/tree/v4.57.6>
- License: Apache License 2.0
- Copyright: Hugging Face and Transformers contributors

A distribution that bundles Transformers MUST include its Apache License 2.0
text and applicable notices.

## Fastino GLiNER2.5 models

Model weights are downloaded separately and are not part of the npm package.
The model-card metadata at each pinned revision declares Apache License 2.0:

| Model | Revision |
| --- | --- |
| `fastino/GLiNER2.5-Decide` | `5a7adf72a23b4d311abae6ce050d7f0012bb3416` |
| `fastino/GLiNER2.5-Decide-1B` | `688cd7ba8917a0855ad3ce929cba5a9998932e79` |
| `fastino/GLiNER2.5-multi-Decide` | `a35a0cd3b7a0f00f2effc576f454cd48fa98aa5f` |

The model repositories do not expose a root `LICENSE` file at these revisions.
A distribution that redistributes a model MUST preserve its pinned model card,
record its revision and declared license, include the Apache License 2.0 text,
and retain any additional notices supplied with the downloaded snapshot.

## Complete bundled environments

The three direct runtime components have transitive Python and native
dependencies with their own licenses. A desktop or server distribution that
bundles a Python environment MUST generate its third-party license inventory
from the exact locked environment and include every required license and
notice. This file is not a substitute for that artifact-specific inventory.
