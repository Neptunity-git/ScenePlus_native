const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

const assetsDir = 'c:\\Users\\neo_m\\ScenePlus_Workspace\\assets';
const samples = ['mouse_particle', 'cyber_invert', 'gravity_distortion'];

samples.forEach(s => {
    const dirPath = path.join(assetsDir, s);
    const zipPath = path.join(assetsDir, s + '.scenefx');
    
    if (fs.existsSync(dirPath)) {
        console.log(`Zipping ${s}...`);
        const zip = new AdmZip();
        // Add all files from the directory to the zip root
        zip.addLocalFolder(dirPath);
        zip.writeZip(zipPath);
        console.log(`Created ${zipPath}`);
    } else {
        console.log(`Directory ${dirPath} not found!`);
    }
});
