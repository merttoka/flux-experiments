import { setupWebGPU } from '../shared/wgpu'
import agentsWGSL from './agents.wgsl?raw'
import dofWGSL from './dof.wgsl?raw'

export interface SimHandle {
  cleanup: () => void
  getFrame: () => number
  canvas: HTMLCanvasElement
}

export async function init(canvas: HTMLCanvasElement, resolution = 640): Promise<SimHandle> {
  const size = resolution
  // Scale agent count proportionally to area (200k for 1024x1024)
  const baseArea = 1024 * 1024
  const count = Math.floor(200000 * (size * size) / baseArea)
  const S = { count, width: size, height: size, frame: 0 }

  const wgpu = await setupWebGPU(canvas, S.width, S.height)

  // Init agents buffer
  const stride = 12
  const agents = new Float32Array(S.count * stride)
  for (let i = 0; i < S.count; i++) {
    let offset = 0
    agents[i * stride + offset++] = 0.1
    agents[i * stride + offset++] = 0.1
    agents[i * stride + offset++] = 0.1
    agents[i * stride + offset++] = 1
    agents[i * stride + offset++] = Math.random() * S.width
    agents[i * stride + offset++] = Math.random() * S.height
    agents[i * stride + offset++] = 0
    agents[i * stride + offset++] = 0
    agents[i * stride + offset++] = 0
    agents[i * stride + offset++] = 1
    agents[i * stride + offset++] = -1
    // stride slot 11 unused
  }
  const agentsBuffer = wgpu.createAndSetBuffer(agents, GPUBufferUsage.STORAGE)

  // Init positions buffer
  const posCount = S.width * S.height
  const ids = new Float32Array(posCount)
  for (let i = 0; i < posCount; i++) ids[i] = -1
  const positionsBuffer = wgpu.createAndSetBuffer(ids, GPUBufferUsage.STORAGE)

  // Init color buffer
  const colorStride = 4
  const colors = new Float32Array(posCount * colorStride)
  for (let i = 0; i < posCount; i++) {
    colors[i * colorStride + 0] = 0
    colors[i * colorStride + 1] = 0
    colors[i * colorStride + 2] = 0
    colors[i * colorStride + 3] = 255
  }
  const colorBuffer = wgpu.createAndSetBuffer(colors, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)

  // Uniforms
  const uniforms = new Float32Array([S.width, S.height, S.count, 3])
  const uniformBuffer = wgpu.createAndSetBuffer(uniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  // DOF settings
  const dofUniforms = new Float32Array([0.9, 1.4, 0.8, 30])
  const dofBuffer = wgpu.createAndSetBuffer(dofUniforms, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)

  // Textures
  const outTexture = wgpu.createTexture(S.width, S.height)
  const dlaTexRead = wgpu.createTexture(S.width, S.height)
  const dlaTexWrite = wgpu.createTexture(S.width, S.height)

  // Pipelines
  const agentBehavior = wgpu.createComputePipeline(agentsWGSL, 'main')
  const computeBindGroup = wgpu.createBindGroup({
    pipeline: agentBehavior, group: 0,
    bindings: [uniformBuffer, agentsBuffer, positionsBuffer, dlaTexRead.createView(), dlaTexWrite.createView()],
  })

  const parent = wgpu.createComputePipeline(agentsWGSL, 'parent')
  const parentBindGroup = wgpu.createBindGroup({ pipeline: parent, group: 0, bindings: [agentsBuffer] })

  const fade = wgpu.createComputePipeline(agentsWGSL, 'fade')
  const fadeBindGroup = wgpu.createBindGroup({ pipeline: fade, group: 0, bindings: [colorBuffer] })

  const dof = wgpu.createComputePipeline(dofWGSL, 'dof')
  const dofBindGroup = wgpu.createBindGroup({ pipeline: dof, group: 0, bindings: [uniformBuffer, agentsBuffer, colorBuffer, dofBuffer] })

  const copy = wgpu.createComputePipeline(dofWGSL, 'copy')
  const copyBindGroup = wgpu.createBindGroup({ pipeline: copy, group: 0, bindings: [uniformBuffer, colorBuffer, outTexture.createView()] })

  const resetTex = wgpu.createComputePipeline(agentsWGSL, 'reset')
  const resetTexBindGroup = wgpu.createBindGroup({ pipeline: resetTex, group: 0, bindings: [dlaTexWrite.createView()] })

  // Run reset
  const encoder0 = wgpu.device.createCommandEncoder()
  wgpu.dispatchComputePass({
    pipeline: resetTex, bindGroup: resetTexBindGroup,
    workGroups: [Math.ceil(S.width / 16), Math.ceil(S.height / 16), 1], encoder: encoder0,
  })
  wgpu.device.queue.submit([encoder0.finish()])

  const dispatchRenderPass = wgpu.drawTextureToCanvasPass(outTexture)

  let frame = 0
  let running = true

  const draw = () => {
    if (!running) return
    const encoder = wgpu.device.createCommandEncoder()

    wgpu.dispatchComputePass({ pipeline: agentBehavior, bindGroup: computeBindGroup, workGroups: [Math.ceil(S.count / 256), 1, 1], encoder })
    encoder.copyTextureToTexture({ texture: dlaTexWrite }, { texture: dlaTexRead }, { width: S.width, height: S.height })
    wgpu.dispatchComputePass({ pipeline: parent, bindGroup: parentBindGroup, workGroups: [Math.ceil(S.count / 256), 1, 1], encoder })
    wgpu.dispatchComputePass({ pipeline: dof, bindGroup: dofBindGroup, workGroups: [Math.ceil(S.count / 256), 1, 1], encoder })
    wgpu.dispatchComputePass({ pipeline: copy, bindGroup: copyBindGroup, workGroups: [Math.ceil(S.width / 16), Math.ceil(S.height / 16), 1], encoder })
    wgpu.dispatchComputePass({ pipeline: fade, bindGroup: fadeBindGroup, workGroups: [Math.ceil((S.width * S.height) / 256), 1, 1], encoder })

    dispatchRenderPass(encoder)
    wgpu.device.queue.submit([encoder.finish()])

    uniforms[3]++
    frame++
    wgpu.device.queue.writeBuffer(uniformBuffer, 0, uniforms)

    requestAnimationFrame(draw)
  }
  draw()

  return {
    cleanup: () => {
      running = false
      wgpu.device.destroy()
    },
    getFrame: () => frame,
    canvas,
  }
}
