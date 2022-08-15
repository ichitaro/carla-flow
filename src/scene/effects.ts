import * as THREE from 'three'
import { EffectPass, DepthOfFieldEffect, VignetteEffect } from 'postprocessing'
import assets from '../utils/assets'
import Experience from '../utils/Experience'

export function addEffects() {
  const webgl = new Experience()
  const { composer, camera, gui } = webgl
  if (!composer) return

  // const depthOfFieldEffect = new DepthOfFieldEffect(camera, {
  //   focalLength: 0.2,
  //   bokehScale: 10.0,
  //   // @ts-ignore
  //   resolutionScale: 0.5,
  // })
  // depthOfFieldEffect.target = new THREE.Vector3(0, 1, 0)
  // const depthOfFieldPass = new EffectPass(camera, depthOfFieldEffect)
  // composer.addPass(depthOfFieldPass)

  composer.addPass(new EffectPass(camera, new VignetteEffect()))
}
