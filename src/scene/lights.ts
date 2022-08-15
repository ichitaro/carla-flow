import * as THREE from 'three'
import assets from '../utils/assets'
import Experience, { isDebug } from '../utils/Experience'

const envMapKey = assets.queue('textures/environmentMaps/0', (url) => {
  return assets.loaders.cubeTextureLoader
    .loadAsync([
      'textures/environmentMaps/0/px.jpg',
      'textures/environmentMaps/0/nx.jpg',
      'textures/environmentMaps/0/py.jpg',
      'textures/environmentMaps/0/ny.jpg',
      'textures/environmentMaps/0/pz.jpg',
      'textures/environmentMaps/0/nz.jpg',
    ] as any)
    .then((texture) => {
      texture.encoding = THREE.sRGBEncoding
      return texture
    })
})

export function addLights() {
  const { scene, gui } = new Experience()

  const ambientLight = new THREE.AmbientLight('#ffffff', 0.8)
  scene.add(ambientLight)

  if (isDebug && gui) {
    const folder = gui.addFolder('Ambient light')
    folder.add(ambientLight, 'intensity').min(0).max(10).step(0.01)
    folder.addColor(ambientLight, 'color')
  }

  const directionalLight = new THREE.DirectionalLight('#badaff')
  directionalLight.intensity = 6
  directionalLight.position.set(0.6, 2.714, -0.4)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.set(1024, 1024)
  directionalLight.shadow.camera.near = 0
  directionalLight.shadow.camera.far = 5
  directionalLight.shadow.camera.left = -3
  directionalLight.shadow.camera.right = 3
  directionalLight.shadow.camera.top = 3
  directionalLight.shadow.camera.bottom = -3
  directionalLight.shadow.normalBias = 0.01
  // directionalLight.shadow.bias = 0.01
  scene.add(directionalLight)

  const cameraHelper = new THREE.CameraHelper(directionalLight.shadow.camera)
  cameraHelper.visible = false
  scene.add(cameraHelper)

  if (isDebug && gui) {
    const folder = gui.addFolder('Directional light')
    folder.add(directionalLight, 'intensity').min(0).max(10).step(0.01)
    folder.addColor(directionalLight, 'color')
    folder.add(cameraHelper, 'visible').name('showCameraHelper')
    folder
      .add(directionalLight.position, 'x')
      .min(-4)
      .max(4)
      .step(0.01)
      .name('position.x')
    folder
      .add(directionalLight.position, 'y')
      .min(-4)
      .max(4)
      .step(0.01)
      .name('position.y')
    folder
      .add(directionalLight.position, 'z')
      .min(-4)
      .max(4)
      .step(0.01)
      .name('position.z')
  }

  const environmentMap = assets.get<THREE.CubeTexture>(envMapKey)
  environmentMap.encoding = THREE.sRGBEncoding
  scene.environment = environmentMap

  if (isDebug && gui) {
    const folder = gui.addFolder('Background')
    folder
      .add({ showEnvMap: false }, 'showEnvMap')
      .onChange((value: boolean) => {
        scene.background = value ? environmentMap : null
      })
  }
}
