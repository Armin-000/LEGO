import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

const CFG = {
    UNIT: 20,     
    STUD_R: 6,     
    STUD_H: 4,
    GAP: 0.1,      
    SEGMENTS: 2   
};

const CATALOG = {
    bricks: [
        { id: 'b2x4', type: 'brick', w: 2, d: 4, h: 24, name: 'Brick 2x4', icon: '🧱' },
        { id: 'b2x2', type: 'brick', w: 2, d: 2, h: 24, name: 'Brick 2x2', icon: '🧊' },
        { id: 'b1x4', type: 'brick', w: 1, d: 4, h: 24, name: 'Brick 1x4', icon: '▮' },
        { id: 'b1x2', type: 'brick', w: 1, d: 2, h: 24, name: 'Brick 1x2', icon: '▯' }
    ],
    plates: [
        { id: 'p2x4', type: 'plate', w: 2, d: 4, h: 8, name: 'Plate 2x4', icon: '🔲' },
        { id: 'p4x4', type: 'plate', w: 4, d: 4, h: 8, name: 'Plate 4x4', icon: '◼️' },
        { id: 'p8x8', type: 'plate', w: 8, d: 8, h: 8, name: 'Base 8x8', icon: '🟦' },
        { id: 'p1x1', type: 'plate', w: 1, d: 1, h: 8, name: 'Plate 1x1', icon: '•' }
    ],
    slopes: [
        { id: 'slope2x4', type: 'compound', w: 2, d: 4, h: 24, name: 'Slope 2x4', icon: '📐', builder: 'buildSlope' },
        { id: 'slope2x2', type: 'compound', w: 2, d: 2, h: 24, name: 'Slope 2x2', icon: '🔺', builder: 'buildSlope' },
        { id: 'slope_inverse', type: 'compound', w: 2, d: 2, h: 24, name: 'Inv. Slope', icon: '🔻', builder: 'buildInverseSlope' }
    ],
    special: [
        { id: 'door', type: 'compound', w: 1, d: 4, h: 64, name: 'Door Frame 🚪', icon: '🚪', builder: 'buildDoor' },
        { id: 'window', type: 'compound', w: 1, d: 4, h: 48, name: 'Window 🪟', icon: '🪟', builder: 'buildWindow' },
        { id: 'fence', type: 'brick', w: 1, d: 4, h: 16, name: 'Fence', icon: '—' }
    ],
    nature: [
        { id: 'pre_tree', type: 'compound', w: 2, d: 2, h: 120, name: 'Pine Tree', icon: '🌲', builder: 'buildTree' },
        { id: 'pre_flower', type: 'compound', w: 1, d: 1, h: 32, name: 'Flower', icon: '🌻', builder: 'buildFlower' },
        { id: 'grass', type: 'plate', w: 16, d: 16, h: 4, name: 'Grass Mat', icon: '🟩' }
    ]
};

const COLORS = [
    0xcc0000, 0x0055bb, 0xffcc00, 0x228b22, 0xffffff, 0x1a1a1a,
    0x808080, 0xa52a2a, 0xff8800, 0xaa00aa, 0x00a8ff, 0xffa07a
];

// --- HELPER FUNCTION: Ensure Geometry is non-indexed ---
function ensureNonIndexed(geometry) {
    if (geometry.index) {
        return geometry.toNonIndexed();
    }
    return geometry;
}

