import { ProviderGateway, ProviderOperation, ProviderDispatch } from '@stuffbucket/maximal-provider-contract';
import { Hono } from 'hono';
import { CommandDef } from 'citty';

interface ProviderPluginConfig {
    readonly enabled?: boolean;
    readonly config?: unknown;
}
interface ProviderCompatibilityModelConfig {
    readonly temperature?: number;
    readonly topP?: number;
    readonly topK?: number;
}
/**
 * A validated compatibility-provider entry. Missing `type` means `anthropic`
 * and missing `enabled` means enabled, matching Core's legacy semantics.
 * Consumers must reject any explicit type they do not support.
 */
interface ProviderCompatibilityConfig {
    readonly type?: string;
    readonly enabled?: boolean;
    readonly baseUrl?: string;
    readonly apiKey?: string;
    readonly authType?: "authorization" | "x-api-key";
    readonly models?: Readonly<Record<string, ProviderCompatibilityModelConfig>>;
    readonly adjustInputTokens?: boolean;
}
type ProviderHostConfigFailureReason = "parse" | "read" | "unknown" | "validation";
type ProviderHostConfigStatus = {
    readonly state: "ready";
} | {
    readonly state: "error";
    /** Bounded classification only; raw errors and config contents stay in Core. */
    readonly reason: ProviderHostConfigFailureReason;
};
interface ProviderHostConfigSnapshot {
    readonly appDataDirectory: string;
    readonly defaultProfileDirectory: string;
    readonly configStatus: ProviderHostConfigStatus;
    readonly providerHost: {
        readonly mode: "legacy" | "dsh";
        readonly profileDirectory?: string;
    };
    readonly providers: Readonly<Record<string, ProviderCompatibilityConfig>>;
    readonly providerPlugins?: Readonly<Record<string, ProviderPluginConfig>>;
}
type ProviderHostConfigListener = (snapshot: ProviderHostConfigSnapshot) => void;
interface ProviderHostConfigSource {
    getSnapshot(): ProviderHostConfigSnapshot;
    subscribe(listener: ProviderHostConfigListener): () => void;
    dispose(): Promise<void>;
}
interface ProviderGatewayFactoryContext {
    config: ProviderHostConfigSnapshot;
    configSource: ProviderHostConfigSource;
}
type ProviderGatewayFactory = (context: ProviderGatewayFactoryContext) => ProviderGateway | Promise<ProviderGateway>;

/**
 * Typed value space for the auth/account domain (boundary D1).
 *
 * These types close the value space so invalid auth/account values are
 * unrepresentable rather than caught at runtime:
 *   - `AccountType` is a closed enum, not a free string interpolated into a
 *     hostname (a typo like "enterpise" can no longer silently produce
 *     `https://api.enterpise.githubcopilot.com`).
 *   - `CopilotHost` is a branded, validated https origin — the only way to
 *     obtain one is through `toCopilotHost`/`hostForAccountType`, so a raw
 *     unvalidated string can't reach the completion-host slot.
 *
 * Forward note: `AccountType` already gates the host fallback (see
 * `hostForAccountType`) and `CopilotHost` brands `state.copilotApiUrl`. A
 * later phase folds them into the `signed-in` variant of the auth-controller's
 * `AuthState` union (`plan: AccountType`, `host: CopilotHost`); they live here
 * so that phase shares this source of truth rather than redefining them.
 */

declare const ACCOUNT_TYPES: readonly ["individual", "business", "enterprise"];
type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * `runServer` — the boot orchestrator for `maximal start`.
 *
 * Each phase is a single line of intent: port preflight, config merge,
 * boot logger, secrets, upstream bootstrap, claude-code helper, bind,
 * pidfile, post-bind reconcile, shutdown handlers. Implementation lives
 * in sibling modules (port.ts, boot-io.ts, bootstrap.ts, shutdown.ts,
 * claude-code-flow.ts) so this file reads as a checklist.
 */

interface RunServerOptions {
    port: number;
    verbose: boolean;
    accountType: AccountType;
    manual: boolean;
    rateLimit?: number;
    rateLimitWait: boolean;
    githubToken?: string;
    claudeCode: boolean;
    showToken: boolean;
    proxyEnv: boolean;
    /** Evict any running instance on :4141 before binding. Optional —
     *  test fixtures + non-CLI callers can omit; treated as false. */
    replace?: boolean;
    /** Port for the private control plane (maximal-core#10). Defaults to 0 —
     *  ephemeral — because nothing external is meant to find it; a supervisor
     *  learns the bound value from the ready-line. */
    controlPort?: number;
    /** Optional prebuilt provider boundary. Omit for standalone legacy mode. */
    providerGateway?: ProviderGateway;
    /**
     * Lazy host-owned provider boundary. Called only by `start`, only after config
     * validation, and only when `providerHost.mode` is `dsh`.
     */
    createProviderGateway?: ProviderGatewayFactory;
}

