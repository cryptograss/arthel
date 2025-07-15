import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Load QR codes from YAML data file
const yamlFile = fs.readFileSync('src/data/qr_codes.yaml', 'utf8');
const data = yaml.load(yamlFile);
const qrCodes = data.qr_codes;

// Create output directory if it doesn't exist
const outputDir = 'src/images/qr-codes';
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Generate each QR code
async function generateQRCodes() {
    console.log('Generating QR codes from YAML data...');
    console.log(`Found ${qrCodes.length} QR codes to generate`);
    
    for (const qr of qrCodes) {
        const filename = `${qr.name}.png`;
        const filepath = path.join(outputDir, filename);
        
        console.log(`Generating ${qr.caption}: ${qr.data}`);
        
        try {
            await QRCode.toFile(filepath, qr.data, {
                width: 200,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });
            
            console.log(`✓ Generated ${filename} for ${qr.caption}`);
        } catch (error) {
            console.error(`✗ Failed to generate ${filename}:`, error);
        }
    }
    
    console.log('QR code generation complete!');
}

generateQRCodes().catch(console.error);