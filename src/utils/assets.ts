import { TextureLoader, CubeTextureLoader } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
// import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader'

import AssetManager from './AssetManager'

/**
 * A simple global asset manager.
 * Feel free to customize it for each project.
 */
class Assets extends AssetManager {
  loaders = {
    textureLoader: new TextureLoader(),
    cubeTextureLoader: new CubeTextureLoader(),
    gltfLoader: new GLTFLoader(),
    // rgbeLoader: new RGBELoader(),
  }
}

const assets = new Assets()
export default assets
