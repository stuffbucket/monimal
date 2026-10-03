import { createInterface } from 'node:readline'
import process from 'node:process'

const protocol = Number.parseInt(process.env.FAKE_GLINER_PROTOCOL ?? '1', 10)

process.stdout.write(
  `${JSON.stringify({
    kind: 'ready',
    protocol,
    versions: {
      device: 'cpu',
      gliner2: '2.0.0',
      python: '3.12.0',
      torch: '2.7.0',
      transformers: '4.57.6',
    },
  })}\n`,
)

const lines = createInterface({ input: process.stdin })
lines.on('line', (line) => {
  const request = JSON.parse(line)
  if (process.env.FAKE_GLINER_HANG === '1') return
  process.stdout.write(
    `${JSON.stringify({
      id: request.id,
      kind: 'classification',
      result: {
        kind: 'classify-labels',
        model: request.requestedModel,
        tasks: request.tasks.map((task) => ({
          name: task.name,
          probabilities: Object.fromEntries(
            task.labels.map((label, index) => [
              label.value,
              index === 0 ? 0.75 : 0.25,
            ]),
          ),
        })),
        usage: { inputTokens: 12, outputTokens: 0 },
      },
    })}\n`,
  )
})
