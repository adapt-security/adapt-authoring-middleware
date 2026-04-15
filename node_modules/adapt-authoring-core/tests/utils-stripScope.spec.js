import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { stripScope } from '../lib/utils/stripScope.js'

describe('stripScope()', () => {
  it('should strip a single-word scope', () => {
    assert.equal(stripScope('@myorg/my-package'), 'my-package')
  })

  it('should strip a hyphenated scope', () => {
    assert.equal(stripScope('@my-org/my-package'), 'my-package')
  })

  it('should strip a scope containing a dot', () => {
    assert.equal(stripScope('@my.org/my-package'), 'my-package')
  })

  it('should strip a scope containing an underscore', () => {
    assert.equal(stripScope('@my_org/my-package'), 'my-package')
  })

  it('should strip a scope containing numbers', () => {
    assert.equal(stripScope('@org123/my-package'), 'my-package')
  })

  it('should return an unscoped name unchanged', () => {
    assert.equal(stripScope('my-package'), 'my-package')
  })

  it('should return a short name unchanged', () => {
    assert.equal(stripScope('lodash'), 'lodash')
  })

  it('should return an empty string unchanged', () => {
    assert.equal(stripScope(''), '')
  })

  it('should return undefined unchanged', () => {
    assert.equal(stripScope(undefined), undefined)
  })

  it('should return null unchanged', () => {
    assert.equal(stripScope(null), null)
  })

  it('should handle scope with nested slashes in package name', () => {
    assert.equal(stripScope('@scope/name/extra'), 'name/extra')
  })

  it('should handle @ in the middle of a name', () => {
    assert.equal(stripScope('name@2.0.0'), 'name@2.0.0')
  })
})
