float random(in vec2 st) {
  return fract(
    sin(
      dot(st.xy, vec2(12.9898, 78.233))
    ) * 43758.5453123
  );
}

#pragma glslify: export(random)
