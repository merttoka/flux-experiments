export interface WGPUContext {
  device: GPUDevice
  canvas: HTMLCanvasElement
  context: GPUCanvasContext
  format: GPUTextureFormat
  createBindGroup: (settings: BindGroupSettings) => GPUBindGroup
  createTexture: (width: number, height: number, usage?: number) => GPUTexture
  createAndSetBuffer: (data: Float32Array | Uint8Array, usage: number) => GPUBuffer
  createComputePipeline: (code: string, fn: string) => GPUComputePipeline
  drawTextureToCanvasPass: (texture: GPUTexture) => { dispatch: (encoder: GPUCommandEncoder) => void; setBgColor: (r: number, g: number, b: number) => void }
  dispatchComputePass: (settings: ComputePassSettings) => void
}

interface BindGroupSettings {
  pipeline: GPUComputePipeline | GPURenderPipeline
  group: number
  bindings: (GPUBuffer | GPUTextureView | GPUSampler)[]
}

interface ComputePassSettings {
  pipeline: GPUComputePipeline
  bindGroup: GPUBindGroup
  workGroups: number[]
  encoder: GPUCommandEncoder
  group?: number
}

export const setupWebGPU = async (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): Promise<WGPUContext> => {
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('No GPU adapter found')
  const device = await adapter.requestDevice()

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('webgpu')!
  const format: GPUTextureFormat = 'bgra8unorm'
  context.configure({ device, format, alphaMode: 'premultiplied' })

  const createShaderModule = (code: string, label?: string) => {
    return device.createShaderModule({ code, label })
  }

  const createTexture = (w: number, h: number, usage?: number) => {
    usage ??=
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT
    return device.createTexture({
      size: { width: w, height: h },
      format: 'rgba8unorm',
      usage,
    })
  }

  const createAndSetBuffer = (data: Float32Array | Uint8Array, usage: number) => {
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true,
    })
    if (data instanceof Float32Array) {
      new Float32Array(buffer.getMappedRange()).set(data)
    } else {
      new Uint8Array(buffer.getMappedRange()).set(data)
    }
    buffer.unmap()
    return buffer
  }

  const createComputePipeline = (code: string, fn: string) => {
    const sm = createShaderModule(code, fn)
    return device.createComputePipeline({
      layout: 'auto',
      compute: { module: sm, entryPoint: fn },
    })
  }

  const createBindGroup = (settings: BindGroupSettings) => {
    const entries: GPUBindGroupEntry[] = []
    for (let i = 0; i < settings.bindings.length; i++) {
      const entry = settings.bindings[i]
      let resource: GPUBindingResource
      if (entry instanceof GPUBuffer) {
        resource = { buffer: entry, size: entry.size, offset: 0 }
      } else {
        resource = entry as GPUTextureView | GPUSampler
      }
      entries.push({ binding: i, resource })
    }
    return device.createBindGroup({
      layout: (settings.pipeline as GPUComputePipeline).getBindGroupLayout(settings.group),
      entries,
    })
  }

  const drawTextureToCanvasPass = (texture: GPUTexture) => {
    const quadShader = createShaderModule(`
      @group(0) @binding(0) var samp : sampler;
      @group(0) @binding(1) var tex : texture_2d<f32>;

      struct VertexOutput {
        @builtin(position) Position : vec4f,
        @location(0) fragUV : vec2f,
      }

      @vertex
      fn vert(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
        const pos = array(
          vec2( 1.0,  1.0), vec2( 1.0, -1.0), vec2(-1.0, -1.0),
          vec2( 1.0,  1.0), vec2(-1.0, -1.0), vec2(-1.0,  1.0),
        );
        const uv = array(
          vec2(1.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0),
          vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 0.0),
        );
        var output : VertexOutput;
        output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
        output.fragUV = uv[VertexIndex];
        return output;
      }

      @fragment
      fn frag(@location(0) fragUV : vec2f) -> @location(0) vec4f {
        return textureSample(tex, samp, fragUV);
      }
    `, 'quad')

    const renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: quadShader, entryPoint: 'vert' },
      fragment: {
        module: quadShader,
        entryPoint: 'frag',
        targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    })

    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' })
    const planeBindGroup = createBindGroup({
      pipeline: renderPipeline,
      group: 0,
      bindings: [sampler, texture.createView()],
    })

    const bgColor = { r: 0, g: 0, b: 0 }

    const dispatch = (commandEncoder: GPUCommandEncoder) => {
      const pass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: bgColor.r, g: bgColor.g, b: bgColor.b, a: 1 },
            loadOp: 'clear' as GPULoadOp,
            storeOp: 'store' as GPUStoreOp,
          },
        ],
      })
      pass.setPipeline(renderPipeline)
      pass.setBindGroup(0, planeBindGroup)
      pass.draw(6, 1, 0, 0)
      pass.end()
    }

    const setBgColor = (r: number, g: number, b: number) => {
      bgColor.r = r
      bgColor.g = g
      bgColor.b = b
    }

    return { dispatch, setBgColor }
  }

  const dispatchComputePass = (settings: ComputePassSettings) => {
    const computePass = settings.encoder.beginComputePass()
    computePass.setPipeline(settings.pipeline)
    computePass.setBindGroup(settings.group ?? 0, settings.bindGroup)
    computePass.dispatchWorkgroups(...(settings.workGroups as [number, number?, number?]))
    computePass.end()
  }

  return {
    device,
    canvas,
    context,
    format,
    createBindGroup,
    createTexture,
    createAndSetBuffer,
    createComputePipeline,
    drawTextureToCanvasPass,
    dispatchComputePass,
  }
}
