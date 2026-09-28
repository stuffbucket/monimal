import { useState, type CSSProperties, type ReactElement } from 'react'

export interface AccountLike {
  key?: string
  login?: string
  host?: string
  provider?: string
  service?: string
  type?: string
  endpoint?: string
  avatar_url?: string
  avatarUrl?: string
}

export interface ServiceIconProps {
  size?: number
  className?: string
  style?: CSSProperties
  testId?: string
}

export interface ServiceDefinition {
  id: string
  name: string
  match: (accountOrProvider: AccountLike | string) => boolean
  renderIcon: (props: ServiceIconProps) => ReactElement
}

function normalizeInput(accountOrProvider: AccountLike | string): {
  host: string
  provider: string
  type: string
  endpoint: string
  login: string
} {
  if (typeof accountOrProvider === 'string') {
    const raw = accountOrProvider.trim().toLowerCase()
    return {
      host: raw,
      provider: raw,
      type: raw,
      endpoint: raw,
      login: raw,
    }
  }

  const host = (accountOrProvider.host ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  const provider = (accountOrProvider.provider ?? '').trim().toLowerCase()
  const type = (accountOrProvider.type ?? '').trim().toLowerCase()
  const endpoint = (accountOrProvider.endpoint ?? '').trim().toLowerCase()
  const login = (accountOrProvider.login ?? '').trim().toLowerCase()

  return { host, provider, type, endpoint, login }
}

const GITHUB_ICON: ServiceDefinition = {
  id: 'github',
  name: 'GitHub Copilot',
  match: (input) => {
    const { host, provider, type } = normalizeInput(input)
    return (
      provider.includes('github')
      || provider.includes('copilot')
      || host === 'github.com'
      || host.includes('github')
      || host.startsWith('ghe.')
      || type === 'github'
      || type === 'github-copilot'
    )
  },
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-github'}
    >
      <path d="M12 .297a12 12 0 0 0-3.793 23.388c.6.113.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.084 1.84 1.237 1.84 1.237 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.235-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 6.1c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.119 3.176.769.84 1.233 1.911 1.233 3.221 0 4.61-2.805 5.624-5.478 5.921.43.37.814 1.102.814 2.222 0 1.606-.015 2.9-.015 3.293 0 .32.216.694.825.576A12 12 0 0 0 12 .297Z" />
    </svg>
  ),
}

const OLLAMA_ICON: ServiceDefinition = {
  id: 'ollama',
  name: 'Ollama',
  match: (input) => {
    const { host, provider, type, endpoint } = normalizeInput(input)
    return (
      provider.includes('ollama')
      || host.includes('ollama')
      || host.includes('11434')
      || endpoint.includes('11434')
      || endpoint.includes('ollama')
      || type === 'ollama'
    )
  },
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-ollama'}
    >
      <path
        d="M8.25 8.25V5.5a3.75 3.75 0 0 1 7.5 0v2.75m-7.5-1.5-2-1v4.5m9.5-3.5 2-1v4.5M6.25 10c0-1.1.9-2 2-2h7.5c1.1 0 2 .9 2 2v7.25c0 1.1-.9 2-2 2h-7.5c-1.1 0-2-.9-2-2V10Zm3.25 3.25h.01m4.99 0h.01M9.5 16h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  ),
}

const OPENAI_ICON: ServiceDefinition = {
  id: 'openai',
  name: 'OpenAI',
  match: (input) => {
    const { host, provider, type } = normalizeInput(input)
    return (
      provider.includes('openai')
      || host.includes('openai')
      || type === 'openai'
    )
  },
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-openai'}
    >
      <path d="M22.28 10.37a5.72 5.72 0 0 0-.52-4.87 5.78 5.78 0 0 0-4.14-2.73 5.74 5.74 0 0 0-4.75 1.07A5.72 5.72 0 0 0 8.1 3.25a5.78 5.78 0 0 0-4.63 2.15 5.73 5.73 0 0 0-.82 4.88 5.72 5.72 0 0 0 .52 4.87 5.78 5.78 0 0 0 4.14 2.73c.27.76.75 1.44 1.38 1.95a5.74 5.74 0 0 0 3.37 1.12 5.72 5.72 0 0 0 4.77-.59 5.78 5.78 0 0 0 4.63-2.15 5.73 5.73 0 0 0 .82-4.84v-.004Zm-9.14 9.94a4.24 4.24 0 0 1-2.48-.8l1.37-2.37a1.5 1.5 0 0 1 1.28-.76h4.3a4.28 4.28 0 0 1-4.47 3.93Zm-6.52-3.76a4.25 4.25 0 0 1-.9-2.45l2.74.01a1.5 1.5 0 0 1 1.3.75l2.15 3.72a4.28 4.28 0 0 1-5.29-2.03Zm-1.58-6.9a4.25 4.25 0 0 1 1.58-1.92v2.74c0 .59.32 1.14.83 1.44l3.73 2.15a4.28 4.28 0 0 1-6.14-4.41Zm12.28 1.44-3.73-2.15a4.28 4.28 0 0 1 6.14 4.41 4.25 4.25 0 0 1-1.58 1.92v-2.74a1.5 1.5 0 0 0-.83-1.44Zm2.48-2.65a4.25 4.25 0 0 1 .9 2.45l-2.74-.01a1.5 1.5 0 0 0-1.3-.75l-2.15-3.72a4.28 4.28 0 0 1 5.29 2.03Zm-8.4-3.93a4.24 4.24 0 0 1 2.48.8l-1.37 2.37a1.5 1.5 0 0 0-1.28.76h-4.3a4.28 4.28 0 0 1 4.47-3.93Z" />
    </svg>
  ),
}

