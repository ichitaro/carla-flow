import './style.css'
import * as THREE from 'three'
import WebGL from 'three/examples/jsm/capabilities/WebGL'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer'
import Experience, { isDebug } from './utils/Experience'
import assets from './utils/assets'
import customizeMaterial from './utils/customizeMaterial'
import { addLights } from './scene/lights'
import skinnedMeshVertexShader from './shaders/skinnedMesh/vertex.glsl'
import skinnedMeshFragmentShader from './shaders/skinnedMesh/fragment.glsl'
import particlesPositionShader from './shaders/particles/position.glsl'
import particlesVelocityShader from './shaders/particles/velocity.glsl'

if (WebGL.isWebGL2Available() === false) {
  document.body.appendChild(WebGL.getWebGL2ErrorMessage())
  throw new Error('Your graphics card does not seem to support WebGL 2')
}

const webgl = new Experience({
  clearColor: '#e4b9ae',
  renderer: {
    canvas: document.querySelector('canvas.webgl') as HTMLCanvasElement,
  },
  orbitControls: true,
  stats: isDebug,
  gui: true,
})

if (webgl.gui) {
  webgl.gui.close()
}

const loadingElement = document.querySelector('.loading') as HTMLDivElement
loadingElement.style.visibility = 'visible'

const modelKey = assets.queue('./models/carla.glb', (key) => {
  return assets.loaders.gltfLoader.loadAsync(key)
})

assets.loadQueued().then(() => {
  /**
   * Renderer
   */
  webgl.renderer.toneMapping = THREE.CineonToneMapping
  webgl.renderer.toneMappingExposure = 2.3

  /**
   * Camera
   */
  webgl.camera.fov = 35
  webgl.camera.near = 0.1
  webgl.camera.far = 10
  webgl.camera.updateProjectionMatrix()
  webgl.camera.position.set(-4, 0, 0)
  webgl.orbitControls!.target.y = 1
  webgl.orbitControls!.minDistance = 1
  webgl.orbitControls!.maxDistance = 6
  webgl.orbitControls!.minPolarAngle = 0
  webgl.orbitControls!.maxPolarAngle = Math.PI / 2 + 0.15
  // webgl.orbitControls!.enablePan = false
  webgl.orbitControls!.enableDamping = true

  if (isDebug && webgl.gui) {
    const clearColor = new THREE.Color(0, 0, 0)
    webgl.renderer.getClearColor(clearColor)
    webgl.gui
      .addColor(
        {
          clearColor,
        },
        'clearColor'
      )
      .onChange((color: THREE.Color) => {
        webgl.renderer.setClearColor(color)
      })
    webgl.gui.add(webgl.renderer, 'toneMapping', {
      No: THREE.NoToneMapping,
      Linear: THREE.LinearToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
      ACESFilmic: THREE.ACESFilmicToneMapping,
    })
    webgl.gui
      .add(webgl.renderer, 'toneMappingExposure')
      .min(0.5)
      .max(10)
      .step(0.1)
    webgl.gui
      .add(webgl.camera, 'fov')
      .min(20)
      .max(75)
      .step(1)
      .onChange(() => {
        webgl.camera.updateProjectionMatrix()
      })
  }

  /**
   * Objects
   */
  addParticles()

  // Floor
  const shadowMaterial = new THREE.ShadowMaterial({
    color: new THREE.Color('#331112'),
  })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), shadowMaterial)
  plane.rotation.x = -Math.PI / 2
  plane.receiveShadow = true
  webgl.scene.add(plane)

  // webgl.scene.add(new THREE.GridHelper(8))
  // webgl.scene.add(new THREE.AxesHelper())

  addLights()

  /**
   * Toggle animation
   */
  if (webgl.gui) {
    const checkbox = webgl.gui
      .add({ pause: false }, 'pause')
      .onChange((value: boolean) => {
        webgl.isAnimationActive = !value
      })
    window.addEventListener('keyup', (event) => {
      if (event.key === ' ') {
        checkbox.setValue(!checkbox.getValue())
      }
    })
  }

  /**
   * Start render loop
   */
  setTimeout(() => {
    loadingElement.style.visibility = 'hidden'

    webgl.start()
  }, 500)
})

