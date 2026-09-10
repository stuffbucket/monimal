import z from "@deepseek-ai/schemastery"

export interface Config {
  suiteDataRoot?: string
}

export const Config: z<Config> = z.object({
  suiteDataRoot: z.string(),
})
