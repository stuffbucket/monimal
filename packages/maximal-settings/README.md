# Settings Contract

- Consumers MUST import runtime APIs from `@stuffbucket/maximal-settings`.
- Consumers MUST provide the schema, application name, environment prefix,
  environment values, absolute home directory, and absolute working directory.
- Schemas and defaults MUST describe JSON objects; schema validation MUST NOT
  perform external side effects.
- Consumers MUST disable project loading for untrusted working directories.
- Consumers MUST treat defaults, legacy files, user settings, project settings,
  transient mutations, environment values, and CLI values as distinct layers,
  in that ascending precedence order.
- Consumers MAY override the absolute user and project file locations.
- Consumers MUST use `--setting path=value` for CLI overrides and the configured
  prefix plus uppercase snake-case schema paths for environment overrides.
- Consumers MUST forward `remainingArgs` when another CLI parser follows resolution.
- Consumers MUST NOT mutate snapshots or infer persistence from effective values.

## Resolution

- Consumers MAY call `loadSettings` for a fresh, stateless read.
- Consumers MAY call `resolveSettingsEnvironment(schema, stored, { prefix, values })`
  when only a validated environment overlay is needed.
- Consumers MUST treat invalid types, ambiguous environment names, malformed
  documents, duplicate CLI paths, and unknown CLI paths as configuration errors.
- Consumers MUST NOT expect arrays from separate layers to concatenate.
- Consumers MUST use `origins` to distinguish effective sources and `files` to
  identify successfully loaded documents.

## Singleton Store

- Consumers MUST acquire a typed store with `getSettingsStore`, a stable
  `instanceId`, and one `memory`, `user`, or `project` persistence policy per
  declared setting path.
- Repeated acquisition MUST use equivalent configuration, the same schema
  instance, and the same listener-error handler.
- Consumers MUST NOT create a second logical owner for an already registered
  writable file; conflicting identities MUST fail instead of forking state.
- Consumers MUST scope singleton assumptions to one JavaScript realm; separate
  processes MUST coordinate persisted mutations through the document store.
- Consumers MUST await `create`, `update`, `delete`, and `refresh`.
- CRUD existence checks MUST refer to the configured mutation layer, not the
  effective CLI/environment overlay.
- Consumers MUST call `refresh` to adopt external file changes; they MUST NOT
  assume automatic filesystem watching or cross-process notifications.
- Consumers MUST unsubscribe listeners when their owning component is disposed.
- Consumers MUST handle listener failures through `onListenerError`; listener
  failures MUST NOT be interpreted as failed disk commits.

## Document Store

- Consumers MAY use `getJsonDocumentStore({ namespace, filePath })` independently
  of typed settings resolution.
- Consumers MUST use absolute JSON paths and trusted, application-controlled
  directories; hostile directory replacement is outside this API's boundary.
- Writers MUST use `create`, `update`, `transact`, or `delete` consistently;
  direct competing filesystem writers MUST NOT be considered lock participants.
- Mutation callbacks MUST be synchronous, bounded, and free of external effects.
- Consumers MUST NOT pass effective settings snapshots as saved documents.
- Consumers MUST NOT store documents larger than 1 MiB, executable configuration,
  import directives, prototype keys, or non-JSON values.
- Consumers MUST treat file locks as cooperating-writer coordination, not an
  authorization mechanism or a distributed-filesystem consistency guarantee.

## Migration

- Migration checks MUST use the exported `./migration` contract or the package
  `migration:check` command.
- New runtime environment readers and known settings-file references MUST fail
  the committed inventory; removals MUST lower it with `migration:update`.
- Reviews MUST NOT equate an inventory entry with a fully understood setting;
  dynamic reads and legacy bootstrap names MUST remain visible until migrated.
- Reviews MUST NOT claim all settings have migrated while the baseline is nonempty.
- Schema and consumer changes MUST retain public-contract and consumer coverage.