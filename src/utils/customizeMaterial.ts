import * as THREE from 'three'

export default function customizeMaterial<T extends THREE.Material>(
  material: T,
  uniforms: { [uniform: string]: THREE.IUniform },
  callback: (shader: THREE.Shader, renderer: THREE.WebGLRenderer) => void
) {
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(uniforms, shader.uniforms)
    shader.uniforms = uniforms
    callback(shader, renderer)
  }
  return {
    material,
    uniforms,
  }
}