class App {
    constructor() {
        this.objects = [];
        this.bricks = [];
        this.collisionBoxes = [];
        this.history = [];
        this.geoCache = new Map();
        this.matCache = new Map();

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        // map spec by id
        this.specs = {};
        Object.values(CATALOG).flat().forEach(spec => {
            this.specs[spec.id] = spec;
        });
        
        this.currentSpec = this.specs['b2x4'];
        this.currentColor = COLORS[0];
        this.rotation = 0;
        this.isShift = false;

        // Materials
        this.edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3, opacity: 1.0 });
        this.glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xADD8E6,
            roughness: 0.1,
            metalness: 0.0,
            transparent: true,
            opacity: 0.4,
            transmission: 0.9,
            ior: 1.5,
            thickness: 0.1,
            envMapIntensity: 1.5
        });

        this.init();
    }
    
    // --- SCENE INITIALIZATION ---
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x151515);
        this.scene.fog = new THREE.Fog(0x151515, 300, 1500);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 1, 5000);
        this.camera.position.set(300, 400, 300);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(amb);
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(200, 500, 200);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        this.scene.add(sun);

        const grid = new THREE.GridHelper(2000, 100, 0x555, 0x333);
        this.scene.add(grid);

        const planeGeo = new THREE.PlaneGeometry(3000, 3000);
        planeGeo.rotateX(-Math.PI/2);
        this.plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({visible:false}));
        this.scene.add(this.plane);
        this.objects.push(this.plane);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.buildUI();
        this.createGhost();
        this.bindEvents();
        this.animate();
        this.load();

        setTimeout(()=> document.getElementById('loader').style.opacity = 0, 500);
        setTimeout(()=> document.getElementById('loader').remove(), 1000);
    }
    // --- END OF INIT ---

    // --- GEOMETRY FACTORY ---

    getStud(h) {
        let stud = new THREE.CylinderGeometry(CFG.STUD_R, CFG.STUD_R, CFG.STUD_H, 12);
        stud.deleteAttribute('uv');
        stud = ensureNonIndexed(stud); 
        stud.translate(0, h + CFG.STUD_H/2, 0);
        return stud;
    }

    buildStandardPart(spec, includeStuds = true) {
        const w = spec.w * CFG.UNIT;
        const d = spec.d * CFG.UNIT;
        const h = spec.h;

        let body = new RoundedBoxGeometry(w-CFG.GAP, h, d-CFG.GAP, CFG.SEGMENTS, 0.5);
        body.translate(0, h/2, 0);
        body.deleteAttribute('uv');
        body = ensureNonIndexed(body);

        const parts = [{ geometry: body, material: null }]; 

        if (includeStuds) {
            const ox = (w - CFG.UNIT)/2;
            const oz = (d - CFG.UNIT)/2;

            for(let x=0; x<spec.w; x++) {
                for(let z=0; z<spec.d; z++) {
                    const s = this.getStud(h).clone();
                    s.translate(-ox + x*CFG.UNIT, 0, -oz + z*CFG.UNIT);
                    parts.push({ geometry: s, material: null });
                }
            }
        }
        return parts;
    }

    // --- COMPOUND ASSET BUILDERS ---

    buildTree(spec) {
        const treeParts = [];
        
        const baseSpec = {w: 2, d: 2, h: 24};
        const baseParts = this.buildStandardPart(baseSpec);
        baseParts.forEach(p => treeParts.push({ geometry: p.geometry, material: this.getMaterial(0x8B4513) })); 
        
        let trunkGeo = new THREE.CylinderGeometry(CFG.UNIT/3, CFG.UNIT/3, 40, 10);
        trunkGeo.deleteAttribute('uv');
        trunkGeo = ensureNonIndexed(trunkGeo);
        
        const matrixTrunk = new THREE.Matrix4().makeTranslation(0, 24 + 40/2, 0);
        trunkGeo.applyMatrix4(matrixTrunk);
        treeParts.push({ geometry: trunkGeo, material: this.getMaterial(0x8B4513) }); 
        
        let topGeo = new THREE.ConeGeometry(CFG.UNIT*1.5, 60, 16);
        topGeo.deleteAttribute('uv');
        topGeo = ensureNonIndexed(topGeo);

        const matrixTop = new THREE.Matrix4().makeTranslation(0, 24 + 40 + 60/2, 0);
        topGeo.applyMatrix4(matrixTop);
        treeParts.push({ geometry: topGeo, material: this.getMaterial(0x228b22) }); 

        return this.mergeCompoundGeometries(treeParts);
    }

    buildFlower(spec) {
        const flowerParts = [];
        
        const baseSpec = {w: 1, d: 1, h: 8};
        const baseParts = this.buildStandardPart(baseSpec);
        baseParts.forEach(p => flowerParts.push({ geometry: p.geometry, material: this.getMaterial(0x228b22) })); 
        
        let stemGeo = new THREE.CylinderGeometry(1.5, 1.5, 20, 8); 
        stemGeo.deleteAttribute('uv');
        stemGeo = ensureNonIndexed(stemGeo);
        
        const matrixStem = new THREE.Matrix4().makeTranslation(0, 8 + 20/2, 0);
        stemGeo.applyMatrix4(matrixStem);
        flowerParts.push({ geometry: stemGeo, material: this.getMaterial(0x228b22) }); 

        const leafShape = new THREE.Shape();
        leafShape.moveTo(0, 0);
        leafShape.bezierCurveTo(4, 5, 10, 5, 12, 0);
        leafShape.bezierCurveTo(10, -5, 4, -5, 0, 0);
        const extrudeSettings = { depth: 0.5, bevelEnabled: false };
        
        let leaf1Geo = new THREE.ExtrudeGeometry(leafShape, extrudeSettings);
        leaf1Geo.rotateX(Math.PI/2);
        leaf1Geo.rotateY(Math.PI/4);
        leaf1Geo.scale(0.3, 0.3, 0.3);
        leaf1Geo.translate(-2, 8 + 15, 0);
        leaf1Geo = ensureNonIndexed(leaf1Geo);
        flowerParts.push({ geometry: leaf1Geo, material: this.getMaterial(0x228b22) });

        let leaf2Geo = new THREE.ExtrudeGeometry(leafShape, extrudeSettings);
        leaf2Geo.rotateX(Math.PI/2);
        leaf2Geo.rotateY(-3*Math.PI/4);
        leaf2Geo.scale(0.3, 0.3, 0.3);
        leaf2Geo.translate(2, 8 + 10, 0);
        leaf2Geo = ensureNonIndexed(leaf2Geo);
        flowerParts.push({ geometry: leaf2Geo, material: this.getMaterial(0x228b22) });
        
        const petalColor = null;
        for (let i = 0; i < 10; i++) { 
            let petalGeo = new THREE.BoxGeometry(10, 4, 1);
            petalGeo.translate(5, 0, 0);
            petalGeo.rotateZ(i * Math.PI / 5);
            petalGeo.translate(0, 8 + 20 + 2, 0);
            petalGeo = ensureNonIndexed(petalGeo);
            flowerParts.push({ geometry: petalGeo, material: petalColor });
        }

        let centerGeo = new THREE.SphereGeometry(2.5, 10, 10);
        centerGeo.deleteAttribute('uv');
        centerGeo = ensureNonIndexed(centerGeo);

        const matrixCenter = new THREE.Matrix4().makeTranslation(0, 8 + 20 + 2 + 0.5, 0);
        centerGeo.applyMatrix4(matrixCenter);
        flowerParts.push({ geometry: centerGeo, material: this.getMaterial(0xFFC300) });

        return this.mergeCompoundGeometries(flowerParts);
    }
    
    buildSlope(spec) {
        const w = spec.w * CFG.UNIT;
        const d = spec.d * CFG.UNIT;
        const h = spec.h;
        const roofThickness = 8; 
        const baseHeight = h - roofThickness; 

        const slopeParts = [];

        if (baseHeight > 0) {
            let baseGeo = new RoundedBoxGeometry(w - CFG.GAP, baseHeight, d - CFG.GAP, CFG.SEGMENTS, 0.5);
            baseGeo.translate(0, baseHeight / 2, 0);
            baseGeo = ensureNonIndexed(baseGeo);
            slopeParts.push({ geometry: baseGeo, material: null });
        }

        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(w, 0);
        shape.lineTo(0, roofThickness);
        shape.lineTo(0, 0);

        let roofGeo = new THREE.ExtrudeGeometry(shape, {
            steps: 1,
            depth: d - CFG.GAP,
            bevelEnabled: true,
            bevelSegments: 1,
            bevelSize: 0.5,
            bevelThickness: 0.5
        });
        roofGeo.translate(-w / 2, baseHeight, -(d - CFG.GAP) / 2);
        roofGeo = ensureNonIndexed(roofGeo);
        slopeParts.push({ geometry: roofGeo, material: null });

        const ox = (w - CFG.UNIT) / 2;
        const oz = (d - CFG.UNIT) / 2;
        for (let x = 0; x < spec.w; x++) {
            for (let z = 0; z < spec.d; z++) {
                const s = this.getStud(baseHeight).clone();
                s.translate(-ox + x * CFG.UNIT, 0, -oz + z * CFG.UNIT);
                slopeParts.push({ geometry: s, material: null });
            }
        }

        return this.mergeCompoundGeometries(slopeParts);
    }

    buildInverseSlope(spec) {
        const w = spec.w * CFG.UNIT;
        const d = spec.d * CFG.UNIT;
        const h = spec.h;
        const roofThickness = 8;
        const baseHeight = h - roofThickness;

        const slopeParts = [];

        if (baseHeight > 0) {
            let baseGeo = new RoundedBoxGeometry(w - CFG.GAP, baseHeight, d - CFG.GAP, CFG.SEGMENTS, 0.5);
            baseGeo.translate(0, baseHeight / 2, 0);
            baseGeo = ensureNonIndexed(baseGeo);
            slopeParts.push({ geometry: baseGeo, material: null });
        }

        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(w, 0);
        shape.lineTo(w, roofThickness);
        shape.lineTo(0, roofThickness);
        shape.lineTo(0,0);

        let invSlopeGeo = new THREE.ExtrudeGeometry(shape, {
            steps: 1,
            depth: d - CFG.GAP,
            bevelEnabled: true,
            bevelSegments: 1,
            bevelSize: 0.5,
            bevelThickness: 0.5
        });
        
        invSlopeGeo.translate(-w / 2, baseHeight, -(d - CFG.GAP) / 2);
        invSlopeGeo = ensureNonIndexed(invSlopeGeo);
        slopeParts.push({ geometry: invSlopeGeo, material: null });

        const ox = (w - CFG.UNIT) / 2;
        const oz = (d - CFG.UNIT) / 2;
        for (let x = 0; x < spec.w; x++) {
            for (let z = 0; z < spec.d; z++) {
                const s = this.getStud(h).clone();
                s.translate(-ox + x * CFG.UNIT, 0, -oz + z * CFG.UNIT);
                slopeParts.push({ geometry: s, material: null });
            }
        }
        
        return this.mergeCompoundGeometries(slopeParts);
    }

    buildDoor(spec) {
        const w = spec.w * CFG.UNIT; 
        const d = spec.d * CFG.UNIT; 
        const h = spec.h; 

        const doorParts = [];

        const frameThickness = 4; 
        const panelThickness = 2; 
        const panelColor = 0x8B4513; 

        const frameOuterW = w;
        const frameOuterH = h;
        const frameOuterD = d; 

        const innerOpeningW = frameOuterW - 2 * frameThickness;
        const innerOpeningH = frameOuterH - 2 * frameThickness - CFG.STUD_H;
        
        const frameMat = null; 

        // Frame
        let sideBeamGeo = new RoundedBoxGeometry(frameThickness, frameOuterH, frameOuterD, CFG.SEGMENTS, 0.5);
        sideBeamGeo.translate(-frameOuterW / 2 + frameThickness / 2, frameOuterH / 2, 0);
        sideBeamGeo = ensureNonIndexed(sideBeamGeo);
        doorParts.push({ geometry: sideBeamGeo, material: frameMat });

        let sideBeamGeo2 = sideBeamGeo.clone();
        sideBeamGeo2.translate(frameOuterW - frameThickness, 0, 0);
        doorParts.push({ geometry: sideBeamGeo2, material: frameMat });

        let topBeamGeo = new RoundedBoxGeometry(innerOpeningW + frameThickness, frameThickness, frameOuterD, CFG.SEGMENTS, 0.5);
        topBeamGeo.translate(0, frameOuterH - frameThickness / 2, 0);
        topBeamGeo = ensureNonIndexed(topBeamGeo);
        doorParts.push({ geometry: topBeamGeo, material: frameMat });

        let bottomLipGeo = new RoundedBoxGeometry(frameOuterW, frameThickness, frameOuterD, CFG.SEGMENTS, 0.5);
        bottomLipGeo.translate(0, frameThickness / 2, 0);
        bottomLipGeo = ensureNonIndexed(bottomLipGeo);
        doorParts.push({ geometry: bottomLipGeo, material: frameMat });

        // Door panel
        const doorW = innerOpeningW - 2;
        const doorH = innerOpeningH - 2;
        const doorZ = frameOuterD / 2 - panelThickness / 2 - frameThickness;

        let doorPanelGeo = new RoundedBoxGeometry(doorW, doorH, panelThickness, CFG.SEGMENTS, 0.5);
        doorPanelGeo.translate(0, frameThickness + innerOpeningH / 2, 0);
        doorPanelGeo.translate(0, 0, doorZ); 
        
        const plankThickness = doorW / 4;
        for(let i = -1.5; i <= 1.5; i++) {
            let plankGeo = new THREE.BoxGeometry(0.5, doorH, panelThickness);
            plankGeo.translate(i * plankThickness, frameThickness + innerOpeningH / 2, 0);
            plankGeo.translate(0, 0, doorZ - 0.1);
            doorParts.push({ geometry: ensureNonIndexed(plankGeo), material: this.getMaterial(panelColor) });
        }
        
        doorPanelGeo = ensureNonIndexed(doorPanelGeo);
        doorParts.push({ geometry: doorPanelGeo, material: this.getMaterial(panelColor) });

        // Handle
        const knobColor = 0xDAA520;
        let knobGeo = new THREE.BoxGeometry(1, 8, 3);
        knobGeo.rotateZ(Math.PI/2); 
        knobGeo.translate(innerOpeningW / 2 - 5, frameOuterH / 2, doorZ - 2);
        doorParts.push({ geometry: ensureNonIndexed(knobGeo), material: this.getMaterial(knobColor) });

        // Studs on top
        const ox = (w - CFG.UNIT)/2;
        const oz = (d - CFG.UNIT)/2;

        for(let x=0; x<spec.w; x++) {
            for(let z=0; z<spec.d; z++) {
                const s = this.getStud(h).clone();
                s.translate(-ox + x*CFG.UNIT, 0, -oz + z*CFG.UNIT);
                doorParts.push({ geometry: s, material: frameMat });
            }
        }

        return this.mergeCompoundGeometries(doorParts);
    }

    buildWindow(spec) {
        const w = spec.w * CFG.UNIT;
        const d = spec.d * CFG.UNIT;
        const h = spec.h; 

        const windowParts = [];

        const frameThickness = 4; 
        const glassThickness = 1.5; 
        const mullionThickness = 3; 

        const frameOuterW = w;
        const frameOuterH = h;
        const frameOuterD = d;
        const innerOpeningW = frameOuterW - 2 * frameThickness;
        const innerOpeningH = frameOuterH - 2 * frameThickness - CFG.STUD_H;
        const frameMat = null;

        // Frame
        let topBeamGeo = new RoundedBoxGeometry(frameOuterW, frameThickness, frameOuterD, CFG.SEGMENTS, 0.5);
        topBeamGeo.translate(0, frameOuterH - frameThickness / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(topBeamGeo), material: frameMat });

        let bottomBeamGeo = new RoundedBoxGeometry(frameOuterW, frameThickness, frameOuterD, CFG.SEGMENTS, 0.5);
        bottomBeamGeo.translate(0, frameThickness / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(bottomBeamGeo), material: frameMat });
        
        let sideBeamGeo = new RoundedBoxGeometry(frameThickness, innerOpeningH, frameOuterD, CFG.SEGMENTS, 0.5);
        sideBeamGeo.translate(-frameOuterW / 2 + frameThickness / 2, frameThickness + innerOpeningH / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(sideBeamGeo), material: frameMat });

        let sideBeamGeo2 = sideBeamGeo.clone();
        sideBeamGeo2.translate(frameOuterW - frameThickness, 0, 0);
        windowParts.push({ geometry: ensureNonIndexed(sideBeamGeo2), material: frameMat });

        // Glass
        const glassW = innerOpeningW - 2;
        const glassH = innerOpeningH - 2;
        let glassGeo = new THREE.BoxGeometry(glassW, glassH, glassThickness);
        glassGeo.translate(0, frameThickness + innerOpeningH / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(glassGeo), material: this.glassMat });

        // Mullions
        let mullionVGeo = new THREE.BoxGeometry(mullionThickness, glassH + 1, frameOuterD + 0.5);
        mullionVGeo.translate(0, frameThickness + innerOpeningH / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(mullionVGeo), material: frameMat });
        
        let mullionHGeo = new THREE.BoxGeometry(glassW + 1, mullionThickness, frameOuterD + 0.5);
        mullionHGeo.translate(0, frameThickness + innerOpeningH / 2, 0);
        windowParts.push({ geometry: ensureNonIndexed(mullionHGeo), material: frameMat });

        // Studs on top
        const ox = (w - CFG.UNIT)/2;
        const oz = (d - CFG.UNIT)/2;

        for(let x=0; x<spec.w; x++) {
            for(let z=0; z<spec.d; z++) {
                const s = this.getStud(h).clone();
                s.translate(-ox + x*CFG.UNIT, 0, -oz + z*CFG.UNIT);
                windowParts.push({ geometry: s, material: frameMat });
            }
        }

        return this.mergeCompoundGeometries(windowParts);
    }

    mergeCompoundGeometries(parts) {
        const mergedObjects = new THREE.Group();

        const geoByMat = new Map();
        parts.forEach(({ geometry, material }) => {
            const matKey = material ? material.uuid : 'default';
            if (!geoByMat.has(matKey)) {
                geoByMat.set(matKey, { geometries: [], material: material || this.getMaterial(this.currentColor) });
            }
            geoByMat.get(matKey).geometries.push(geometry);
        });

        geoByMat.forEach(({ geometries, material }) => {
            if (geometries.length > 0) {
                try {
                    const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
                    mergedGeo.computeVertexNormals();
                    
                    const mesh = new THREE.Mesh(mergedGeo, material);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    
                    if (material !== this.glassMat) {
                        const edgesGeo = new THREE.EdgesGeometry(mergedGeo, 30);
                        const edges = new THREE.LineSegments(edgesGeo, this.edgeMat);
                        mesh.add(edges);
                    }

                    mergedObjects.add(mesh);
                } catch (e) {
                    console.error("Error merging geometries for compound part:", e);
                    geometries.forEach(geo => {
                        const mesh = new THREE.Mesh(geo, material);
                        mergedObjects.add(mesh);
                    });
                }
            }
        });

        const box = new THREE.Box3().setFromObject(mergedObjects);
        const wrapperGeo = new THREE.BoxGeometry(
            box.max.x - box.min.x,
            box.max.y - box.min.y,
            box.max.z - box.min.z
        );
        wrapperGeo.translate(0, (box.max.y + box.min.y) / 2, 0);

        const wrapperMesh = new THREE.Mesh(wrapperGeo, new THREE.MeshBasicMaterial({ visible: false }));
        wrapperMesh.add(mergedObjects);
        
        return wrapperMesh;
    }

    getMaterial(color) {
        if(!this.matCache.has(color)) {
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.1,
                metalness: 0.0,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1
            });
            this.matCache.set(color, mat);
        }
        return this.matCache.get(color);
    }

    getLegoPart(spec) {
        const key = spec.id + '_' + this.currentColor;
        
        if (spec.type === 'compound') {
            if (spec.builder === 'buildTree') return this.buildTree(spec);
            else if (spec.builder === 'buildFlower') return this.buildFlower(spec);
            else if (spec.builder === 'buildDoor') return this.buildDoor(spec);
            else if (spec.builder === 'buildWindow') return this.buildWindow(spec);
            else if (spec.builder === 'buildSlope') return this.buildSlope(spec);
            else if (spec.builder === 'buildInverseSlope') return this.buildInverseSlope(spec);
        } else {
            if(this.geoCache.has(key)) return this.geoCache.get(key);
            
            const parts = this.buildStandardPart(spec);
            const geometries = parts.map(p => p.geometry);
            const geo = BufferGeometryUtils.mergeGeometries(geometries);
            geo.computeVertexNormals();

            this.geoCache.set(key, geo);
            return geo;
        }
    }

    addEdges(mesh, geo) {
        const edgesGeo = new THREE.EdgesGeometry(geo, 30);
        const edges = new THREE.LineSegments(edgesGeo, this.edgeMat);
        mesh.add(edges);
    }

    createGhost() {
        if(this.ghost) this.scene.remove(this.ghost);
        
        const part = this.getLegoPart(this.currentSpec);
        
        let ghostMesh;
        
        if (this.currentSpec.type === 'compound') {
            ghostMesh = part.clone();
            ghostMesh.traverse(child => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({ 
                        color: this.currentColor, 
                        transparent: true, 
                        opacity: 0.5, 
                        depthTest: false 
                    });
                    child.children.forEach(edge => { 
                        if (edge.isLineSegments) edge.visible = false;
                    });
                }
            });

        } else {
            const mat = new THREE.MeshBasicMaterial({
                color: this.currentColor,
                transparent: true,
                opacity: 0.5,
                depthTest: false
            });
            ghostMesh = new THREE.Mesh(part, mat);
        }

        this.ghost = ghostMesh;
        this.ghost.raycast = () => {};
        this.scene.add(this.ghost);
    }

    onMove(e) {
        if(e.target.closest('.ui-element')) {
            this.ghost.visible = false;
            return;
        }
        
        this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersects = this.raycaster.intersectObjects(this.objects);

        if(intersects.length > 0) {
            const hit = intersects[0];
            if(this.isShift) {
                this.ghost.visible = false;
                document.body.style.cursor = 'not-allowed';
                return;
            }

            this.ghost.visible = true;
            document.body.style.cursor = 'default';

            const pos = this.calcSnap(hit);
            this.ghost.position.copy(pos);
            this.ghost.rotation.y = this.rotation * (Math.PI/2);

            const valid = this.checkCollision(pos);
            
            this.ghost.traverse(child => {
                if (child.isMesh && child.material.transparent) {
                    child.material.color.setHex(valid ? this.currentColor : 0xff0000);
                }
            });
        }
    }

    calcSnap(hit) {
        const spec = this.currentSpec;
        const isRot = this.rotation % 2 !== 0;
        const w = isRot ? spec.d : spec.w;
        const d = isRot ? spec.w : spec.d;

        if (!hit.face || !hit.face.normal) {
            return new THREE.Vector3(0,0,0); 
        }

        const pos = new THREE.Vector3().copy(hit.point).addScaledVector(hit.face.normal, 0.1);
        
        const snap = (val, dim) =>
            (dim % 2 === 0)
                ? Math.round(val/CFG.UNIT)*CFG.UNIT
                : Math.floor(val/CFG.UNIT)*CFG.UNIT + CFG.UNIT/2;

        pos.x = snap(pos.x, w);
        pos.z = snap(pos.z, d);

        if(hit.object !== this.plane) {
            const box = hit.object.userData.box;
            if(hit.face.normal.y > 0.5) pos.y = box.max.y;
            else pos.y = box.min.y;
        } else {
            pos.y = 0;
        }
        return pos;
    }

    checkCollision(pos) {
        const spec = this.currentSpec;
        const isRot = this.rotation % 2 !== 0;
        const w = (isRot ? spec.d : spec.w) * CFG.UNIT;
        const d = (isRot ? spec.w : spec.d) * CFG.UNIT;
        
        const min = new THREE.Vector3(pos.x - w/2 + 0.5, pos.y + 0.5, pos.z - d/2 + 0.5);
        const max = new THREE.Vector3(pos.x + w/2 - 0.5, pos.y + spec.h - 0.5, pos.z + d/2 - 0.5);
        const box = new THREE.Box3(min, max);

        for(let b of this.collisionBoxes) {
            if(box.intersectsBox(b)) return false;
        }
        return true;
    }

    onClick(e) {
        if(e.button !== 0 || e.target.closest('.ui-element')) return;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const intersects = this.raycaster.intersectObjects(this.objects);

        if(intersects.length > 0) {
            if(this.isShift) {
                if(intersects[0].object !== this.plane) this.removeBrick(intersects[0].object);
            } else {
                let isGhostValid = true;
                this.ghost.traverse(child => {
                    if (child.isMesh && child.material.transparent && child.material.color.getHex() === 0xff0000) {
                        isGhostValid = false;
                    }
                });

                if(this.ghost.visible && isGhostValid) {
                    this.addBrick();
                }
            }
        }
    }

    addBrick(data = null) {
        const spec = data ? this.specs[data.specId] : this.currentSpec;
        const color = data ? data.color : this.currentColor;
        const pos = data ? new THREE.Vector3().fromArray(data.pos) : this.ghost.position.clone();
        const rot = data ? data.rot : this.rotation;

        let mesh;
        
        if (spec.type === 'compound') {
            const compoundMesh = this.getLegoPart(spec);
            compoundMesh.traverse(child => {
                 if (child.isMesh && child.material !== this.glassMat) {
                     if (child.material.uuid === this.getMaterial(this.currentColor).uuid) {
                        child.material = this.getMaterial(color);
                    }
                }
            });
            mesh = compoundMesh;

        } else {
            const geo = this.getLegoPart(spec);
            const mat = this.getMaterial(color);
            mesh = new THREE.Mesh(geo, mat);
            this.addEdges(mesh, geo); 
        }
        
        mesh.position.copy(pos);
        mesh.rotation.y = rot * (Math.PI/2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const isRot = rot % 2 !== 0;
        const w_unit = (isRot ? spec.d : spec.w) * CFG.UNIT;
        const d_unit = (isRot ? spec.w : spec.d) * CFG.UNIT;
        const min = new THREE.Vector3(pos.x - w_unit/2, pos.y, pos.z - d_unit/2);
        const max = new THREE.Vector3(pos.x + w_unit/2, pos.y + spec.h, pos.z + d_unit/2);

        mesh.userData = {
            id: Date.now() + Math.random(),
            specId: spec.id,
            color: color,
            rot: rot,
            box: new THREE.Box3(min, max)
        };

        this.scene.add(mesh);
        this.objects.push(mesh);
        this.bricks.push(mesh);
        this.collisionBoxes.push(mesh.userData.box);

        if(!data) {
            this.history.push({
                action: 'add',
                id: mesh.userData.id,
                data: {specId: spec.id, color, pos:pos.toArray(), rot}
            });
            this.save();
        }
        this.updateStats();
    }

    removeBrick(mesh, isUndo = false) {
        const idx = this.bricks.indexOf(mesh);
        if(idx === -1) return;
        
        const brickData = {
            specId: mesh.userData.specId,
            color: mesh.userData.color,
            pos: mesh.position.toArray(),
            rot: mesh.userData.rot
        };
        
        if(!isUndo) {
            this.history.push({ action: 'remove', data: brickData });
            this.save();
        }

        this.bricks.splice(idx, 1);
        this.objects.splice(this.objects.indexOf(mesh), 1);
        this.collisionBoxes.splice(this.collisionBoxes.indexOf(mesh.userData.box), 1);
        this.scene.remove(mesh);
        this.updateStats();
    }
    
    clearScene() {
        this.bricks.forEach(mesh => {
            this.scene.remove(mesh);
            if (this.objects.includes(mesh)) {
                this.objects.splice(this.objects.indexOf(mesh), 1);
            }
        });
        this.bricks = [];
        this.collisionBoxes = [];
        this.updateStats();
        
        this.createGhost();
    }

    undo() {
        if(this.history.length === 0) return;

        const lastAction = this.history.pop();
        const data = lastAction.data;

        if (lastAction.action === 'add') {
            const meshToRemove = this.bricks.find(b => b.userData.id === lastAction.id);
            if (meshToRemove) {
                this.removeBrick(meshToRemove, true);
            }
        } else if (lastAction.action === 'remove') {
            this.addBrick(data);
            
            if (this.history.length > 0 && this.history[this.history.length - 1].action === 'add') {
                this.history.pop();
            }
        }
        
        this.save(true);
    }

    clear() {
        if(confirm("Jeste li sigurni da želite obrisati cijelu scenu? Ova akcija se ne može poništiti.")) {
            this.clearScene();
            this.history = [];
            localStorage.removeItem('lego_bricks');
            localStorage.removeItem('lego_history');
        }
    }

    save(isHistoryUpdate = false) {
        const brickData = this.bricks.map(mesh => ({
            specId: mesh.userData.specId,
            color: mesh.userData.color,
            pos: mesh.position.toArray(),
            rot: mesh.userData.rot
        }));
        localStorage.setItem('lego_bricks', JSON.stringify(brickData));
        
        if (!isHistoryUpdate) {
            localStorage.setItem('lego_history', JSON.stringify(this.history));
        }
    }

    load() {
        const savedBricks = localStorage.getItem('lego_bricks');
        const savedHistory = localStorage.getItem('lego_history');

        if (savedBricks) {
            try {
                const data = JSON.parse(savedBricks);
                data.forEach(brick => this.addBrick(brick));
            } catch (e) {
                console.error("Error loading saved bricks:", e);
            }
        }
        if (savedHistory) {
             try {
                this.history = JSON.parse(savedHistory);
            } catch (e) {
                console.error("Error loading history:", e);
            }
        }
    }
    
    updateStats() {
        document.getElementById('stats').textContent = `Objekata: ${this.bricks.length}`;
    }

    clearGeometryCache() {
        this.geoCache.forEach(geo => geo.dispose());
        this.geoCache.clear();
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth/window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.addEventListener('pointermove', e => this.onMove(e));
        document.addEventListener('pointerdown', e => this.onClick(e));

        document.addEventListener('keydown', e => {
            if(e.key === 'Shift') this.isShift = true;
            if(e.key === 'r' || e.key === ' ') {
                this.rotation = (this.rotation + 1) % 4; 
                this.onMove({
                    clientX: (this.pointer.x+1)/2*window.innerWidth,
                    clientY: -(this.pointer.y-1)/2*window.innerHeight,
                    target: document.body
                });
            }
            if((e.ctrlKey||e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
        });

        document.addEventListener('keyup', e => {
            if(e.key === 'Shift') this.isShift = false;
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    buildUI() {
        const createBtn = (item, parent) => {
            const div = document.createElement('div');
            div.className = 'part-btn';
            if(item.id === 'b2x4') div.classList.add('active');
            div.innerHTML = `<div class="part-icon">${item.icon}</div><div class="part-label">${item.name}</div>`;
            div.onclick = () => {
                document.querySelectorAll('.part-btn').forEach(b => b.classList.remove('active'));
                div.classList.add('active');
                this.currentSpec = item;
                this.clearGeometryCache();
                this.createGhost();
            };
            parent.appendChild(div);
        };
        
        CATALOG.bricks.forEach(i => createBtn(i, document.getElementById('bricks-list')));
        CATALOG.plates.forEach(i => createBtn(i, document.getElementById('plates-list')));
        CATALOG.slopes.forEach(i => createBtn(i, document.getElementById('slopes-list')));
        CATALOG.special.forEach(i => createBtn(i, document.getElementById('special-list')));
        CATALOG.nature.forEach(i => createBtn(i, document.getElementById('nature-list')));

        const colParent = document.getElementById('color-list');
        COLORS.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = `color-btn ${i===0?'active':''}`;
            div.style.backgroundColor = '#' + c.toString(16).padStart(6,'0');
            div.onclick = () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                div.classList.add('active');
                this.currentColor = c;
                this.clearGeometryCache();
                this.createGhost();
            };
            colParent.appendChild(div);
        });
    }
}

window.app = new App();
