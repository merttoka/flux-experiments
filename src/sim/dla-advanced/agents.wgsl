
fn random(seed: vec2f) -> f32 {
  let a = 12.9898;
  let b = 78.233;
  let c = 43758.5453;
  return fract(sin(dot(seed, vec2f(a, b))) * c) ;
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
  var<storage, read_write> particles : array<Particle>;

@group(0) @binding(2)
  var<storage, read_write> positions : array<i32>;

@group(0) @binding(3)
  var dlaTexRead : texture_2d<f32>;

@group(0) @binding(4)
  var dlaTexWrite : texture_storage_2d<rgba8unorm, write>;

struct ColorParams {
  stoppedR: f32,
  stoppedG: f32,
  stoppedB: f32,
  fadeRate: f32,
}

@group(0) @binding(5)
  var<uniform> colorParams : ColorParams;


fn index(coords : vec2i) -> i32 {
  return coords.x + coords.y * i32(params.dimensions.x);
}


@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id : vec3u) {
  var p = particles[id.x];

  // Update velocity and position
  if(p.stopped == 0) {
    p.pos += p.vel;
    p.pos = (p.pos  + params.dimensions) % params.dimensions;
    let rv = vec2(p.pos.x / 100 + p.pos.y, params.frame/100);
    p.vel += vec2(random(rv) - 0.5, random(rv/2) - 0.5);

    var c = params.dimensions / 2 - p.pos;
    var theta = atan2(c.y, c.x);
    if(floor(params.frame / 1000) % 2 == 0) {
      p.vel.x += -sin(theta) / 20.;
      p.vel.y += cos(theta) / 20.;
    } else {
      p.vel.x -= -sin(theta) / 20.;
      p.vel.y -= cos(theta) / 20.;
    }

    p.vel = p.vel / length(p.vel);
  }


  // Floor to nearest pixel
  let coords = vec2i(p.pos);


  var found = false;
  var parentId  = -1;
  if(p.stopped == 0) {
    for(var u=-1; u <= 1; u++) {
      for(var v=-1; v<= 1; v++) {
        if(u==0 && v==0) {
          continue;
        }
        var coords2 = coords + vec2i(u, v);
        coords2 = (coords2 + vec2i(params.dimensions)) % vec2i(params.dimensions);
        found = textureLoad(dlaTexRead, coords2, 0).r == 1.0;
        if(found)
        {
          p.parentId = positions[index(coords2)];
          var parent = particles[p.parentId];
          parent.color.b = 1.0;
          particles[p.parentId] = parent;
          break;
        }
      }
      if(found) {
        p.stopped = 1;
        textureStore(dlaTexWrite, coords, vec4(1.0, 0.0, 0.0, 1.0));
        p.color.r = colorParams.stoppedR;
        p.color.g = colorParams.stoppedG;
        p.color.b = colorParams.stoppedB;
        positions[index(coords)] = i32(id.x);
        break;
      }
    }
  }


  // Draw

  if(p.stopped == 1) {
    p.color = clamp(p.color, vec4(0.0), vec4(1.));
  } else {
    p.color =  vec4(0.1, 0.1, 0.1, 1.0);
  }


  particles[id.x] = p;
}

@group(0) @binding(0)
  var<storage, read_write> agents : array<Particle>;

@compute @workgroup_size(256)
fn parent(@builtin(global_invocation_id) id : vec3u) {
  var a = agents[id.x];
  var parent = agents[a.parentId];
  parent.color.b += a.color.b;
  parent.color.r += a.color.b * 0.003;
  parent.color.g -= a.color.g * 0.001;
  agents[a.parentId] = parent;

  a.color.b *= 0.9;
  agents[id.x] = a;
}


struct SeedParams {
  seedCount: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

@group(0) @binding(0)
  var resetTex : texture_storage_2d<rgba8unorm, write>;

@group(0) @binding(1)
  var<uniform> seedParams : SeedParams;

@group(0) @binding(2)
  var<storage, read> seedPositions : array<vec4f>;

@compute @workgroup_size(16, 16)
fn reset(@builtin(global_invocation_id) id : vec3u) {
  var c = vec4(0.0, 0.0, 0.0, 1.0);
  let p = vec2f(id.xy);
  let count = i32(seedParams.seedCount);
  for (var i = 0; i < count; i++) {
    let center = seedPositions[i].xy;
    if (distance(p, center) <= 3.0) {
      c.r = 1.0;
      break;
    }
  }
  textureStore(resetTex, id.xy, c);
}


struct Color {
  color: vec4f
}
@group(0) @binding(0)
  var<storage, read_write> colorBuffer : array<Color>;

@group(0) @binding(1)
  var<uniform> fadeColorParams : ColorParams;

@compute @workgroup_size(256)
fn fade(@builtin(global_invocation_id) id : vec3u) {
  colorBuffer[id.x].color = colorBuffer[id.x].color * fadeColorParams.fadeRate;
}
