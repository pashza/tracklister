import { describe, expect, it } from 'vitest'
import { parseTracklist } from './parse'

describe('parseTracklist', () => {
  it('parses SoundCloud-style timestamped tracklists', () => {
    const text = `Tracklist:
00:00 Bicep - Glue
[05:32] Fred again.. - Delilah (pull me out of this)
1:02:10 - Peggy Gou - (It Goes Like) Nanana
12. [1:10:00] Four Tet: Baby
Follow me https://instagram.com/someone
ID - ID
`
    expect(parseTracklist(text).map((track) => [track.artist, track.title])).toEqual([
      ['Bicep', 'Glue'],
      ['Fred again..', 'Delilah (pull me out of this)'],
      ['Peggy Gou', '(It Goes Like) Nanana'],
      ['Four Tet', 'Baby'],
    ])
  })

  it('drops label brackets from Essential Mix style lines', () => {
    const text = `Carl Cox @ Radio 1's Essential Mix (Vinyl Set, [UNVRS] Ibiza, Spain 2025-09-14) with tracklist

00:00:00 01. Jark Prongo - Convoy [PSSST (UNITED)]
00:45:00 11. Murk pres. Funky Green Dogs - Fired Up! (Stirling Remix) [TWISTED]
00:54:20 13. Valentino Kanzyani - House Soul
01:17:00 19. The Chemical Brothers - Hey Boy, Hey Girl (ID Remix) [VIRGIN]
Maga Bo - Balanco da Canoa (Chico Correa Remix)(Not On Label)
Bicep - Glue [Ninja Tune Records Edit]`
    expect(parseTracklist(text).map((track) => [track.artist, track.title])).toEqual([
      ['Jark Prongo', 'Convoy'],
      ['Murk pres. Funky Green Dogs', 'Fired Up! (Stirling Remix)'],
      ['Valentino Kanzyani', 'House Soul'],
      ['The Chemical Brothers', 'Hey Boy, Hey Girl (ID Remix)'],
      ['Maga Bo', 'Balanco da Canoa (Chico Correa Remix)'],
      ['Bicep', 'Glue [Ninja Tune Records Edit]'],
    ])
  })

  it('keeps the existing formats working', () => {
    const text = `CD 1
1. Asura: Le Dernier Voyage
Solar Fields - Sombrero
Circular ~ Shpongle
(Remix by Somebody)`
    expect(parseTracklist(text).map((track) => track.query)).toEqual([
      'Asura Le Dernier Voyage',
      'Solar Fields Sombrero',
      'Shpongle Circular (Remix by Somebody)',
    ])
  })
})