/**
 * This demo is implemented in 3 steps.
 * 1. Write SkinnedMesh vertex positions to texture.
 * 2. Advance particle simulation and write position and velocity to texture.
 * 3. Replace particles with InstancedMesh and finally render with MeshStandardMaterial.
 */
function addParticles() {
  const glbRoot = assets.get<any>(modelKey)

  /**
   * Create an object that bakes the transformed vertex positions and colors of the SinnedMesh into textures
   */
  const vertexStore = prepareSkinnedMeshSampler(glbRoot.scene, 20000)
  const numParticles = vertexStore.numVertices

  /**
   * AnimationMixer
   */
  const mixer = new THREE.AnimationMixer(glbRoot.scene)
  mixer.timeScale = 0.25
  mixer.clipAction(glbRoot.animations[0]).play()
  mixer.update(0)
  vertexStore.update()

  if (webgl.gui) {
    const folder = webgl.gui.addFolder('Animation')
    const options = {
      FastRun: 0,
      Dancing: 1,
      NorthernSoulSpinCombo: 2,
    }
    folder
      .add({ animation: 0 }, 'animation', options)
      .onChange((index: number) => {
        mixer.stopAllAction()
        mixer.clipAction(glbRoot.animations[index]).play()
      })
    folder.add(mixer, 'timeScale').min(0).max(2).step(0.01)
  }

  /**
   * Create GPUComputationRenderer for particle simulation
   */
  const gpuCompute = new GPUComputationRenderer(
    vertexStore.mapWidth,
    vertexStore.mapHeight,
    webgl.renderer
  )
  if (webgl.renderer.capabilities.isWebGL2 === false) {
    gpuCompute.setDataType(THREE.HalfFloatType)
  }

  const initialVelocityMap = gpuCompute.createTexture()
  const initialPositionMap = gpuCompute.createTexture()
  ;(function fillTextures() {
    const positionArray = initialVelocityMap.image.data
    const velocityArray = initialPositionMap.image.data
    for (let i = 0; i < numParticles; i++) {
      const i4 = i * 4
      const life = 1.0 + 2.0 * Math.random()
      positionArray[i4 + 0] = 0
      positionArray[i4 + 1] = 0
      positionArray[i4 + 2] = 0
      positionArray[i4 + 3] = life
      velocityArray[i4 + 0] = 0
      velocityArray[i4 + 1] = 0
      velocityArray[i4 + 2] = 0
      velocityArray[i4 + 3] = life
    }
  })()

  const velocityVariable = gpuCompute.addVariable(
    'uVelocityMap',
    particlesVelocityShader,
    initialVelocityMap
  )
  const positionVariable = gpuCompute.addVariable(
    'uPositionMap',
    particlesPositionShader,
    initialPositionMap
  )
  gpuCompute.setVariableDependencies(velocityVariable, [
    velocityVariable,
    positionVariable,
  ])
  gpuCompute.setVariableDependencies(positionVariable, [
    velocityVariable,
    positionVariable,
  ])

  const commonUniforms = {
    uDelta: {
      value: 0,
    },
    uTime: {
      value: 0,
    },
    uTargetPositionMap: {
      value: vertexStore.positionMap,
    },
    uPrevTargetPositionMap: {
      value: vertexStore.prevPositionMap,
    },
  }
  const velocityUniforms = {
    ...commonUniforms,
    uDieSpeed: {
      value: 0.03,
    },
    uCurlSize: {
      value: 0.1,
    },
    uCurlStrength: {
      value: 0.012,
    },
    uCurlChangeSpeed: {
      value: 0.2,
    },
  }
  const positionUniforms = {
    ...commonUniforms,
  }
  Object.assign(velocityVariable.material.uniforms, velocityUniforms)
  Object.assign(positionVariable.material.uniforms, positionUniforms)

  if (webgl.gui) {
    const folder = webgl.gui.addFolder('Particles')
    folder
      .add(velocityUniforms.uCurlSize, 'value')
      .min(0.05)
      .max(0.5)
      .step(0.01)
      .name('curlSize')
    folder
      .add(velocityUniforms.uCurlStrength, 'value')
      .min(0.003)
      .max(0.03)
      .step(0.001)
      .name('curlStrength')
    folder
      .add(velocityUniforms.uCurlChangeSpeed, 'value')
      .min(0)
      .max(1.0)
      .step(0.01)
      .name('curlChangeSpeed')
    folder
      .add(velocityUniforms.uDieSpeed, 'value')
      .min(0.01)
      .max(0.1)
      .step(0.01)
      .name('dieSpeed')
  }

  const error = gpuCompute.init()
  if (error !== null) {
    console.error(error)
  }

  /**
   * Create InstancedMesh and shaders to render particles
   */
  const geometry = (() => {
    const geom = new THREE.OctahedronGeometry().scale(0.004, 0.005, 0.012)
    // const geom = new THREE.BoxGeometry().scale(0.005, 0.004, 0.012)

    geom.computeVertexNormals()

    const refs = new Float32Array(numParticles)
    for (let i = 0; i < numParticles; i++) {
      refs[i] = i
    }
    geom.setAttribute('aReference', new THREE.InstancedBufferAttribute(refs, 1))

    return geom
  })()

  const particlesUniforms = {
    uVelocityMap: {
      value: null! as THREE.Texture,
    },
    uPositionMap: {
      value: null! as THREE.Texture,
    },
    uColorMap: {
      value: vertexStore.colorMap,
    },
    uMapSize: {
      value: new THREE.Vector2(vertexStore.mapWidth, vertexStore.mapHeight),
    },
  }

  const { material } = customizeMaterial(
    new THREE.MeshStandardMaterial({
      flatShading: true,
      metalness: 0.4,
      roughness: 0.9,
      envMapIntensity: 4,
      defines: {
        USE_COLOR: '',
      },
    }),
    particlesUniforms,
    customizeShader
  )
  if (isDebug && webgl.gui) {
    const folder = webgl.gui.addFolder('Material')
    folder.add(material, 'metalness').min(0).max(1).step(0.01)
    folder.add(material, 'roughness').min(0).max(1).step(0.01)
    folder.add(material, 'envMapIntensity').min(0).max(10).step(0.01)
  }
  const { material: depthMaterial } = customizeMaterial(
    new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    }),
    particlesUniforms,
    customizeShader
  )

  const particles = new THREE.InstancedMesh(geometry, material, numParticles)
  particles.castShadow = true
  particles.receiveShadow = true
  particles.customDepthMaterial = depthMaterial

  const dummy = new THREE.Object3D()
  for (let i = 0; i < numParticles; i++) {
    particles.setMatrixAt(i, dummy.matrix)
  }

  webgl.scene.add(particles)

  webgl.events.tick.on((deltaTime) => {
    mixer.update(deltaTime)
    vertexStore.update()

    commonUniforms.uDelta.value = deltaTime * 60
    commonUniforms.uTime.value += deltaTime
    gpuCompute.compute()

    particlesUniforms.uVelocityMap.value =
      gpuCompute.getCurrentRenderTarget(velocityVariable).texture
    particlesUniforms.uPositionMap.value =
      gpuCompute.getCurrentRenderTarget(positionVariable).texture
  })

  function customizeShader(shader: THREE.Shader) {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>

        uniform sampler2D uVelocityMap;
        uniform sampler2D uPositionMap;
        uniform sampler2D uColorMap;
        uniform ivec2 uMapSize;

        attribute float aReference;

        vec2 getReference(float index) {
          return vec2(
            float(int(index) % uMapSize.x) / float(uMapSize.x - 1),
            float(int(index) / uMapSize.x) / float(uMapSize.y - 1)
          ); 
        }

        mat3 getRotation(vec3 velocity) {
          velocity.z *= -1.;
          float xz = length( velocity.xz );
          float xyz = 1.;
          float x = sqrt( 1. - velocity.y * velocity.y );
          float cosry = velocity.x / xz;
          float sinry = velocity.z / xz;
          float cosrz = x / xyz;
          float sinrz = velocity.y / xyz;
          mat3 maty =  mat3( cosry, 0, -sinry, 0    , 1, 0     , sinry, 0, cosry );
          mat3 matz =  mat3( cosrz , sinrz, 0, -sinrz, cosrz, 0, 0     , 0    , 1 );
          return maty * matz;
        }

        void displace(out vec3 displacedPosition, out vec3 displacedNormal, out vec3 displacedColor) {
          vec2 ref = getReference(aReference);
          vec4 positionData = texture2D(uPositionMap, ref);
          vec3 worldPosition = positionData.xyz;
          vec3 velocity = texture2D(uVelocityMap, ref).xyz;
          float life = positionData.w;
          vec3 vertexColor = texture2D(uColorMap, ref).xyz;

          mat3 particleRotation = getRotation(normalize(velocity));
          vec3 particleScale = vec3(
            100.0 * length(velocity) + 15.0,
            1.0,
            1.0
          );
          displacedPosition = position;
          displacedPosition *= clamp(smoothstep(0.0, 0.5, life), 0.0, 1.0) * particleScale;
          displacedPosition = particleRotation * displacedPosition + worldPosition;
          displacedNormal = normalize(particleRotation * normal / particleScale);
          displacedColor = vertexColor;
        }
      `
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      /* glsl */ `
        vec3 displacedPosition = vec3(0.0);
        vec3 displacedNormal = vec3(0.0);
        vec3 displacedColor = vec3(0.0);
        displace(displacedPosition, displacedNormal, displacedColor);

        #include <uv_vertex>
      `
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      /* glsl */ `
        #include <color_vertex>

        #ifdef USE_COLOR
          vColor.xyz = displacedColor;
        #endif
      `
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      /* glsl */ `
        #include <beginnormal_vertex>
        objectNormal = displacedNormal;
      `
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
        #include <begin_vertex>
        transformed = displacedPosition;
      `
    )
  }
}

