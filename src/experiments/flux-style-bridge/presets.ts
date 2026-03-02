export interface StylePreset {
  name: string
  promptPrefix: string
}

export const presets: StylePreset[] = [
  {
    name: 'Bioluminescent Deep Sea',
    promptPrefix: 'underwater scene, bioluminescent organisms, dark ocean depths, ethereal glow,',
  },
  {
    name: 'Brutalist Architecture',
    promptPrefix: 'brutalist concrete structure, geometric forms, harsh directional light, monumental,',
  },
  {
    name: 'Oil Painting (Dutch Masters)',
    promptPrefix: 'oil painting in the style of Dutch Golden Age, Rembrandt lighting, rich chiaroscuro,',
  },
  {
    name: 'Microscopic Biology',
    promptPrefix: 'electron microscope photography, cellular structures, scientific visualization,',
  },
  {
    name: 'Retro-Futurism',
    promptPrefix: '1970s science fiction illustration, analog technology, warm color palette, retro-futuristic,',
  },
]
