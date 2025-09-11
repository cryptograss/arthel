import path from "path";
import fs from "fs";
import { getProjectDirs } from "../locations.js";
import { getNunjucksEnv } from "./template_helpers.js";

// Sitemap collection - tracks all generated pages
let sitemap = new Map();

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
    
    // Add to sitemap
    const urlPath = output_path.replace(/\.html$/, '').replace(/\/index$/, '') || '/';
    sitemap.set(urlPath, {
        site: site,
        template: template_path,
        outputPath: output_path,
        fullPath: outputFilePath,
        title: context.title || context.page_title || context.pageTitle || 
               (template_path.includes('/') ? template_path.split('/').pop().replace('.njk', '') : 'Untitled'),
        description: context.description || '',
        lastModified: new Date().toISOString()
    });
    
    return rendered_page;
}

export function getSitemap() {
    return sitemap;
}

export function clearSitemap() {
    sitemap.clear();
}

export function generateSitemapXML(site, baseUrl = 'https://justinholmes.com') {
    const sitePages = Array.from(sitemap.entries())
        .filter(([url, data]) => data.site === site)
        .sort();
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    for (const [url, data] of sitePages) {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}${url}</loc>\n`;
        xml += `    <lastmod>${data.lastModified.split('T')[0]}</lastmod>\n`;
        xml += '  </url>\n';
    }
    
    xml += '</urlset>';
    return xml;
}

export function generateSitemapHTML(site) {
    const sitePages = Array.from(sitemap.entries())
        .filter(([url, data]) => data.site === site)
        .sort();
    
    // Build hierarchy
    const hierarchy = {};
    
    for (const [url, data] of sitePages) {
        const parts = url.split('/').filter(p => p);
        let current = hierarchy;
        
        // Build nested structure
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = {
                    pages: [],
                    children: {}
                };
            }
            current = current[part].children;
        }
        
        // Add page to appropriate level
        if (parts.length === 0) {
            // Root level page
            if (!hierarchy['_root']) {
                hierarchy['_root'] = { pages: [], children: {} };
            }
            hierarchy['_root'].pages.push([url, data]);
        } else {
            // Find the right level to add the page
            let target = hierarchy;
            for (let i = 0; i < parts.length - 1; i++) {
                target = target[parts[i]].children;
            }
            const lastPart = parts[parts.length - 1];
            if (!target[lastPart]) {
                target[lastPart] = { pages: [], children: {} };
            }
            target[lastPart].pages.push([url, data]);
        }
    }
    
    function renderHierarchy(obj, level = 0) {
        let html = '';
        const indent = '  '.repeat(level);
        
        for (const [key, value] of Object.entries(obj)) {
            if (key === '_root') {
                // Root level pages
                for (const [url, data] of value.pages) {
                    html += `${indent}<li><a href="${url}">${data.title}</a>`;
                    if (data.description) html += ` - ${data.description}`;
                    html += `</li>\n`;
                }
                continue;
            }
            
            const totalItems = value.pages.length + Object.keys(value.children).length;
            
            if (totalItems === 1 && value.pages.length === 1) {
                // Single item - display inline
                const [url, data] = value.pages[0];
                html += `${indent}<li><strong>${key}/</strong> <a href="${url}">${data.title}</a>`;
                if (data.description) html += ` - ${data.description}`;
                html += `</li>\n`;
            } else if (totalItems > 0) {
                // Multiple items - collapsible
                const shouldCollapse = totalItems > 4;
                const detailsId = `sitemap-${level}-${key}`;
                
                html += `${indent}<li>\n`;
                html += `${indent}  <details${shouldCollapse ? '' : ' open'}>\n`;
                html += `${indent}    <summary><strong>${key}/</strong> (${totalItems})</summary>\n`;
                html += `${indent}    <ul>\n`;
                
                // Pages at this level
                for (const [url, data] of value.pages) {
                    html += `${indent}      <li><a href="${url}">${data.title}</a>`;
                    if (data.description) html += ` - ${data.description}`;
                    html += `</li>\n`;
                }
                
                // Recurse into children
                html += renderHierarchy(value.children, level + 3);
                
                html += `${indent}    </ul>\n`;
                html += `${indent}  </details>\n`;
                html += `${indent}</li>\n`;
            }
        }
        
        return html;
    }
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sitemap for ${site}</title>
    <style>
        /* Reset and base styles */
        * { box-sizing: border-box; }
        body { 
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            line-height: 1.5; 
            margin: 0;
            padding: 20px;
            color: #2c3e50;
            background: #fff;
            max-width: 1200px;
        }
        
        /* Typography */
        h1 { 
            font-size: 1.8rem; 
            margin: 0 0 1.5rem 0;
            font-weight: 600;
            color: #34495e;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 0.5rem;
        }
        
        /* Lists */
        ul { 
            list-style: none; 
            padding-left: 1.2rem; 
            margin: 0;
        }
        
        li { 
            margin: 0.2rem 0; 
            padding: 0.1rem 0;
        }
        
        /* Links */
        a { 
            color: #3498db; 
            text-decoration: none;
            padding: 0.1rem 0.2rem;
            border-radius: 3px;
            transition: background-color 0.2s ease;
        }
        
        a:hover { 
            background-color: #ecf0f1;
            text-decoration: none;
        }
        
        /* Collapsible sections */
        details {
            margin: 0.2rem 0;
        }
        
        details > summary {
            cursor: pointer;
            padding: 0.3rem 0.5rem;
            border-radius: 4px;
            transition: background-color 0.2s ease;
            user-select: none;
        }
        
        details > summary:hover {
            background-color: #f8f9fa;
        }
        
        details[open] > summary {
            margin-bottom: 0.3rem;
        }
        
        /* Folder styling */
        strong {
            font-weight: 600;
            color: #2c3e50;
        }
        
        /* Debugging info */
        .debug-info {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 0.8rem;
            margin-bottom: 1rem;
            font-size: 0.9rem;
            color: #6c757d;
        }
    </style>
</head>
<body>
    <div class="debug-info">
        🔧 Debug Tool: Site structure generated at ${new Date().toLocaleString()}
    </div>
    <h1>Sitemap for ${site}</h1>
    <ul>
${renderHierarchy(hierarchy)}    </ul>
</body>
</html>`;
    
    return html;
}