function prepareSkinnedMeshSampler(model: THREE.Group, numSamples: number) {
  /**
   * Find the SkinnedMesh
   */
  let skinnedMesh: THREE.SkinnedMesh = null!
  model.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) {
      skinnedMesh = child
    }
  })

  if (!skinnedMesh) throw new Error('SkinnedMesh not found')

  if (Array.isArray(skinnedMesh.material)) {
    throw new Error('Array material is not supported')
  }

  const colorMap: THREE.Texture = (skinnedMesh.material as any).map
  if (!colorMap) throw new Error('diffuseMap not found')

  const newGeometry = createPointsGeometryForSkin(skinnedMesh, numSamples)

  /**
   * We want to store the animated vertex positions of the SkinnedMesh
   * as the render target textures and use them in the next pass (particle simulation).
   */
  const vertexStore = createVertexStore(newGeometry, colorMap)

  const container = new THREE.Group()
  container.scale.multiplyScalar(0.01)
  container.add(model)
  vertexStore.scene.add(container)

  skinnedMesh.geometry.dispose()
  skinnedMesh.geometry = vertexStore.geometry

  skinnedMesh.material.dispose()
  skinnedMesh.material = vertexStore.material

  // @ts-ignore
  skinnedMesh.isMesh = false
  // @ts-ignore
  skinnedMesh.isPoints = true

  return vertexStore
}

