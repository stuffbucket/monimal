export interface OllamaRuntimeStatus {
  installation: 'application' | 'cli' | 'none'
  installed: boolean
  running: boolean
  can_launch: boolean
  can_manage: boolean
  application_path: string | null
  server_configuration_path: string
  desktop_settings_path: string | null
  endpoint: string
  context_length: number | null
}
