import { afterEach, describe, expect, it } from 'vite-plus/test'

import { readKeyPairs, readKeys } from './multi.ts'

const ORIGINAL_ENV = process.env

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('readKeys', () => {
  it('reads sequential numbered keys starting from the base name', () => {
    process.env = {
      DEEPSEEK_API_KEY: 'sk-one',
      DEEPSEEK_API_KEY_2: 'sk-two',
      DEEPSEEK_API_KEY_3: 'sk-three',
    }

    expect(readKeys('DEEPSEEK_API_KEY')).toEqual(['sk-one', 'sk-two', 'sk-three'])
  })

  it('returns an empty list when nothing is configured', () => {
    process.env = {}

    expect(readKeys('DEEPSEEK_API_KEY')).toEqual([])
  })

  it('stops at the first missing numbered key', () => {
    process.env = {
      DEEPSEEK_API_KEY: 'sk-one',
      DEEPSEEK_API_KEY_3: 'sk-three',
    }

    expect(readKeys('DEEPSEEK_API_KEY')).toEqual(['sk-one'])
  })

  it('trims whitespace from values', () => {
    process.env = { DEEPSEEK_API_KEY: '  sk-one  ' }

    expect(readKeys('DEEPSEEK_API_KEY')).toEqual(['sk-one'])
  })
})

describe('readKeyPairs', () => {
  it('reads sequential key/secret pairs with matching suffixes', () => {
    process.env = {
      VOLC_ACCESS_KEY_ID: 'AK-one',
      VOLC_SECRET_KEY: 'SK-one',
      VOLC_ACCESS_KEY_ID_2: 'AK-two',
      VOLC_SECRET_KEY_2: 'SK-two',
    }

    expect(readKeyPairs('VOLC_ACCESS_KEY_ID', 'VOLC_SECRET_KEY')).toEqual([
      { key: 'AK-one', secret: 'SK-one' },
      { key: 'AK-two', secret: 'SK-two' },
    ])
  })

  it('skips incomplete pairs but keeps reading later ones', () => {
    process.env = {
      VOLC_ACCESS_KEY_ID: 'AK-one',
      VOLC_SECRET_KEY: 'SK-one',
      VOLC_ACCESS_KEY_ID_2: 'AK-two', // 缺 secret，跳过
      VOLC_SECRET_KEY_3: 'SK-three',
      VOLC_ACCESS_KEY_ID_3: 'AK-three',
    }

    expect(readKeyPairs('VOLC_ACCESS_KEY_ID', 'VOLC_SECRET_KEY')).toEqual([
      { key: 'AK-one', secret: 'SK-one' },
      { key: 'AK-three', secret: 'SK-three' },
    ])
  })

  it('stops at the first missing numbered group', () => {
    process.env = {
      VOLC_ACCESS_KEY_ID: 'AK-one',
      VOLC_SECRET_KEY: 'SK-one',
      VOLC_ACCESS_KEY_ID_4: 'AK-four',
      VOLC_SECRET_KEY_4: 'SK-four',
    }

    expect(readKeyPairs('VOLC_ACCESS_KEY_ID', 'VOLC_SECRET_KEY')).toEqual([
      { key: 'AK-one', secret: 'SK-one' },
    ])
  })
})
