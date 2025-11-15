pipelineJob('fetch-chain-data') {
    definition {
        cpsScm {
            scm {
                git {
                    remote {
                        url('https://github.com/cryptograss/justinholmes.com.git')
                        credentials('github-token')
                    }
                    branch('*/production')
                }
            }
            scriptPath('deployment/Jenkinsfile-fetch-chain-data')
        }
    }
    triggers {
        cron('1-59/2 * * * *')  // Run every odd minute
    }
}