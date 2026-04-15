/**
 * Strips the npm scope prefix from a package name (e.g. '@cgkineo/adapt-authoring-foo' becomes 'adapt-authoring-foo')
 * @param {string} name - The package name
 * @returns {string} The name without scope prefix
 */
export function stripScope (name) {
  if (typeof name === 'string' && name.startsWith('@')) {
    return name.replace(/^@[^/]+\//, '')
  }
  return name
}
