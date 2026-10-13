/**
 * tools/three-shim.mjs — Node 側テスト用。PMREMGenerator をスタブに差し替えた three。
 * （WebGL なしでも lighting.js まで実行できるようにする）
 */
export * from 'three';

export class PMREMGenerator {
  constructor() { this.disposed = false; }
  compileEquirectangularShader() {}
  compileCubemapShader() {}
  fromScene() { return { texture: { isTexture: true, __stub: 'env' } }; }
  fromEquirectangular() { return { texture: { isTexture: true, __stub: 'env' } }; }
  fromCubemap() { return { texture: { isTexture: true, __stub: 'env' } }; }
  dispose() { this.disposed = true; }
}
