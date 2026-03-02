export interface GrowthStage {
  minFrame: number
  label: string
  prompt: string
}

export const stages: GrowthStage[] = [
  {
    minFrame: 0,
    label: 'Nucleation',
    prompt: 'Microscopic view of crystal seed formation, sparse luminous particles coalescing in dark void, extreme macro photography',
  },
  {
    minFrame: 300,
    label: 'Early Growth',
    prompt: 'Budding coral colony, delicate mineral branches extending outward from central nucleus, underwater macro, soft bioluminescence',
  },
  {
    minFrame: 1500,
    label: 'Branching',
    prompt: 'Dense fractal dendritic network, branching crystalline structures resembling neural pathways, electron microscope, blue-white glow',
  },
  {
    minFrame: 4000,
    label: 'Mature Ecosystem',
    prompt: 'Ancient crystalline forest canopy seen from above, massive interconnected dendritic structures, bioluminescent ecosystem, aerial photography',
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