/**
 * Emulate the Transform Feedback of SkinnedMesh using the render target texture.
 * https://stackoverflow.com/questions/29053870/retrieve-vertices-data-in-three-js
 */
function createVertexStore(
  geometry: THREE.BufferGeometry,
  colorMap: THREE.Texture
) {
  const numVertices = geometry.attributes.position.count

  /**
   * Add a vertex attribute to find the 2D coordinates of the fragment
   * that will store the vertex position and color.
   * One vertex corresponds to one fragment.
   */
  const fragIndices = new Float32Array(numVertices)
  for (let i = 0; i < numVertices; i++) {
    fragIndices[i] = i
  }
  geometry.setAttribute(
    'aFragIndex',
    new THREE.Float32BufferAttribute(fragIndices, 1)
  )

  const mapWidth = 512
  const mapHeight = THREE.MathUtils.ceilPowerOfTwo(
    Math.ceil(numVertices / mapWidth)
  )
  const renderTargetOptions = {
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  }
  const renderTarget = new THREE.WebGLMultipleRenderTargets(
    mapWidth,
    mapHeight,
    2,
    renderTargetOptions
  )
  renderTarget.texture[0].name = 'position'
  renderTarget.texture[1].name = 'color'

  /**
   * An object to copy the texture where the vertex positions are stored.
   * It will be used later to calculate the vertex velocity.
   */
  const positionMapSaver = createSavePass(
    renderTarget.texture[0],
    mapWidth,
    mapHeight,
    renderTargetOptions
  )

  const material = new THREE.ShaderMaterial({
    defines: {
      USE_UV: '',
    },
    uniforms: {
      uMapWidth: {
        value: mapWidth,
      },
      uMapHeight: {
        value: mapHeight,
      },
      uColorMap: {
        value: colorMap,
      },
    },
    glslVersion: THREE.GLSL3,
    vertexShader: skinnedMeshVertexShader,
    fragmentShader: skinnedMeshFragmentShader,
  })

  const scene = new THREE.Scene()

  return {
    numVertices,
    mapWidth,
    mapHeight,
    geometry,
    material,
    scene,
    positionMap: renderTarget.texture[0],
    colorMap: renderTarget.texture[1],
    prevPositionMap: positionMapSaver.texture,
    update,
  }

  function update() {
    positionMapSaver.update()

    const { renderer, camera } = webgl
    const originalRenderTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    renderer.setRenderTarget(originalRenderTarget)
  }
}

