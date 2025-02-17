multibranchPipelineJob('branches') {
    branchSources {
        github {
            id('cryptograss-repo-branches')
            scanCredentialsId('github-token')
            repoOwner('cryptograss')
            repository('justinholmes.com')
            buildOriginBranch(true)
            buildOriginPRMerge(false)
            buildForkPRMerge(false)

            configure {
                def traits = it / sources / data / 'jenkins.branch.BranchSource' / source / traits
                traits << 'org.jenkinsci.plugins.github__branch__source.ForkPullRequestDiscoveryTrait' {
                    strategyId(1)
                    trust(class: 'org.jenkinsci.plugins.github_branch_source.ForkPullRequestDiscoveryTrait$TrustPermission')
                }

                // Keep the clone options for optimization
                traits << 'jenkins.plugins.git.traits.CloneOptionTrait' {
                    extension {
                        shallow(true)
                        noTags(true)
                        depth(1)
                        reference('')
                        timeout(10)
                    }
                }
            }

            // Add the token to the repository URL
            configure { node ->
                node / 'sources' / 'data' / 'jenkins.branch.BranchSource' / 'source' / 'repositoryUrl' {
                    text("https://\${GITHUB_TOKEN}@github.com/cryptograss/justinholmes.com.git")
                }
            }

            // Add GitHub webhook configuration
            configure { node ->
                def traits = node / sources / data / 'jenkins.branch.BranchSource' / source / traits
                traits << 'org.jenkinsci.plugins.github__branch__source.GitHubWebhookTrait' {
                    spec ''
                }
            }

        }
    }

    configure { node ->
        def traits = node / sources / data / 'jenkins.branch.BranchSource' / source / traits

        // Add GitHub label filter
        traits << 'jenkins.scm.impl.trait.WildcardSCMHeadFilterTrait' {
            includes('build-on-maybelle')
            excludes('')
        }
    }

    factory {
        workflowBranchProjectFactory {
            scriptPath('deployment/Jenkinsfile')
        }
    }

    // Clean up old PR builds
    orphanedItemStrategy {
        discardOldItems {
            numToKeep(10)
            daysToKeep(7)
        }
    }

}