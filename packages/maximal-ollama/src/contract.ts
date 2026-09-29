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
  process_id: number | null
  process_endpoint: string | null
  suggested_endpoint: string | null
  context_length: number | null
}
