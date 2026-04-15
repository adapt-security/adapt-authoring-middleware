export default {
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'eslint' }],
    ['@semantic-release/release-notes-generator', { preset: 'eslint' }],
    ['@semantic-release/npm', { provenance: true }],
    '@semantic-release/github',
    ['@semantic-release/git', {
      assets: ['package.json'],
      message: 'Chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
    }]
  ]
}
