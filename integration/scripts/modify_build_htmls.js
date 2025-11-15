import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const {
    PR_BUILDS_DIR,
    COMMIT_SHA,
    BRANCH_NAME,
} = process.env;

// Ensure required environment variables are present
if (!PR_BUILDS_DIR || !COMMIT_SHA || !BRANCH_NAME) {
    console.error('Required environment variables missing');
    process.exit(1);
}

const warningBanner = `
<div style='background-color: #510000; color: white; text-align: center; position: fixed; top: 0; left: 0; right: 0; z-index: 9999; height:80px;'>
    ⚠️ PREVIEW BUILD - Commit ${COMMIT_SHA} ⚠️<br>
    Branch: ${BRANCH_NAME}<br>
    This is a preview build. Features may be incomplete, unstable, unaudited, and insecure.
</div>
`;

async function modifyHtmlFiles() {
    try {
        // Find all HTML files in the build directory
        const htmlFiles = await glob(`${PR_BUILDS_DIR}/previews/${COMMIT_SHA}/**/*.html`);

        for (const file of htmlFiles) {
            let content = await fs.readFile(file, 'utf8');

            // Insert warning banner after opening body tag
            content = content.replace(/<body[^>]*>/, `$&${warningBanner}`);

            await fs.writeFile(file, content);
        }

        console.log(`Modified ${htmlFiles.length} HTML files`);
    } catch (error) {
        console.error('Error modifying HTML files:', error);
        process.exit(1);
    }
}

modifyHtmlFiles();