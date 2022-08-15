
const vec2 cellSize = 1.0 / resolution.xy;

uniform float uDelta;
uniform float uTime;
uniform sampler2D uTargetPositionMap;
uniform sampler2D uPrevTargetPositionMap;
uniform float uDieSpeed;
uniform float uCurlSize;
uniform float uCurlStrength;
uniform float uCurlChangeSpeed;

#pragma glslify: curl = require('../helpers/curl4')

void main() {
  vec2 ref = gl_FragCoord.xy * cellSize;
  vec4 positionData = texture2D(uPositionMap, ref);
  vec3 position = positionData.xyz;
  vec4 velocityData = texture2D(uVelocityMap, ref);
  vec3 velocity = velocityData.xyz;
  float life = positionData.w;
  
  life -= uDieSpeed * uDelta;
  
  if (life < 1.0) {
    velocity = uCurlStrength * curl(
      position * uCurlSize,
      uTime * uCurlChangeSpeed,
      pow(life, 0.25)
    );
    velocity.y *= mix(0.0, 1.0, clamp(position.y, 0.0, 1.0));
  } else {
    vec3 targetPos = texture2D(uTargetPositionMap, ref).xyz;
    vec3 prevTargetPos = texture2D(uPrevTargetPositionMap, ref).xyz;
    vec3 newVelocity = targetPos - prevTargetPos;
    float tooFast = step(0.2, length(newVelocity));
    velocity = mix(newVelocity, velocity, tooFast);
  }
  
  gl_FragColor = vec4(velocity, life);
}
