import pkg from './package.json'

import copy from 'rollup-plugin-copy'
import del from 'rollup-plugin-delete'
import zip from 'rollup-plugin-zipdir'

import fs from 'fs'
import chp from 'child_process'

function builder({ name }) {
  return {
    name: 'build-manager',
    load: () => '',
    resolveId: () => name,
    buildStart() {
      this.emitFile({
        id: name,
        fileName: 'empty.js',
        type: 'chunk'
      })
    },
    generateBundle({ dir }) {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true })
      }
    },
    writeBundle({ dir }) {
      if (!dir || !fs.existsSync(`${dir}/schemas`))
        return

      try {
        chp.execSync('glib-compile-schemas --strict schemas', {
          cwd: dir,
          stdio: 'inherit'
        })
      } catch (error) {
        console.error('glib-compile-schemas failed')
        if (process.env.package)
          throw error
      }
    }
  }
}

export default {
  output: {
    dir: 'dist',
    format: 'esm'
  },
  plugins: [
    builder({
      name: pkg.name
    }),
    del({
      hook: 'writeBundle',
      targets: [
        'dist/empty.js',
        ...(process.env.package ? ['build/*.zip'] : [])
      ]
    }),
    copy({
      hook: 'generateBundle',
      targets: [
        { src: 'systemd-manager@hardpixel.eu/*', dest: 'dist' }
      ]
    }),
    process.env.package && zip({
      name: `${pkg.name}-v${pkg.version}.zip`,
      outputDir: 'build'
    })
  ]
}
