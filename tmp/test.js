const AdmZip = require('adm-zip');

const zipOnce = new AdmZip();
zipOnce.addFile('meta.json', Buffer.from(JSON.stringify({
    mediatype: 'image',
    playmode: 'once',
    duration: 3000,
    path: 'test.png'
})));
const pngOnce = "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyAQMAAAAk8RryAAAABlBMVEUAAAD/AABwe4I/AAAAAXRSTlMAQObYZgAAABFJREFUeAFjYBgFo2AUjIIMAAAHkAAB1LpwIwAAAABJRU5ErkJggg=="; // Red 50x50 block
zipOnce.addFile('test.png', Buffer.from(pngOnce, 'base64'));
zipOnce.writeZip('test-once.scenefx');

const zipLoop = new AdmZip();
zipLoop.addFile('meta.json', Buffer.from(JSON.stringify({
    mediatype: 'image',
    playmode: 'loop',
    path: 'test.png'
})));
const pngLoop = "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyAQMAAAAk8RryAAAABlBMVEUAAAAAAP90I1T/AAAAAXRSTlMAQObYZgAAABFJREFUeAFjYBgFo2AUjIIMAAAHkAAB1LpwIwAAAABJRU5ErkJggg=="; // Blue 50x50 block
zipLoop.addFile('test.png', Buffer.from(pngLoop, 'base64'));
zipLoop.writeZip('test-loop.scenefx');

console.log('Created test-once.scenefx and test-loop.scenefx');
