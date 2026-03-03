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
  {
    name: 'Film Noir',
    promptPrefix: 'Reimagined as a 1940s film noir scene in high-contrast black and white. Hard light from a single bare bulb casts sharp venetian blind shadows across the composition. Fog drifts through the frame catching shafts of backlight. Shot on 35mm Kodak Double-X film stock, 50mm f/2 Summicron lens wide open, deep grain structure with crushed blacks and blown highlights.',
  },
  {
    name: 'Japanese Ukiyo-e',
    promptPrefix: 'Reimagined as a traditional Japanese ukiyo-e woodblock print from the Edo period. Flat areas of saturated color with bold black outlines and fine parallel hatching for texture. Delicate gradients achieved through bokashi printing technique. Muted indigo, vermillion, and pale jade green color palette on aged washi paper with visible fiber texture.',
  },
  {
    name: 'Cyberpunk Neon',
    promptPrefix: 'Reimagined as a rain-soaked cyberpunk night scene. Saturated neon signs in hot pink and electric blue reflect off wet asphalt and chrome surfaces. Dense atmospheric haze diffuses the light sources into soft haloes. Shot on Sony A1 with 24mm f/1.4 GM lens, long exposure at ISO 3200, chromatic aberration on the neon edges.',
  },
  {
    name: 'Botanical Illustration',
    promptPrefix: 'Reimagined as a detailed scientific botanical illustration from an 18th century natural history volume. Precise watercolor and ink rendering on cream laid paper with visible chain lines. Specimens arranged in taxonomic layout with fine cross-section details. Soft diffused north-facing window light, muted earth tones with precise color notation.',
  },
  {
    name: 'Infrared Photography',
    promptPrefix: 'Reimagined as a false-color infrared photograph where foliage glows brilliant white and skies turn deep obsidian black. Surreal tonal inversion with warm skin tones shifting to pale porcelain. Shot on a modified Nikon Z8 with 720nm IR filter, Nikkor 85mm f/1.8 lens, channel-swapped post-processing with ethereal halation around highlights.',
  },
  {
    name: 'Art Deco',
    promptPrefix: 'Reimagined as an Art Deco poster from 1920s Paris. Bold geometric forms with symmetrical sunburst patterns and stepped zigzag motifs. Luxurious metallic gold leaf accents against deep navy and black lacquer surfaces. Strong vertical composition with stylized Egyptian-revival elements, printed in lithograph with spot metallic inks on matte card stock.',
  },
  {
    name: 'Solarpunk',
    promptPrefix: 'Reimagined as a solarpunk utopia where organic architecture merges with lush vertical gardens and translucent solar membranes. Warm late-afternoon sunlight filters through canopy bridges and living moss walls, casting dappled green-gold patterns. Shot on Fujifilm GFX 100S with 32-64mm f/4 lens, Fuji Velvia color profile with rich greens and amber highlights.',
  },
]
