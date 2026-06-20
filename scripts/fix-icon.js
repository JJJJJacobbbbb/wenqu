const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

module.exports = async function (context) {
  const rceditPath = path.join(
    process.env.APPDATA || '',
    'npm', 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'
  )
  const iconPath = path.resolve(__dirname, '..', 'resources', 'wenqu.ico')
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)

  if (!fs.existsSync(rceditPath) || !fs.existsSync(iconPath) || !fs.existsSync(exePath)) return

  try {
    execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`, { stdio: 'pipe' })
    console.log(`[fix-icon] Patched: ${exePath}`)
  } catch (e) {
    console.error(`[fix-icon] Failed: ${e.message}`)
  }
}
