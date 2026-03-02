
fn random(seed: vec2f) -> f32 {
  let a = 12.9898;
  let b = 78.233;
  let c = 43758.5453;
  return fract(sin(dot(seed, vec2f(a, b))) * c) ;
}

fn index(coords : vec2i) -> i32 {
  return coords.x + coords.y * i32(params.dimensions.x);
}


struct Params {
  dimensions: vec2f,
    count: f32,
    frame: f32,
}

@group(0) @binding(0)
  var<uniform> params : Params;


struct Particle {
  color: vec4 <f32>,
    pos: vec2 <f32>,
    vel: vec2 <f32>,
    stopped: i32,
    parentId: i32,
}

@group(0) @binding(1)
  var<storage, read_write> agents : array<Particle>;

struct Color {
  color: vec4f
}
@group(0) @binding(2)
  var<storage, read_write> colorBuffer : array<Color>;


fn rndCircle(s: f32, radius: f32) -> vec2f {
  var r = radius * sqrt(random(vec2(s, s)));
  var theta = random(vec2(s * .01, 0)) * 2 * 3.141592654;
  return vec2(r * cos(theta), r * sin(theta));
}


struct dofSettings {
  dofE : f32,
    dofF : f32,
    dofM : f32,
    dofI: f32
}

@group(0) @binding(3)
  var<uniform> dofs : dofSettings;

@compute @workgroup_size(256)
fn dof(@builtin(global_invocation_id) id: vec3u) {
  var a = agents[id.x];
  var color = a.color;

  var dofE = dofs.dofE;
  var dofF = dofs.dofF;
  var dofM = dofs.dofM;
  var dofI = u32(dofs.dofI);
  if(a.color.r == 0.1) {
    dofI = 2u;
  }

  // https://inconvergent.net/2019/depth-of-field/
  var d = dofF - (color.r * color.g * color.b) / 3.0;
  var r = dofM * pow(abs(d), dofE);
  var factor = .04;
  var oc = factor * color;

  var finalColor = vec4(0.);
  for (var i = 0u; i < dofI; i++) {
    var w = a.pos + rndCircle(f32(i + id.x), r);
    let coords = vec2i(w);
    colorBuffer[index(coords)].color += oc;
  }
}


@group(0) @binding(0)
  var<uniform> settings : Params;

@group(0) @binding(1)
  var<storage, read_write> buffer : array<Color>;

@group(0) @binding(2) var outTex : texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn copy(@builtin(global_invocation_id) id: vec3u) {
  var color = buffer[index(vec2i(id.xy))].color;
  textureStore(outTex, id.xy, color);
}