const ANTHROPIC_ICON: ServiceDefinition = {
  id: 'anthropic',
  name: 'Anthropic',
  match: (input) => {
    const { host, provider, type } = normalizeInput(input)
    return (
      provider.includes('anthropic')
      || provider.includes('claude')
      || host.includes('anthropic')
      || type === 'anthropic'
    )
  },
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-anthropic'}
    >
      <path d="m14.286 3.5 5.714 17h-3.429l-1.143-3.4H8.571L7.429 20.5H4l5.714-17h4.572Zm-1.143 10.6-1.714-5.1-1.714 5.1h3.428Z" />
    </svg>
  ),
}

const GEMINI_ICON: ServiceDefinition = {
  id: 'gemini',
  name: 'Google Gemini',
  match: (input) => {
    const { host, provider, type } = normalizeInput(input)
    return (
      provider.includes('gemini')
      || provider.includes('google')
      || host.includes('google')
      || type === 'google'
      || type === 'gemini'
    )
  },
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-gemini'}
    >
      <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.627 12 12 0-6.627 5.627-12 12-12-6.627 0-12-5.627-12-12Z" />
    </svg>
  ),
}

const DEFAULT_SERVICE_ICON: ServiceDefinition = {
  id: 'service',
  name: 'Service',
  match: () => true,
  renderIcon: ({ size = 20, className, style, testId }: ServiceIconProps) => (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      className={className}
      style={style}
      data-testid={testId ?? 'service-icon-service'}
    >
      <path d="M12 2a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm0 12c-5.33 0-8 2.67-8 5.33V22h16v-2.67C20 16.67 17.33 14 12 14Z" />
    </svg>
  ),
}

const registeredServices: ServiceDefinition[] = [
  GITHUB_ICON,
  OLLAMA_ICON,
  OPENAI_ICON,
  ANTHROPIC_ICON,
  GEMINI_ICON,
]

export function registerService(service: ServiceDefinition): void {
  const existingIndex = registeredServices.findIndex((s) => s.id === service.id)
  if (existingIndex >= 0) {
    registeredServices[existingIndex] = service
  } else {
    registeredServices.unshift(service)
  }
}

export function resolveService(
  accountOrProvider: AccountLike | string,
): ServiceDefinition {
  for (const service of registeredServices) {
    if (service.match(accountOrProvider)) {
      return service
    }
  }
  return DEFAULT_SERVICE_ICON
}

export function ServiceIcon({
  account,
  provider,
  size = 20,
  className,
  style,
  testId,
}: {
  account?: AccountLike
  provider?: string
  size?: number
  className?: string
  style?: CSSProperties
  testId?: string
}): ReactElement {
  const service = resolveService(account ?? provider ?? '')
  return service.renderIcon({ size, className, style, testId })
}

export function resolveAccountAvatarUrl(account: AccountLike): string | null {
  if (typeof account.avatarUrl === 'string' && account.avatarUrl.trim().length > 0) {
    return account.avatarUrl
  }
  if (typeof account.avatar_url === 'string' && account.avatar_url.trim().length > 0) {
    return account.avatar_url
  }

  const { host, login } = normalizeInput(account)
  if (login.length > 0 && (host === 'github.com' || host === 'github')) {
    return `https://github.com/${encodeURIComponent(login)}.png?size=64`
  }

  return null
}

export function AccountAvatar({
  account,
  size = 44,
  active = false,
  testId,
}: {
  account: AccountLike
  size?: number
  active?: boolean
  testId?: string
}): ReactElement {
  const [imgFailed, setImgFailed] = useState(false)
  const avatarUrl = resolveAccountAvatarUrl(account)
  const showImage = Boolean(avatarUrl) && !imgFailed

  return (
    <span
      className={`avatar avatar--lg${active ? ' avatar--active' : ''}`}
      title={`Avatar for ${account.login || account.provider || 'account'}`}
      data-testid={testId ?? 'account-avatar'}
      data-active={active ? 'true' : undefined}
      style={{
        alignItems: 'center',
        background: 'var(--shell-canvas, rgba(128, 128, 128, 0.1))',
        border: active
          ? '2px solid var(--shell-accent, var(--accent, #6ea8fe))'
          : '1px solid color-mix(in srgb, currentColor 15%, transparent)',
        borderRadius: '50%',
        boxShadow: active
          ? '0 0 0 2px var(--shell-accent-muted, rgba(110, 168, 254, 0.25)), 0 0 10px var(--shell-accent, #6ea8fe)'
          : 'none',
        display: 'inline-flex',
        height: size,
        justifyContent: 'center',
        overflow: 'hidden',
        width: size,
        flexShrink: 0,
        transition: 'box-shadow 150ms ease, border-color 150ms ease',
      }}
    >
      {showImage ? (
        <img
          src={avatarUrl ?? undefined}
          alt=""
          height={size}
          width={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{
            height: '100%',
            objectFit: 'cover',
            width: '100%',
          }}
        />
      ) : (
        <ServiceIcon account={account} size={Math.round(size * 0.625)} />
      )}
    </span>
  )
}
