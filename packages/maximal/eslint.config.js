import { service } from "@stuffbucket/eslint-config/service"

export default [
  ...service({
    tsconfigRootDir: import.meta.dirname,
    // Every entry must name something that EXISTS here. `.opencode/**` and
    // `landing/**` used to sit in this list and name nothing -- both were
    // inherited from the pre-split repo, and an ignore for an absent tree
    // reads as policy while enforcing nothing. maximal-core's config had the
    // same class of entry removed already; these were the last two. Verify
    // with `ls` before adding one.
    ignores: [
      // A separate Electron package with its own tsconfig, prettier
      // conventions and eslint config. Linting it from here would apply this
      // package's formatting to files that deliberately use another.
      "client/**",
      "contrib/**",
      "docs/**",
      "scripts/**",
      // The Pages site: built by bun against its own lockfile, not a
      // workspace member.
      "site/**",
    ],
  }),
]
