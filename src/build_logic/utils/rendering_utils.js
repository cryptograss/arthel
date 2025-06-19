import path from "path";
import fs from "fs";
import { getProjectDirs } from "../locations.js";
import { getNunjucksEnv } from "./template_helpers.js";

export function renderPage({ template_path, context, output_path, layout = "base.njk", site }) {
    const { outputPrimaryRootDir, templateDir, basePath } = getProjectDirs();
    const outputFilePath = path.join(outputPrimaryRootDir, site, output_path);

    if (!fs.existsSync(outputFilePath)) {
        fs.mkdirSync(path.dirname(outputFilePath), {recursive: true});
    }
    
    // Get the shared Nunjucks environment with helpers
    const env = getNunjucksEnv(site);
    
    let rendered_page = env.render(template_path, {
        ...context,
        basePath: basePath
    });

    if (rendered_page == null) {
        console.log("here's the busted one")
    }

    fs.writeFileSync(outputFilePath, rendered_page);
    return rendered_page;
}