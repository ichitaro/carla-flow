import * as THREE from 'three'
import { EffectComposer, RenderPass } from 'postprocessing'
import type { World } from 'cannon-es'
import type cannonDebugger from 'cannon-es-debugger'
import WebGLApp, { WebGLAppOptions } from './WebGLApp'

type EffectComposerOptions = {
  depthBuffer?: boolean
  stencilBuffer?: boolean
  alpha?: boolean
  multisampling?: number
  frameBufferType?: number
}

export type ExperienceOptions = WebGLAppOptions & {
  postprocessing?: boolean | EffectComposerOptions
  cannon?: {
    world: World
    debugger?: typeof cannonDebugger
    maxSubSteps?: number
  }
}

export const isDebug = window.location.search.includes('debug')

let instance: Experience | null = null

/**
 * The singleton idea is based on https://github.com/brunosimon/threejs-template-complex
 * which facilitates type inference in VSCode even when TypeScript is not used.
 */
export default class Experience extends WebGLApp {
  composer: EffectComposer | null = null

  world?: World
  cannonDebugger?: ReturnType<typeof cannonDebugger>
  private _maxSubSteps?: number

  constructor(options: ExperienceOptions = {}) {
    if (instance !== null) {
      return instance
    }

    options = {
      ...options,
      renderer: options.postprocessing
        ? {
            ...options.renderer,
            antialias: false,
            stencil: false,
            depth: false,
          }
        : options.renderer,
    }

    super(options)

    instance = this

    if (isDebug) {
      // @ts-ignore
      window.webgl = this
    }

    if (options.postprocessing) {
      const composer = new EffectComposer(this.renderer, {
        multisampling: this.pixelRatio === 1 ? 2 : undefined,
        ...(options.postprocessing === true ? {} : options.postprocessing),
      })
      composer.addPass(new RenderPass(this.scene, this.camera))
      this.composer = composer
      this.resourceTracker.track(composer)
    }

    if (options.cannon) {
      this.world = options.cannon.world
      this._maxSubSteps = options.cannon.maxSubSteps
      if (options.cannon.debugger) {
        this.cannonDebugger = options.cannon.debugger(this.scene, this.world)
      }
    }
  }

  protected resizeRenderer() {
    super.resizeRenderer()
    this.composer?.setSize(this.width, this.height)
  }

  protected render(deltaTime: number) {
    if (this.composer) {
      this.composer.render(deltaTime)
    } else {
      super.render(deltaTime)
    }
  }

  protected updatePhysics(deltaTime: number) {
    if (this.world) {
      this.world.step(1 / 60, deltaTime, this._maxSubSteps)
      this.cannonDebugger?.update()
    }
  }
}
