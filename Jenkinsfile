pipeline {
    agent any
    
    environment {
        NODE_VERSION = '23.2.0'
        NVM_DIR = '/var/jenkins_home/.nvm'
    }
    
    stages {
        stage('Setup') {
            steps {
                // Initialize and update submodules
                sh '''
                    git submodule init
                    git submodule update --recursive --remote
                '''
            }
        }

        stage('Setup NVM') {
            steps {
                sh '''
                    # Install NVM if not present
                    if [ ! -d "$NVM_DIR" ]; then
                        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
                        export NVM_DIR="$NVM_DIR"
                        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    fi
                '''
            }
        }
        
        stage('Setup Node') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm install ${NODE_VERSION}
                    nvm use ${NODE_VERSION}
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use ${NODE_VERSION}
                    npm install
                '''
            }
        }
        
        stage('Run Tests') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use ${NODE_VERSION}
                    npm test
                '''
            }
        }
        
        stage('Download Assets') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use ${NODE_VERSION}
                    npm run download-videos
                '''
            }
        }
        
        stage('Build Sites') {
            steps {
                sh '''
                    export NVM_DIR="$NVM_DIR"
                    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                    nvm use ${NODE_VERSION}
                    npm run build
                '''
            }
        }
        
        stage('Deploy') {
            steps {
                sh '''
                    rsync -av output/justinholmes.com.public.dist/ /var/www/justinholmes.com/
                    rsync -av output/cryptograss.live.public.dist/ /var/www/cryptograss.live/
                '''
            }
        }
    }
    
    post {
        always {
            cleanWs()
        }
    }
}