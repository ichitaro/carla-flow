layout(location = 0) out vec4 gPosition;
layout(location = 1) out vec4 gColor;

in vec4 vWorldPosition;
in vec4 vVertexColor;

void main() {
  gPosition = vec4(vWorldPosition.xyz, 0.0);
  gColor = vVertexColor;
}
