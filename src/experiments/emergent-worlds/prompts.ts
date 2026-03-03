export interface GrowthStage {
  minFrame: number
  label: string
  prompt: string
}

export const stages: GrowthStage[] = [
  {
    minFrame: 0,
    label: 'Nucleation',
    prompt: 'A sparse cluster of luminous crystal seed particles coalescing in an infinite dark void. Extreme macro photography at 100x magnification, shallow depth of field with soft bokeh. Single point light source creating delicate rim lighting on each crystalline facet. Shot on Hasselblad with extension tubes, Fuji Velvia color science with deep blacks and saturated highlights.',
  },
  {
    minFrame: 300,
    label: 'Early Growth',
    prompt: 'A budding coral colony with delicate mineral branches extending outward from a central calcified nucleus. Soft bioluminescent glow in cyan and pale violet emanates from the growing tips. Underwater macro photography with a 105mm f/2.8 lens in a Nauticam housing, gentle blue ambient fill light from above, particles of marine snow drifting through the frame.',
  },
  {
    minFrame: 1500,
    label: 'Branching',
    prompt: 'A dense fractal dendritic network of branching crystalline structures resembling neural pathways and river deltas. Cool blue-white luminescence pulses through interconnected nodes. Scanning electron microscope aesthetic with false-color enhancement in ice blue and warm amber. Clinical directional lighting revealing intricate surface topology, extreme depth of field.',
  },
  {
    minFrame: 4000,
    label: 'Mature Ecosystem',
    prompt: 'An ancient crystalline forest canopy viewed from above, massive interconnected dendritic structures forming a sprawling bioluminescent ecosystem. Thousands of glowing nodes pulse with soft amber and cyan light across the organic network. Aerial photography at golden hour with warm rim lighting from the horizon, shot on Phase One IQ4 150MP with 55mm f/2.8 lens, tilt-shift miniature effect.',
  },
]

export function getStageForFrame(frame: number): GrowthStage {
  let current = stages[0]
  for (const stage of stages) {
    if (frame >= stage.minFrame) current = stage
    else break
  }
  return current
}
