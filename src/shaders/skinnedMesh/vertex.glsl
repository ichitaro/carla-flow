uniform int uMapWidth;
uniform int uMapHeight;
uniform sampler2D uColorMap;

in float aFragIndex;

out vec4 vWorldPosition;
out vec4 vVertexColor;

#include <common>
#include <skinning_pars_vertex>

void main() {
  #include <skinbase_vertex>
  
  #include <begin_vertex>
  #include <skinning_vertex>
  
  // Position this vertex so that it occupies a unique pixel.
  // Might not work in some environments...?
  // https://stackoverflow.com/questions/29053870/retrieve-vertices-data-in-three-js
  // https://stackoverflow.com/questions/20601886/does-gl-position-set-the-center-of-the-rectangle-when-using-gl-points
  vec2 destCoords = vec2(
    (0.5 + float(int(aFragIndex) % uMapWidth)) / float(uMapWidth),
    (0.5 + floor(float(aFragIndex) / float(uMapWidth))) / float(uMapHeight)
  ) * vec2(2.0) - vec2(1.0);
  
  gl_Position = vec4(destCoords, 0.0, 1.0);
  gl_PointSize = 1.0;
  
  vWorldPosition = modelMatrix * vec4(transformed, 1.0);
  vVertexColor = texture2D(uColorMap, uv);
}
