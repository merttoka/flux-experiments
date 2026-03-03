export interface StylePreset {
  name: string
  promptPrefix: string
}

export function blendPrompts(presetA: StylePreset, presetB: StylePreset, weight: number, promptA: string, promptB: string): string {
  // weight = % for preset A (0-100)
  if (presetA.name === presetB.name || weight >= 95) {
    return promptA
  }
  if (weight <= 5) {
    return promptB
  }

  const a = presetA.name
  const b = presetB.name
  let blendInfo: string

  if (weight >= 75) {
    blendInfo = `Primarily in the style of ${a}. Subtle hints of ${b}.`
  } else if (weight > 55) {
    blendInfo = `Blending ${a} with ${b}, leaning more toward ${a}.`
  } else if (weight >= 45) {
    blendInfo = `An equal blend of ${a} and ${b} styles.`
  } else if (weight > 25) {
    blendInfo = `Blending ${b} with ${a}, leaning more toward ${b}.`
  } else {
    blendInfo = `Primarily in the style of ${b}. Subtle hints of ${a}.`
  }

  return `${blendInfo}\n${a}: ${promptA.trim()}\n${b}: ${promptB.trim()}`
}

export const presets: StylePreset[] = [
  {
    name: 'Bioluminescent Deep Sea',
    promptPrefix: 'Reimagined as an underwater deep-sea scene with bioluminescent organisms casting soft cyan and violet light through dark ocean water. Volumetric caustic light rays filter down from above. Shot with underwater housing on a Sony A7IV, 35mm f/1.4 lens, long exposure capturing light trails from drifting jellyfish and plankton.',
  },
  {
    name: 'Brutalist Architecture',
    promptPrefix: 'Reimagined as a monumental brutalist concrete structure with bold geometric forms and exposed aggregate surfaces. Harsh directional afternoon sunlight creates deep angular shadows across repeating modular facades. Shot on Hasselblad X2D with 45mm f/3.5 lens, high contrast black and white with subtle warm toning.',
  },
  {
    name: 'Oil Painting (Dutch Masters)',
    promptPrefix: 'Reimagined as a Dutch Golden Age oil painting with rich chiaroscuro lighting. Warm Rembrandt lighting from the upper left illuminates the subject against a deep umber background. Visible brushstrokes in impasto technique, craquelure texture on the surface, gallery-lit with soft museum spotlights. Oil on canvas, 17th century masterwork.',
  },
  {
    name: 'Microscopic Biology',
    promptPrefix: 'Reimagined as a scanning electron microscope photograph of cellular structures. False-color scientific visualization in cyan and magenta tones. Extreme magnification revealing intricate organic textures, membrane surfaces, and filament networks. Clinical laboratory lighting, sharp depth of field, published in Nature journal.',
  },
  {
    name: 'Retro-Futurism',
    promptPrefix: 'Reimagined as a 1970s science fiction book cover illustration. Warm analog color palette with burnt orange, mustard yellow, and deep teal. Retro-futuristic technology with toggle switches and CRT displays. Painted in gouache and airbrush technique by Syd Mead, soft atmospheric perspective, lens flare from a distant star.',
  },
]