interface ApiKeyEntry {
    id: string;
    label: string;
    key: string;
    enabled: boolean;
    created_at: string;
}
interface AppConfig {
    auth?: {
        /** Legacy free-form list of accepted bearer tokens. */
        apiKeys?: Array<string>;
        /** Structured registry managed by Settings → API clients. */
        apiKeyEntries?: Array<ApiKeyEntry>;
        /** When true, only requests with a known enabled key are accepted. */
        enforce?: boolean;
    };
    providers?: Record<string, ProviderConfig>;
    providerHost?: {
        mode?: "legacy" | "dsh";
        profileDirectory?: string;
    };
    providerPlugins?: Record<string, {
        enabled?: boolean;
        config?: unknown;
    }>;
    extraPrompts?: Record<string, string>;
    smallModel?: string;
    responsesApiContextManagementModels?: Array<string>;
    /**
     * Copilot/OpenAI-Responses-specific server-side prefix-cache retention for
     * the `/responses` path. UNSET (undefined) → param is not sent, behavior
     * unchanged. "24h" keeps the cached prefix alive up to 24h (default is a
     * few minutes); cached input tokens are ~10x cheaper. Opt-in because some
     * model/endpoint combos have historically 400'd on this param — enablement
     * is made safe by a one-shot strip-and-retry fallback in create-responses.ts.
     * NOTE: independent from `store` (which controls response persistence/ZDR).
     */
    promptCacheRetention?: "in_memory" | "24h";
    modelReasoningEfforts?: Record<string, "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">;
    useFunctionApplyPatch?: boolean;
    useMessagesApi?: boolean;
    anthropicApiKey?: string;
    useResponsesApiWebSearch?: boolean;
    claudeTokenMultiplier?: number;
    logRetentionDays?: number;
    /**
     * How many days of `token_usage_events` rows to keep; older rows are pruned on
     * boot and daily. 0 disables pruning (keep forever). Defaults to
     * DEFAULT_TOKEN_USAGE_RETENTION_DAYS (365) — roughly tens of MB/year at typical
     * volume, so a year is cheap while still bounding unbounded growth.
     */
    tokenUsageRetentionDays?: number;
    /**
     * Opt-in: when true, a fatal Copilot rejection may AUTO-SWITCH to another
     * previously-successful account without a per-event prompt. Defaults OFF —
     * enabling it is the user's PRIOR AUTHORIZATION that all their stored accounts
     * are interchangeable (same data governance), since same-plan accounts can
     * still differ in tenancy/residency/retention. Off → degrade + surface the
     * reason; the user picks. See auth-recovery.ts.
     */
    autoRecoverAccount?: boolean;
    /**
     * Whether to check for a newer maximal release and surface it (Settings line
     * + a once-per-day OS notification). Defaults ON; set false to opt out of the
     * GitHub releases ping entirely. See update-check.ts.
     *
     * This knob governs the update *notification* and nothing else. The other
     * reader of the same manifest — the minimum-supported-version floor — has its
     * own knob, {@link AppConfig.enforceVersionFloor}, so a user who wants zero
     * outbound calls turns off both and gets exactly that.
     */
    checkUpdates?: boolean;
    /**
     * Whether the proxy enforces the release manifest's `min_supported_version`
     * (maximal-core#7): when the running build is below its channel's floor, the
     * upstream-touching routes refuse with `426 build_retired`. Defaults ON.
     *
     * Its own key rather than a reuse of `checkUpdates` because the two are
     * different promises. `checkUpdates` was documented as disabling the release
     * ping entirely, and silently narrowing a documented network opt-out is worse
     * than the coverage it would buy — somebody set that flag to stop outbound
     * calls and will not read a changelog to find out it stopped meaning that.
     * Separating them keeps the security control on for everyone who has not
     * opted out, while leaving an explicit, per-purpose way to opt out.
     *
     * Turning it off cannot break the proxy: the floor is fail-open, so `false`
     * only skips the fetch and the check. See update-check.ts `checkVersionFloor`
     * and lib/update/version-gate.ts.
     */
    enforceVersionFloor?: boolean;
    editorVersion?: string;
    apps?: AppsConfig;
    server?: ServerConfig;
    ui?: {
        /**
         * When true, Maximal lives ONLY in the macOS menu bar / Windows system
         * tray. Absent or false (the default) also shows it in the Dock on
         * macOS / the taskbar on Windows. See the Rust shell + Settings UI.
         */
        menuBarOnly?: boolean;
    };
}
/**
 * What to do when the port we were asked to bind is already held.
 *
 * - `next` — scan upward for the first free port and bind that. The default:
 *   a second instance starting is far more common than a port being sacred,
 *   and failing to launch is a worse outcome than launching somewhere else.
 * - `fail` — report who holds it and exit 1. Right when something downstream
 *   has the port hardcoded and a silent move would be worse than not starting.
 * - `replace` — evict a *maximal* instance holding it, then bind. Never evicts
 *   a foreign process; that case falls back to `fail`.
 */