/**
 * Create point cloud geometry capable of skin animation
 */
function createPointsGeometryForSkin(
  skinnedMesh: THREE.SkinnedMesh,
  numSamples: number
) {
  const sampler = createSkinnedMeshSurfaceSampler(skinnedMesh)
  const sample = {
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    skinIndex: new THREE.Vector4(),
    skinWeight: new THREE.Vector4(),
    uv: new THREE.Vector2(),
  }

  const positions = new Float32Array(numSamples * 3)
  const normals = new Float32Array(numSamples * 3)
  const uvs = new Float32Array(numSamples * 2)
  const skinIndices = new Uint16Array(numSamples * 4)
  const skinWeights = new Float32Array(numSamples * 4)
  for (let i = 0; i < numSamples; i++) {
    sampler(
      sample.position,
      sample.normal,
      sample.uv,
      sample.skinIndex,
      sample.skinWeight
    )

    positions[i * 3 + 0] = sample.position.x
    positions[i * 3 + 1] = sample.position.y
    positions[i * 3 + 2] = sample.position.z

    normals[i * 3 + 0] = sample.normal.x
    normals[i * 3 + 1] = sample.normal.y
    normals[i * 3 + 2] = sample.normal.z

    uvs[i * 2 + 0] = sample.uv.x
    uvs[i * 2 + 1] = sample.uv.y

    skinIndices[i * 4 + 0] = sample.skinIndex.x
    skinIndices[i * 4 + 1] = sample.skinIndex.y
    skinIndices[i * 4 + 2] = sample.skinIndex.z
    skinIndices[i * 4 + 3] = sample.skinIndex.w

    skinWeights[i * 4 + 0] = sample.skinWeight.x
    skinWeights[i * 4 + 1] = sample.skinWeight.y
    skinWeights[i * 4 + 2] = sample.skinWeight.z
    skinWeights[i * 4 + 3] = sample.skinWeight.w
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute(
    'skinIndex',
    new THREE.Uint16BufferAttribute(skinIndices, 4)
  )
  geometry.setAttribute(
    'skinWeight',
    new THREE.Float32BufferAttribute(skinWeights, 4)
  )
  return geometry
}

/**
 * Resample vertices uniformly from the SkinnedMesh surface.
 * Skin weights are copied from the nearest vertex.
 */
function createSkinnedMeshSurfaceSampler(mesh: THREE.Mesh) {
  const sampler = new MeshSurfaceSampler(mesh).build()
  const positionAttribute = getAttribute('position')
  const uvAttribute = getAttribute('uv')
  const skinIndexAttribute = getAttribute('skinIndex')
  const skinWeightAttribute = getAttribute('skinWeight')

  const face = new THREE.Triangle()
  const uvFace = [
    new THREE.Vector2(),
    new THREE.Vector2(),
    new THREE.Vector2(),
  ] as const
  const p = new THREE.Vector3()

  return sample

  function getAttribute(name: string) {
    const attribute = mesh.geometry.getAttribute(name)
    if (attribute instanceof THREE.BufferAttribute) {
      return attribute
    }
    return null
  }

  function sample(
    targetPosition: THREE.Vector3,
    targetNormal?: THREE.Vector3,
    targetUv?: THREE.Vector2,
    targetSkinIndex?: THREE.Vector4,
    targetSkinWeight?: THREE.Vector4
  ) {
    const cumulativeTotal =
      sampler.distribution![sampler.distribution!.length - 1]

    const faceIndex = sampler.binarySearch(Math.random() * cumulativeTotal)

    let u = Math.random()
    let v = Math.random()

    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }

    if (positionAttribute) {
      face.a.fromBufferAttribute(positionAttribute, faceIndex * 3)
      face.b.fromBufferAttribute(positionAttribute, faceIndex * 3 + 1)
      face.c.fromBufferAttribute(positionAttribute, faceIndex * 3 + 2)

      if (targetPosition) {
        targetPosition
          .set(0, 0, 0)
          .addScaledVector(face.a, u)
          .addScaledVector(face.b, v)
          .addScaledVector(face.c, 1 - (u + v))
      }

      if (targetNormal !== undefined) {
        face.getNormal(targetNormal)
      }
    }

    if (targetUv && uvAttribute) {
      uvFace[0].fromBufferAttribute(uvAttribute, faceIndex * 3)
      uvFace[1].fromBufferAttribute(uvAttribute, faceIndex * 3 + 1)
      uvFace[2].fromBufferAttribute(uvAttribute, faceIndex * 3 + 2)

      targetUv
        .set(0, 0)
        .addScaledVector(uvFace[0], u)
        .addScaledVector(uvFace[1], v)
        .addScaledVector(uvFace[2], 1 - (u + v))
    }

    if (positionAttribute) {
      let minDistance = Number.POSITIVE_INFINITY
      let nearestVertIndex = -1
      for (let i = 0; i < 3; i++) {
        const vertIndex = faceIndex * 3 + i
        p.fromBufferAttribute(positionAttribute, vertIndex)
        const distance = p.distanceTo(targetPosition)
        if (distance < minDistance) {
          minDistance = distance
          nearestVertIndex = vertIndex
        }
      }

      if (targetSkinIndex && skinIndexAttribute) {
        targetSkinIndex.fromBufferAttribute(
          skinIndexAttribute,
          nearestVertIndex
        )
      }

      if (targetSkinWeight && skinWeightAttribute) {
        targetSkinWeight.fromBufferAttribute(
          skinWeightAttribute,
          nearestVertIndex
        )
      }
    }
  }
}

function createSavePass(
  texture: THREE.Texture,
  width: number,
  height: number,
  options?: THREE.WebGLRenderTargetOptions
) {
  const renderTarget = new THREE.WebGLRenderTarget(width, height, options)

  const scene = new THREE.Scene()
  const uniforms = {
    uTexture: {
      value: texture,
    },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        gl_Position = vec4(position, 1.0);
        vUv = uv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      varying vec2 vUv;

      void main() {
        gl_FragColor = texture2D(uTexture, vUv);
      }
    `,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
  return {
    texture: renderTarget.texture,
    update,
  }

  function update() {
    const { renderer, camera } = webgl
    const originalRenderTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(renderTarget)
    renderer.render(scene, camera)
    renderer.setRenderTarget(originalRenderTarget)
  }
}
