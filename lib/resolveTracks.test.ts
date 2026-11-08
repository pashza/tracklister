import { describe, expect, it } from 'vitest'
import { pickDisplayTitle } from './resolveTracks'

describe('pickDisplayTitle', () => {
  it('keeps the remix the DJ played when iTunes returns another version', () => {
    expect(pickDisplayTitle('Hey Boy, Hey Girl (ID Remix)', 'Hey Boy Hey Girl (ARTBAT Remix)')).toBe(
      'Hey Boy, Hey Girl (ID Remix)',
    )
    expect(pickDisplayTitle('Titan', 'Titan (Steve Mulder & Gabriel Ben Remix)')).toBe('Titan')
  })

  it('uses the iTunes spelling for the same version', () => {
    expect(pickDisplayTitle('Return To The Source', 'Return To the Source')).toBe('Return To the Source')
    expect(pickDisplayTitle('Fired Up! (Stirling remix)', 'Fired Up! (Stirling Remix) [feat. X]')).toBe(
      'Fired Up! (Stirling Remix) [feat. X]',
    )
    expect(pickDisplayTitle('Glue', undefined)).toBe('Glue')
  })
})