type PortPolicy = "next" | "fail" | "replace";
interface ServerConfig {
    /** How to react to a busy port. Defaults to `DEFAULT_PORT_POLICY`. */
    portPolicy?: PortPolicy;
}
interface AppsConfig {
    claudeCode?: {
        /** Proxy routing applied to Claude Code (env.ANTHROPIC_BASE_URL in
         *  ~/.claude/settings.json). */
        enabled?: boolean;
    };
    claudeDesktop?: {
        /** Proxy config applied to Claude Desktop. */
        enabled?: boolean;
    };
}
interface ModelConfig {
    temperature?: number;
    topP?: number;
    topK?: number;
}
type ProviderAuthType = "authorization" | "x-api-key";
interface ProviderConfig {
    type?: string;
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    authType?: ProviderAuthType;
    models?: Record<string, ModelConfig>;
    adjustInputTokens?: boolean;
}

interface ProviderDispatchOptions {
    legacy: () => Promise<Response>;
    operation: ProviderOperation;
    provider: string;
    request: ProviderDispatch["request"];
    signal: ProviderDispatch["signal"];
}
interface ProviderDispatcher {
    dispatch(options: ProviderDispatchOptions): Promise<Response>;
    dispose(): Promise<void>;
    ready(): Promise<void>;
    requiresGithubAuth(): boolean;
}

interface CreateServerAppsOptions {
    createProviderGateway?: ProviderGatewayFactory;
    providerConfigSource?: ProviderHostConfigSource;
    providerGateway?: ProviderGateway;
    readConfig?: () => AppConfig;
    requestShutdown?: (reason: string) => void;
}
interface ServerApps {
    controlApp: Hono;
    providerDispatcher: ProviderDispatcher;
    publicApp: Hono;
}

declare const cliArgs: {
    readonly apiKeyHelper: {
        readonly type: "string";
        readonly description: string;
    };
    readonly "api-home": {
        readonly type: "string";
        readonly description: string;
    };
    readonly "oauth-app": {
        readonly type: "string";
        readonly description: "OAuth app identifier.";
    };
    readonly "enterprise-url": {
        readonly type: "string";
        readonly description: "Enterprise URL for GitHub.";
    };
};
interface CliCompositionOptions {
    /**
     * Lazy start-only provider boundary. Core invokes it only after validated
     * config explicitly selects DSH mode.
     */
    createProviderGateway?: ProviderGatewayFactory;
}
interface RunCliOptions extends CliCompositionOptions {
    /** Command arguments without the runtime executable and script path. */
    rawArgs?: Array<string>;
}
/**
 * Construct the complete Maximal command tree. Every command stays a lazy thunk;
 * in particular, carrying a provider factory does not import the start stack or
 * activate an external profile while another command is running.
 */
declare function createMain(options?: CliCompositionOptions): Promise<CommandDef<typeof cliArgs>>;
/**
 * Run the real Maximal CLI with an optional lazy provider host.
 *
 * Global environment overrides are applied before any environment-sensitive
 * Core module is imported. Electron fetch binding follows that prelude exactly
 * as it does in the standalone binary.
 */
declare function runCli(options?: RunCliOptions): Promise<void>;

/** Load the environment-sensitive start stack only when a caller starts it. */
declare function runServer(options: RunServerOptions): Promise<void>;
/** Load the environment-sensitive server graph only when explicitly requested. */
declare function createServerApps(options?: CreateServerAppsOptions): Promise<ServerApps>;

export { type CliCompositionOptions, type CreateServerAppsOptions, type ProviderCompatibilityConfig, type ProviderCompatibilityModelConfig, type ProviderGatewayFactory, type ProviderGatewayFactoryContext, type ProviderHostConfigFailureReason, type ProviderHostConfigSnapshot, type ProviderHostConfigSource, type ProviderHostConfigStatus, type RunCliOptions, type RunServerOptions, type ServerApps, createMain, createServerApps, runCli, runServer };
