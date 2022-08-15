import { Material, Scene, Object3D, ShaderMaterial, Texture } from 'three'

function hasProperty<K extends string>(
  x: unknown,
  name: K
): x is { [M in K]: unknown } {
  return x instanceof Object && name in x
}

export type Disposable = {
  dispose: () => void
}

const isDisposable = (value: unknown): value is Disposable => {
  return hasProperty(value, 'dispose') && typeof value.dispose === 'function'
}

export type Resource = Disposable | Object3D | any[]

/**
 * @see {@link https://r105.threejsfundamentals.org/threejs/lessons/threejs-cleanup.html}
 */
class ResourceTracker {
  resources: Set<Resource>

  constructor() {
    this.resources = new Set()
  }

  track<T>(resource: T): T {
    if (!resource) {
      return resource
    }

    if (Array.isArray(resource)) {
      resource.forEach((resource) => this.track(resource))
      return resource
    }

    if (isDisposable(resource) || resource instanceof Object3D) {
      this.resources.add(resource)
    }

    if (resource instanceof Object3D) {
      if (hasProperty(resource, 'geometry')) {
        this.track(resource.geometry)
      }
      if (hasProperty(resource, 'material')) {
        this.track(resource.material)
      }
      if (hasProperty(resource, 'customDepthMaterial')) {
        this.track(resource.customDepthMaterial)
      }
      if (hasProperty(resource, 'customDistanceMaterial')) {
        this.track(resource.customDistanceMaterial)
      }
      this.track(resource.children)
    } else if (resource instanceof Material) {
      for (const value of Object.values(resource)) {
        if (value instanceof Texture) {
          this.track(value)
        }
      }
      if (resource instanceof ShaderMaterial) {
        for (const uniform of Object.values(resource.uniforms)) {
          const uniformValue = uniform.value
          if (uniformValue instanceof Texture || Array.isArray(uniformValue)) {
            this.track(uniformValue)
          }
        }
      }
    }
    return resource
  }

  untrack(resource: Disposable) {
    this.resources.delete(resource)
  }

  dispose(): void {
    this.resources.forEach((resource) => {
      if (resource instanceof Object3D) {
        if (resource.parent) {
          resource.parent.remove(resource)
        }
      }
      if (isDisposable(resource) && !(resource instanceof Scene)) {
        resource.dispose()
      }
    })
    this.resources.clear()
  }
}

export default ResourceTracker
