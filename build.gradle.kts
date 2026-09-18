tasks.register<Exec>("lint") {
    workingDir = rootDir
    commandLine("npx", "tsc", "--noEmit")
}
