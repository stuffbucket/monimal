export interface Gliner2ModelDefinition {
  readonly aliases: ReadonlyArray<string>
  readonly model: string
  readonly revision: string
  readonly weightBytes: number
  readonly weightSha256: string
}

export const GLINER2_MODELS: ReadonlyArray<Gliner2ModelDefinition> =
  Object.freeze([
    Object.freeze({
      aliases: Object.freeze([
        'gliner2.5-decide',
        'gliner25',
        'gliner25:340m',
      ]),
      model: 'fastino/GLiNER2.5-Decide',
      revision: '5a7adf72a23b4d311abae6ce050d7f0012bb3416',
      weightBytes: 1_945_828_140,
      weightSha256:
        '40a5a23ff860dc3dff426cecd1048cacdd29c648c96db209dad818e9686dc997',
    }),
    Object.freeze({
      aliases: Object.freeze(['gliner2.5-decide-1b', 'gliner25:1b']),
      model: 'fastino/GLiNER2.5-Decide-1B',
      revision: '688cd7ba8917a0855ad3ce929cba5a9998932e79',
      weightBytes: 4_755_208_228,
      weightSha256:
        '02c567d791aed26550d300064c7f0c0094fd65291503c65969b45b30786e33b3',
    }),
    Object.freeze({
      aliases: Object.freeze([
        'gliner2.5-multi-decide',
        'gliner25:multi',
      ]),
      model: 'fastino/GLiNER2.5-multi-Decide',
      revision: 'a35a0cd3b7a0f00f2effc576f454cd48fa98aa5f',
      weightBytes: 1_149_461_028,
      weightSha256:
        '9efe0f88c99f2aa794452e9559dc60e98d60d9fa2bf1b60cf2710411b6da5b4e',
    }),
  ])

function normalizedModel(model: string): string {
  return model.trim().toLowerCase().replace(/^fastino\//u, '')
}

export function resolveGliner2Model(model: string): Gliner2ModelDefinition {
  const normalized = normalizedModel(model)
  const definition = GLINER2_MODELS.find(
    (candidate) =>
      normalizedModel(candidate.model) === normalized
      || candidate.aliases.includes(normalized),
  )
  if (definition === undefined) {
    throw new Error(`Unsupported GLiNER2 model "${model}".`)
  }
  return definition
}
