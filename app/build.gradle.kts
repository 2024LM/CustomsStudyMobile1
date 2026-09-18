tasks.register<Exec>("assembleDebug") {
    workingDir = rootDir
    commandLine("npm", "run", "build")
}
