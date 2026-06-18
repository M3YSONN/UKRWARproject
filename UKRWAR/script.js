// ============================================================
//  ТАКТИЧНА ГРА — script.js 
// ============================================================

// === 1. ГЛОБАЛЬНІ ЗМІННІ ===
let globalManpowerPool = 0;   // Резерв ставки гравця
let aiManpowerPool     = 50000; // Резерв ставки ворога (ШІ)
let reserveBrigades    = {};

const googleHybrid = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    { maxZoom: 19, attribution: '© Google' }
);
const map = L.map('map', {
    center: [48.5, 31.2], zoom: 6,
    layers: [googleHybrid], zoomControl: false
});
L.control.zoom({ position: 'topright' }).addTo(map);

// === 2. СЦЕНАРІЇ ===
const scenarios = {
    global: {
        center: [48.5, 31.2], zoom: 6,
        frontlineBlue: [[46.52,31.57],[46.63,32.61],[47.20,34.00],[47.45,35.30],[47.45,35.80],[47.75,36.80],[47.85,37.45],[48.15,37.75],[48.60,37.95],[48.95,38.25],[49.40,38.00],[49.85,37.80],[50.35,36.90]],
        frontlineRed:  [[46.49,31.60],[46.60,32.64],[47.17,34.04],[47.42,35.32],[47.42,35.82],[47.72,36.82],[47.82,37.48],[48.13,37.78],[48.58,37.98],[48.93,38.29],[49.38,38.04],[49.83,37.84],[50.36,36.94]],
        redBorders:  [[50.35,36.90],[50.00,40.00],[47.00,39.00],[45.30,36.50],[44.30,33.50],[46.00,31.57]],
        blueBorders: [[50.35,36.90],[52.30,33.00],[51.50,23.80],[48.40,22.15],[45.30,29.60],[46.52,31.57]]
    },
    bakhmut: {
        center: [48.59,38.00], zoom: 12,
        frontlineBlue: [[48.52,37.92],[48.56,37.95],[48.59,37.97],[48.62,37.99],[48.66,37.98]],
        frontlineRed:  [[48.51,37.95],[48.55,37.98],[48.58,38.00],[48.61,38.02],[48.65,38.01]],
        redBorders:  [[48.65,38.20],[48.51,38.20]],
        blueBorders: [[48.66,37.70],[48.52,37.70]]
    },
    kyiv:     { center: [50.45,30.52], zoom: 11 },
    mariupol: { center: [47.10,37.55], zoom: 12 },
    kherson:  { center: [46.63,32.61], zoom: 12 },
    avdiivka: { center: [48.13,37.75], zoom: 13 }
};

// === 3. СТАН ГРИ ===
let currentPolygonLayers = [];
let activeBrigades   = [];   
let activeForts      = [];   
let activeDetachments = [];  

let currentLoadedScenario = '';
let selectedBrigade  = null; 
let selectedFort     = null; 

let activeBluePolyGeoJSON, activeRedPolyGeoJSON, activeGreyPolyGeoJSON;

let fortPlacementMode = false;
let fortPlacementType = null;
let sendingDetachment = null;
let movingDetachment = null; 

// === 4. ШАБЛОНИ УКРІПЛЕНЬ ===
const fortifications = {
    trench: { name: "Окоп",             icon: "⛏️", defBonus: 1.20, slots: 1, minKm: 0,  maxKm: 5,    desc: "Просте укриття в полі." },
    sp:     { name: "СП",               icon: "👁️", defBonus: 1.35, slots: 1, minKm: 0,  maxKm: 5,    desc: "Спостережний пункт." },
    dugout: { name: "Бліндаж",          icon: "🪵", defBonus: 1.50, slots: 2, minKm: 2,  maxKm: 8,    desc: "Посилене укриття (посадки)." },
    vop:    { name: "ВОП",              icon: "⭐", defBonus: 1.80, slots: 3, minKm: 8,  maxKm: 15,   desc: "Опорний пункт взводу." },
    dot:    { name: "ДОТ",              icon: "🏰", defBonus: 2.50, slots: 2, minKm: 0,  maxKm: 1000, desc: "Бетонована точка." },
    rear:   { name: "Тилова лінія",     icon: "⛺", defBonus: 1.40, slots: 4, minKm: 20, maxKm: 1000, desc: "База, склади, ФПВ." }
};

// === 5. ШАБЛОНИ БРИГАД ===
const unitTemplates = {
    // ЗСУ
    zsu_3sh: { name: "3-тя ОШБр", type: "ЗСУ", totalMen: 3000, attack: 85, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/3%D0%BE%D1%88%D0%B1%D1%80_logo.svg/960px-3%D0%BE%D1%88%D0%B1%D1%80_logo.svg.png" },
    zsu_93:  { name: "93-тя ОМБр", type: "ЗСУ", totalMen: 3500, attack: 65, defense: 85, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/93_%D0%9E%D0%9C%D0%91%D1%80_%D0%BF.svg/960px-93_%D0%9E%D0%9C%D0%91%D1%80_%D0%BF.svg.png" },
    // ДШВ
    dshv_80: { name: "80-та ОДШБр", type: "ДШВ", totalMen: 2500, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/80_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg/960px-80_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg.png" },
    dshv_81: { name: "81-ша ОАеМБр", type: "ДШВ", totalMen: 2500, attack: 70, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/81_%D0%9E%D0%90%D0%B5%D0%9C%D0%91%D1%80_%D0%BA.svg/960px-81_%D0%9E%D0%90%D0%B5%D0%9C%D0%91%D1%80_%D0%BA.svg.png" },
    // НГУ
    ngu_azov:{ name: "12 БрСП «Азов»", type: "НГУ", totalMen: 2500, attack: 80, defense: 80, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/12th_Special_Purpose_Brigade_%27Azov%27_Insignia_-_First_Variant.png/960px-12th_Special_Purpose_Brigade_%27Azov%27_Insignia_-_First_Variant.png" },
    // Ворог
    ENEMY:   { name: "МСБр (РФ)", type: "ENEMY", totalMen: 3000, attack: 45, defense: 65, color: "unit-red", logo: "" }
};

// === 6. ГЛОБАЛЬНИЙ ЧАС ТА МОБІЛІЗАЦІЯ ===
let globalDays = 1;
let globalHours = 0;

function updateManpowerUI() {
    const el = document.getElementById('manpower-val');
    if (el) el.innerText = globalManpowerPool;
}

setInterval(() => {
    globalHours++;
    if (globalHours >= 24) { globalHours = 0; globalDays++; processDailyLogic(); }
    
    // ДОДАНО: Кожні 6 ігрових годин ШІ приймає рішення
    if (globalHours % 6 === 0) {
        // runEnemyAI();    ТУТ ТИПУ АІ ЯКЩО Я ЗАХОЧУ
    }

    const el = document.getElementById('global-clock');
    if (el) el.innerText = `День: ${globalDays} | Година: ${globalHours < 10 ? '0'+globalHours : globalHours}:00`;
}, 1000);

function processDailyLogic() {
    // Мобілізація кожні 30 днів
    if (globalDays % 30 === 0) {
        globalManpowerPool += 30000;
        aiManpowerPool += 30000; // ШІ теж мобілізує 30,000 бійців
        updateManpowerUI();
        
        const log = document.getElementById('combat-log');
        const txt = document.getElementById('combat-text');
        log.classList.remove('hidden');
        txt.innerHTML = `<span style="color:#00ff88">🇺🇦 Мобілізація!<br>+30,000 бійців до резерву Ставки.</span>`;
        setTimeout(() => log.classList.add('hidden'), 6000);
    }

    activeBrigades.forEach(b => {
        const dist = getDistanceToEnemyLine(b.lat, b.lng, b.data.color);
        if (dist < 20) b.data.daysOnFront++;
        else b.data.daysOnFront = Math.max(0, b.data.daysOnFront - 3);
        updateBrigadeVisuals(b);
    });
    if (selectedBrigade) updateBrigadePanel(selectedBrigade);
    saveGameState();
}

// === 7. ДОПОМІЖНІ ФУНКЦІЇ ГЕОМЕТРІЇ ===
function turfify(latLngArray) {
    let coords = latLngArray.map(c => [c[1], c[0]]);
    if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
        coords.push([...coords[0]]);
    }
    return turf.polygon([coords]);
}

function getDistanceToEnemyLine(lat, lng, color) {
    if (!activeBluePolyGeoJSON || !activeRedPolyGeoJSON) return 999;
    const pt = turf.point([lng, lat]);
    const enemyPoly = color === 'unit-blue' ? activeRedPolyGeoJSON : activeBluePolyGeoJSON;
    try {
        const lines = turf.polygonToLine(enemyPoly);
        return turf.pointToLineDistance(pt, lines, { units: 'kilometers' });
    } catch(e) { return 999; }
}

function generateTacticalZone(lng, lat, baseRadiusKm) {
    const pts = [];
    const steps = 7;
    for (let i = 0; i < steps; i++) {
        const angle = (i * 360) / steps;
        const r = baseRadiusKm * (0.5 + Math.random() * 0.7);
        const dest = turf.destination(turf.point([lng, lat]), r, angle, { units: 'kilometers' });
        pts.push(dest.geometry.coordinates);
    }
    pts.push(pts[0]);
    return turf.polygon([pts]);
}

// === 8. ЗБЕРЕЖЕННЯ / ЗАВАНТАЖЕННЯ ===
function saveGameState() {
    const state = {
        scenario: currentLoadedScenario,
        blueZone: activeBluePolyGeoJSON,
        redZone:  activeRedPolyGeoJSON,
        greyZone: activeGreyPolyGeoJSON,
        globalDays, globalHours,
        globalManpowerPool,
        aiManpowerPool, // ДОДАНО ЗБЕРЕЖЕННЯ ШІ
        reserveBrigades,
        brigades: activeBrigades.map(b => ({
            lat: b.lat, lng: b.lng, data: b.data
        })),
        forts: activeForts.map(f => ({
            lat: f.lat, lng: f.lng, type: f.type,
            garrisonIds: f.garrisonIds || []
        })),
        detachments: activeDetachments.map(d => ({
            id: d.id, brigadeId: d.brigadeId,
            lat: d.lat, lng: d.lng,
            size: d.size, role: d.role,
            fortId: d.fortId || null,
            isBusy: d.isBusy || false
        }))
    };
    localStorage.setItem('ukrwar_save_v2', JSON.stringify(state));
}

function loadGameState() {
    const raw = localStorage.getItem('ukrwar_save_v2');
    if (!raw) return false;
    const s = JSON.parse(raw);

    currentLoadedScenario = s.scenario;
    activeBluePolyGeoJSON = s.blueZone;
    activeRedPolyGeoJSON  = s.redZone;
    activeGreyPolyGeoJSON = s.greyZone;
    globalDays  = s.globalDays  || 1;
    globalHours = s.globalHours || 0;
    globalManpowerPool = s.globalManpowerPool || 0;
    aiManpowerPool     = s.aiManpowerPool || 50000; // ДОДАНО ЗАВАНТАЖЕННЯ ШІ
    reserveBrigades    = s.reserveBrigades || {};
    
    updateManpowerUI();

    const data = scenarios[currentLoadedScenario];
    if (data) map.flyTo(data.center, data.zoom, { duration: 1.5 });
    redrawPolygons();

    activeBrigades.forEach(b => map.removeLayer(b.marker));
    activeBrigades = [];
    (s.brigades || []).forEach(saved => {
        createBrigadeMarker(saved.data, saved.lat, saved.lng, saved.data.templateId);
    });

    activeForts.forEach(f => map.removeLayer(f.marker));
    activeForts = [];
    (s.forts || []).forEach(saved => createFortMarker(saved.type, saved.lat, saved.lng, saved.garrisonIds || []));

    activeDetachments.forEach(d => map.removeLayer(d.marker));
    activeDetachments = [];
    (s.detachments || []).forEach(saved => {
        const brigade = activeBrigades.find(b => b.data.id === saved.brigadeId);
        if (brigade) createDetachmentMarker(brigade, saved.size, saved.role, saved.lat, saved.lng, saved.id, saved.fortId);
    });

    updateBrigadeMenuButtons();
    return true;
}

function resetGameState() {
    if (confirm("Скинути весь прогрес і почати спочатку?")) {
        localStorage.removeItem('ukrwar_save_v2');
        location.reload();
    }
}

// === 9. СЦЕНАРІЇ / ПОЛІГОНИ ===
function loadScenario(key) {
    currentLoadedScenario = key;
    const data = scenarios[key];
    map.flyTo(data.center, data.zoom, { duration: 1.5 });

    if (data.frontlineBlue && data.frontlineRed) {
        const fullBlue  = data.blueBorders.concat(data.frontlineBlue);
        const fullRed   = data.frontlineRed.concat(data.redBorders);
        const greyCoords = data.frontlineBlue.concat([...data.frontlineRed].reverse());

        activeBluePolyGeoJSON = turfify(fullBlue);
        activeRedPolyGeoJSON  = turfify(fullRed);
        activeGreyPolyGeoJSON = turfify(greyCoords);

        redrawPolygons();
        saveGameState();
    }
    toggleMainMenu();
}

function redrawPolygons() {
    currentPolygonLayers.forEach(l => map.removeLayer(l));
    currentPolygonLayers = [];
    if (!activeBluePolyGeoJSON || !activeRedPolyGeoJSON) return;

    if (activeGreyPolyGeoJSON) {
        currentPolygonLayers.push(
            L.geoJSON(activeGreyPolyGeoJSON, {
                style: { color:'#000', weight:0.5, fillColor:'#495057', fillOpacity:0.7 }
            }).addTo(map)
        );
    }
    currentPolygonLayers.push(
        L.geoJSON(activeBluePolyGeoJSON, {
            style: { color:'#003366', weight:3, fillColor:'#0047AB', fillOpacity:0.35 }
        }).addTo(map),
        L.geoJSON(activeRedPolyGeoJSON, {
            style: { color:'#800000', weight:3, fillColor:'#B30000', fillOpacity:0.35 }
        }).addTo(map)
    );
}

function advanceFrontline(winnerLat, winnerLng, isBlueWinner, radiusKm = 2.0) {
    if (!activeBluePolyGeoJSON || !activeRedPolyGeoJSON) return;
    
    // Генеруємо тактичну зону з динамічним радіусом (залежить від кількості людей)
    const captureZone  = generateTacticalZone(winnerLng, winnerLat, radiusKm);
    
    // Зона "відступу ворога" (clearanceZone) теж має бути пропорційною. 
    // Мінімум 100 метрів (0.1), інакше полігони можуть накладатися
    const clearanceRadius = Math.max(0.1, radiusKm * 0.5); 
    const clearanceZone = turf.buffer(captureZone, clearanceRadius, { units: 'kilometers' });

    if (isBlueWinner) {
        activeBluePolyGeoJSON = turf.union(activeBluePolyGeoJSON, captureZone);
        const cut = turf.difference(activeRedPolyGeoJSON, clearanceZone);
        if (cut) activeRedPolyGeoJSON = cut;
    } else {
        activeRedPolyGeoJSON = turf.union(activeRedPolyGeoJSON, captureZone);
        const cut = turf.difference(activeBluePolyGeoJSON, clearanceZone);
        if (cut) activeBluePolyGeoJSON = cut;
    }
    if (activeGreyPolyGeoJSON) {
        activeGreyPolyGeoJSON = turf.union(activeGreyPolyGeoJSON, clearanceZone);
        const c1 = turf.difference(activeGreyPolyGeoJSON, activeBluePolyGeoJSON);
        if (c1) activeGreyPolyGeoJSON = c1;
        const c2 = turf.difference(activeGreyPolyGeoJSON, activeRedPolyGeoJSON);
        if (c2) activeGreyPolyGeoJSON = c2;
    }
    redrawPolygons();
    saveGameState();
}

// === 10. БРИГАДИ ===
let _brigadeIdCounter = 1;

function spawnSpecificBrigade(templateKey) {
    const template = unitTemplates[templateKey];
    if (!template) return;

    const isDeployed = activeBrigades.some(b => b.data.templateId === templateKey);
    if (isDeployed) {
        alert(`Бригада "${template.name}" вже розгорнута на мапі!`);
        return;
    }

    let brigadeData = reserveBrigades[templateKey];
    if (brigadeData) {
        delete reserveBrigades[templateKey];
    } else {
        brigadeData = { ...template, templateId: templateKey, currentMen: template.totalMen, daysOnFront: 0 };
    }

    const center = map.getCenter();
    createBrigadeMarker(brigadeData, center.lat, center.lng - 0.05, templateKey);
    saveGameState();
    updateBrigadeMenuButtons(); 
}

function spawnEnemy() {
    const center = map.getCenter();
    const eTemplate = unitTemplates['ENEMY'];
    const data = { ...eTemplate, currentMen: eTemplate.totalMen, daysOnFront: 0 };
    createBrigadeMarker(data, center.lat, center.lng + 0.05, null);
    saveGameState();
}

function createBrigadeMarker(template, lat, lng, templateKey = null) {
    const data = {
        id:          template.id || `b_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        templateId:  templateKey || template.templateId,
        name:        template.name,
        type:        template.type,
        totalMen:    template.totalMen, 
        currentMen:  template.currentMen !== undefined ? template.currentMen : template.totalMen, 
        attack:      template.attack,
        defense:     template.defense,
        color:       template.color,
        daysOnFront: template.daysOnFront || 0,
        logo:        template.logo
    };

    const marker = L.marker([lat, lng], {
        icon: makeBrigadeIcon(data)
    }).addTo(map);

    const brigadeObj = { marker, data, lat, lng };

    marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        openBrigadePanel(brigadeObj);
    });

    marker.dragging.enable();
    marker.on('dragend', () => {
        const pos = marker.getLatLng();
        brigadeObj.lat = pos.lat;
        brigadeObj.lng = pos.lng;
        saveGameState();
    });

    activeBrigades.push(brigadeObj);
    return brigadeObj;
}

function updateBrigadeVisuals(brigadeObj) {
    if (brigadeObj && brigadeObj.marker) {
        brigadeObj.marker.setIcon(makeBrigadeIcon(brigadeObj.data));
    }
}

function makeBrigadeIcon(data) {
    const deployed = typeof getDeployedMen === 'function' ? getDeployedMen(data.id) : 0;
    const reserved = data.currentMen - deployed;
    const maxMen = data.totalMen;
    
    let displayReserved = reserved;
    let overcapText = '';
    
    if (reserved > maxMen) {
        displayReserved = maxMen;
        overcapText = ` <span style="color:#00ff88; font-size:9px;">(+${reserved - maxMen})</span>`;
    }

    const pct = Math.round((reserved / maxMen) * 100);
    const fatigued = data.daysOnFront > 60;
    
    const logoHtml = data.logo 
        ? `<img src="${data.logo}" style="width: 36px; height: 36px; object-fit: contain; margin-bottom: 2px; border: none; background: transparent; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8));">` 
        : '';

    // Переносимо всі класи всередину HTML і центруємо абсолютно
    let html = `
    <div class="unit-marker ${data.color}" style="position: absolute; transform: translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; justify-content:center; white-space:nowrap; padding:4px;">
        ${logoHtml}
        <div style="font-weight:bold; text-shadow: 1px 1px 2px black, -1px -1px 2px black, 1px -1px 2px black, -1px 1px 2px black;">${data.type}</div>
        <div style="color:${pct > 60 ? '#00ff88' : pct > 30 ? '#ffcc00' : '#ff4444'}; text-shadow: 1px 1px 2px black, -1px -1px 2px black;">
            ${displayReserved}${overcapText} / ${maxMen}
        </div>
        ${fatigued ? '<div style="font-size:11px;">🥵</div>' : ''}
    </div>`;
    
    return L.divIcon({ 
        className: '', // Пустий клас, щоб Leaflet не додавав зміщення
        html, 
        iconSize: [0, 0], 
        iconAnchor: [0, 0] 
    });
}

function getDeployedMen(brigadeId) {
    return activeDetachments
        .filter(d => d.brigadeId === brigadeId)
        .reduce((sum, d) => sum + d.size, 0);
}

function getDefenseMen(brigadeId) {
    return activeDetachments
        .filter(d => d.brigadeId === brigadeId && d.role === 'defense')
        .reduce((sum, d) => sum + d.size, 0);
}

function getAssaultMen(brigadeId) {
    return activeDetachments
        .filter(d => d.brigadeId === brigadeId && d.role === 'assault')
        .reduce((sum, d) => sum + d.size, 0);
}

function getReservedMen(brigadeId) {
    const b = activeBrigades.find(b => b.data.id === brigadeId);
    if (!b) return 0;
    return b.data.currentMen - getDeployedMen(brigadeId);
}

// === 11. ПАНЕЛЬ БРИГАДИ ===
function openBrigadePanel(brigadeObj) {
    if (sendingDetachment) return; 
    selectedBrigade = brigadeObj;
    closeFortInfoPanel();
    updateBrigadePanel(brigadeObj);
    document.getElementById('brigade-panel').classList.add('visible');
    
    // Ховаємо блок поповнення для ворога
    document.getElementById('bpanel-reinforce-section').style.display = 
        brigadeObj.data.color === 'unit-blue' ? 'block' : 'none';
}

function closeBrigadePanel() {
    selectedBrigade = null;
    document.getElementById('brigade-panel').classList.remove('visible');
    sendingDetachment = null;
    document.getElementById('send-det-form').style.opacity = '1';
}

function updateBrigadePanel(b) {
    const d = b.data;
    const reserved  = getReservedMen(d.id);
    const onDefense = getDefenseMen(d.id);
    const onAssault = getAssaultMen(d.id);

    document.getElementById('bpanel-name').innerText = d.name;
    document.getElementById('bpanel-total').innerText    = d.totalMen;
    document.getElementById('bpanel-reserve').innerText  = reserved;
    document.getElementById('bpanel-on-defense').innerText = onDefense;
    document.getElementById('bpanel-on-assault').innerText = onAssault;
    document.getElementById('bpanel-days').innerText     = d.daysOnFront;

    const warn = document.getElementById('brigade-days-warning');
    warn.innerText = d.daysOnFront > 60
        ? '⚠ Потребує ротації! Штраф -40% до ефективності.'
        : '';

    const list = document.getElementById('detachment-list');
    const myDets = activeDetachments.filter(det => det.brigadeId === d.id);
    if (myDets.length === 0) {
        list.innerHTML = '<small style="color:#556">Немає активних загонів.</small>';
    } else {
        list.innerHTML = myDets.map(det => {
            const roleLabel = det.role === 'defense'
                ? `<span class="det-role-def">🛡 оборона</span>`
                : `<span class="det-role-att">⚔ штурм</span>`;
            const fortInfo = det.fortId
                ? ` @ ${fortifications[getFortById(det.fortId)?.type]?.name || '?'}`
                : '';
            return `<div class="det-row">
                <span>${det.size} ос. ${roleLabel}${fortInfo}</span>
                <button class="det-recall" onclick="recallDetachment('${det.id}')">↩ Повернути</button>
            </div>`;
        }).join('');
    }

    const hasReserve = reserved > 0;
    document.getElementById('btn-send-defense').disabled = !hasReserve;
    document.getElementById('btn-send-assault').disabled = !hasReserve;
}

// === 12. ЗАГОНИ (DETACHMENTS) ===
let _detIdCounter = 1;

function startSendDetachment(role) {
    if (!selectedBrigade) return;
    const size = parseInt(document.getElementById('det-size').value) || 100;
    const reserved = getReservedMen(selectedBrigade.data.id);
    if (size > reserved) {
        alert(`Недостатньо резерву! Доступно: ${reserved}`);
        return;
    }
    sendingDetachment = { brigade: selectedBrigade, size, role };

    map.getContainer().style.cursor = 'crosshair';
    document.getElementById('send-det-form').style.opacity = '0.4';

    const roleText = role === 'defense' ? 'оборонну позицію' : 'ціль штурму';
    document.getElementById('combat-log').classList.remove('hidden');
    document.getElementById('combat-text').innerHTML =
        `<span style="color:#ffcc00">Оберіть на мапі ${roleText} для загону (${size} ос.).<br>ПКМ — скасувати.</span>`;
}

map.on('click', function(e) {
    // 1. Якщо ми переміщуємо існуючий загін
    if (movingDetachment) {
        const { detObj, brigade } = movingDetachment;
        movingDetachment = null;
        map.getContainer().style.cursor = '';
        document.getElementById('combat-log').classList.add('hidden');
        document.querySelectorAll('.det-marker').forEach(el => el.classList.remove('selected-det'));

        // Знімаємо з попереднього укріплення
        if (detObj.fortId) {
            const fort = getFortById(detObj.fortId);
            if (fort) {
                fort.garrisonIds = (fort.garrisonIds || []).filter(id => id !== detObj.id);
                updateFortVisuals(fort);
            }
            detObj.fortId = null;
        }

        // Рухаємо в нову точку (параметр false означає, що загін вже на мапі)
        animateDetachmentMove(detObj, brigade, e.latlng.lat, e.latlng.lng, false);
        return;
    }

    // 2. Якщо ми відправляємо новий загін
    if (sendingDetachment) {
        const { brigade, size, role } = sendingDetachment;
        sendingDetachment = null;
        map.getContainer().style.cursor = '';
        document.getElementById('send-det-form').style.opacity = '1';
        document.getElementById('combat-log').classList.add('hidden');

        createDetachmentMarker(brigade, size, role, e.latlng.lat, e.latlng.lng);
        updateBrigadePanel(brigade);
        updateBrigadeVisuals(brigade);
        saveGameState();
        return;
    }

    // 3. Якщо режим укріплень
    if (fortPlacementMode && fortPlacementType) {
        L.DomEvent.stopPropagation(e);
        createFortMarker(fortPlacementType, e.latlng.lat, e.latlng.lng);
        saveGameState();
    }
});

map.on('contextmenu', function() {
    if (movingDetachment) {
        movingDetachment = null;
        map.getContainer().style.cursor = '';
        document.getElementById('combat-log').classList.add('hidden');
        document.querySelectorAll('.det-marker').forEach(el => el.classList.remove('selected-det'));
    }
    if (sendingDetachment) {
        sendingDetachment = null;
        map.getContainer().style.cursor = '';
        document.getElementById('send-det-form').style.opacity = '1';
        document.getElementById('combat-log').classList.add('hidden');
    }
});

function createDetachmentMarker(brigade, size, role, lat, lng, existingId, fortId) {
    const id = existingId || `d_${_detIdCounter++}`;
    const color = brigade.data.color;
    const cssClass = color === 'unit-blue'
        ? (role === 'defense' ? 'det-blue-def' : 'det-blue-att')
        : (role === 'defense' ? 'det-red-def'  : 'det-red-att');

    const roleIcon = role === 'defense' ? '🛡' : '⚔';
    
    // Нульовий якір + ідеальне центрування контенту
    const icon = L.divIcon({
        className: '', 
        html: `
        <div class="det-marker ${cssClass}" style="position: absolute; transform: translate(-50%, -50%); padding: 4px 6px; white-space: nowrap;">
            <div style="text-align:center; line-height:1.1;">
                <span style="font-size:12px;">${roleIcon}</span><br>
                <span style="font-size:11px; font-weight:bold;">${size}</span>
            </div>
        </div>`,
        iconSize: [0, 0], 
        iconAnchor: [0, 0]
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    marker.dragging.enable();

    const detObj = {
        id, brigadeId: brigade.data.id,
        marker, lat, lng, size, role,
        fortId: fortId || null,
        isBusy: false,
        currentOrg: size
    };

    marker.on('dragend', () => {
        const pos = marker.getLatLng();
        detObj.lat = pos.lat;
        detObj.lng = pos.lng;
        checkDetachmentInFort(detObj);
        saveGameState();
    });

    marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        if (selectedBrigade && selectedBrigade.data.color !== brigade.data.color) {
            initiateCombat(selectedBrigade, detObj);
        }
    });

    activeDetachments.push(detObj);

    if (role === 'defense' || role === 'assault') {
        animateDetachmentMove(detObj, brigade, lat, lng);
    }

    return detObj;
}


function updateDetachmentVisuals(detObj, brigade) {
    if (!detObj.marker) return;
    const color = brigade.data.color;
    const cssClass = color === 'unit-blue'
        ? (detObj.role === 'defense' ? 'det-blue-def' : 'det-blue-att')
        : (detObj.role === 'defense' ? 'det-red-def'  : 'det-red-att');

    const roleIcon = detObj.role === 'defense' ? '🛡' : '⚔';
    
    const icon = L.divIcon({
        className: '', 
        html: `
        <div class="det-marker ${cssClass}" style="position: absolute; transform: translate(-50%, -50%); padding: 4px 6px; white-space: nowrap;">
            <div style="text-align:center; line-height:1.1;">
                <span style="font-size:12px;">${roleIcon}</span><br>
                <span style="font-size:11px; font-weight:bold;">${detObj.size}</span>
            </div>
        </div>`,
        iconSize: [0, 0], 
        iconAnchor: [0, 0]
    });
    
    // Ця команда змушує мапу миттєво оновити іконку з новою цифрою
    detObj.marker.setIcon(icon);
}

function checkDetachmentInFort(detObj) {
    activeForts.forEach(fort => {
        const dist = map.distance([detObj.lat, detObj.lng], [fort.lat, fort.lng]);
        if (dist < 1500 && detObj.role === 'defense') { 
            if (!fort.garrisonIds) fort.garrisonIds = [];
            const slots = fortifications[fort.type]?.slots || 1;
            if (fort.garrisonIds.length < slots && !fort.garrisonIds.includes(detObj.id)) {
                fort.garrisonIds.push(detObj.id);
                detObj.fortId = fort.id;
                updateFortVisuals(fort);
            }
        }
    });
}

function getFortById(id) {
    return activeForts.find(f => f.id === id);
}

function recallDetachment(detId) {
    const det = activeDetachments.find(d => d.id === detId);
    if (!det) return;

    if (det.fortId) {
        const fort = getFortById(det.fortId);
        if (fort) {
            fort.garrisonIds = (fort.garrisonIds || []).filter(id => id !== detId);
            updateFortVisuals(fort);
        }
    }

    map.removeLayer(det.marker);
    activeDetachments = activeDetachments.filter(d => d.id !== detId);

    const brigade = activeBrigades.find(b => b.data.id === det.brigadeId);
    if (brigade) {
        updateBrigadePanel(brigade);
        updateBrigadeVisuals(brigade);
    }
    saveGameState();
}

function animateDetachmentMove(detObj, brigade, targetLat, targetLng) {
    const startPos = brigade.marker.getLatLng();
    detObj.marker.setLatLng(startPos);

    const lineColor = brigade.data.color === 'unit-blue' ? '#00ff88' : '#ff6644';
    const moveLine = L.polyline([startPos, [targetLat, targetLng]], {
        color: lineColor, dashArray: '4,8', weight: 2, opacity: 0.6
    }).addTo(map);

    const speed = 0.00015; // Швидкість переміщення (змініть, якщо треба швидше/повільніше)
    let lastTime = performance.now();

    function step(now) {
        const dt = now - lastTime;
        lastTime = now;
        
        const cur = detObj.marker.getLatLng();
        
        // Вираховуємо різницю в географічних координатах
        const dLat = targetLat - cur.lat;
        const dLng = targetLng - cur.lng;
        const distanceInCoords = Math.sqrt(dLat * dLat + dLng * dLng);
        
        // Відстань, яку загін пройде за поточний мікро-кадр
        const stepSize = speed * dt;

        // ЗАПОБІЖНИК: якщо крок більший за залишок шляху — примагнічуємо маркер рівно в ціль
        if (distanceInCoords <= stepSize) {
            map.removeLayer(moveLine);
            detObj.marker.setLatLng([targetLat, targetLng]);
            detObj.lat = targetLat;
            detObj.lng = targetLng;
            
            // Логіка після прибуття
            checkDetachmentInFort(detObj);
            if (detObj.role === 'assault') {
                startDetachmentAssault(detObj, brigade);
            }
            saveGameState();
            return;
        }

        // Інакше — рухаємося строго по прямій до цілі без відхилень
        const ratio = stepSize / distanceInCoords;
        const newLat = cur.lat + dLat * ratio;
        const newLng = cur.lng + dLng * ratio;
        
        detObj.marker.setLatLng([newLat, newLng]);
        moveLine.setLatLngs([[newLat, newLng], [targetLat, targetLng]]);
        
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// === 13. БІЙ ===
function initiateCombat(attackerBrigade, defenderDet) {
    if (defenderDet.isBusy) return;
    defenderDet.isBusy = true;

    const attackerDets = activeDetachments.filter(
        d => d.brigadeId === attackerBrigade.data.id && d.role === 'assault' && !d.isBusy
    );
    if (attackerDets.length === 0) {
        alert('Немає вільних штурмових загонів! Відрядіть загін у штурм.');
        defenderDet.isBusy = false;
        return;
    }
    const attackerDet = attackerDets[0];
    attackerDet.isBusy = true;

    runCombat(attackerDet, defenderDet);
}

function startDetachmentAssault(detObj, brigade) {
    const enemy = activeDetachments.find(d => {
        const b = activeBrigades.find(b => b.data.id === d.brigadeId);
        if (!b) return false;
        if (b.data.color === brigade.data.color) return false;
        const dist = map.distance([detObj.lat, detObj.lng], [d.lat, d.lng]);
        return dist < 2000 && !d.isBusy;
    });
    if (enemy) {
        detObj.isBusy = true;
        enemy.isBusy = true;
        runCombat(detObj, enemy);
    } else {
        startZoneClearing(detObj, brigade);
    }
}

function runCombat(attackerDet, defenderDet) {
    const attBrigade  = activeBrigades.find(b => b.data.id === attackerDet.brigadeId);
    const defBrigade  = activeBrigades.find(b => b.data.id === defenderDet.brigadeId);
    if (!attBrigade || !defBrigade) return;

    let attOrg = attackerDet.size;
    let defOrg = defenderDet.size;

    let fortBonus = 1.0;
    if (defenderDet.fortId) {
        const fort = getFortById(defenderDet.fortId);
        if (fort) fortBonus = fortifications[fort.type]?.defBonus || 1.0;
    }

    const attData = attBrigade.data;
    const defData = defBrigade.data;

    const log = document.getElementById('combat-log');
    const txt = document.getElementById('combat-text');
    log.classList.remove('hidden');
    let hoursElapsed = 0;

    const interval = setInterval(() => {
        hoursElapsed++;

        let attPow = attData.attack;
        let defPow = defData.defense * fortBonus; 

        if (attData.daysOnFront > 60) attPow *= 0.6;
        if (defData.daysOnFront > 60) defPow *= 0.6;
        if (attData.type === 'SSO') { attPow *= hoursElapsed <= 48 ? 1.5 : 0.5; }

        const rngAtt = 0.8 + Math.random() * 0.4;
        const rngDef = 0.8 + Math.random() * 0.4;

        const attackerCasualties = (defPow * rngDef * fortBonus) / 12;
        const defenderCasualties = (attPow * rngAtt) / (12 * fortBonus);

        const attLoss = Math.round(attackerCasualties);
        const defLoss = Math.round(defenderCasualties);

        defOrg -= defLoss;
        attOrg -= attLoss;
        
        // ВІДНІМАЄМО ВТРАТИ ВІД БРИГАД
        attBrigade.data.currentMen = Math.max(0, attBrigade.data.currentMen - attLoss);
        defBrigade.data.currentMen = Math.max(0, defBrigade.data.currentMen - defLoss);
        
        attackerDet.size = Math.max(0, Math.floor(attOrg));
        defenderDet.size = Math.max(0, Math.floor(defOrg));

        // ОНОВЛЮЄМО ВІЗУАЛ НА КАРТІ В РЕАЛЬНОМУ ЧАСІ
        updateBrigadeVisuals(attBrigade);
        updateBrigadeVisuals(defBrigade);
        updateDetachmentVisuals(attackerDet, attBrigade);
        updateDetachmentVisuals(defenderDet, defBrigade);
        
        // Динамічно оновлюємо відкриті меню
        if (selectedBrigade) updateBrigadePanel(selectedBrigade);
        if (selectedFort) openFortInfoPanel(selectedFort);

        const attPct = Math.max(0, attOrg / attackerDet.currentOrg * 100).toFixed(0);
        const defPct = Math.max(0, defOrg / defenderDet.currentOrg * 100).toFixed(0);

        txt.innerHTML = `<b>БІЙ | </b>${Math.floor(hoursElapsed/24)} дн. ${hoursElapsed%24} год.<br>
        ⚔ ${attBrigade.data.name} — ${attackerDet.size} ос. [${attPct}%]<br>
        🛡 ${defBrigade.data.name} — ${defenderDet.size} ос. [${defPct}%]<br>
        ${defenderDet.fortId ? `Укриття: ${fortifications[getFortById(defenderDet.fortId).type].name} ×${fortBonus}` : 'Бій у полі'}`;

        // ЛОГІКА ВТЕЧІ/ЗДАЧІ В ПОЛОН (<= 10% від початкового складу)
        let attDefeated = attOrg <= (0.1 * attackerDet.currentOrg) || attOrg <= 0;
        let defDefeated = defOrg <= (0.1 * defenderDet.currentOrg) || defOrg <= 0;

        if (attDefeated || defDefeated) {
            clearInterval(interval);
            
            const attackerWon = !attDefeated;
            const winner = attackerWon ? attBrigade : defBrigade;
            const loser = attackerWon ? defBrigade : attBrigade;
            const loserDet = attackerWon ? defenderDet : attackerDet;
            const winnerDet = attackerWon ? attackerDet : defenderDet;

            let resolutionText = "повністю знищено 💀";
            
            if (loserDet.size > 0) {
                if (Math.random() > 0.5) {
                    resolutionText = "здався в полон 🏳️";
                    // Якщо полон - люди зникають назавжди
                    loser.data.currentMen = Math.max(0, loser.data.currentMen - loserDet.size);
                    loserDet.size = 0; 
                } else {
                    resolutionText = "втік з поля бою 🏃";
                    // Якщо втеча - залишки людей повертаються в бригаду (нічого не віднімаємо)
                }
            }

            txt.innerHTML += `<br><br><span style="color:yellow">🏆 ${winner.data.name} перемогла!</span><br><span style="color:#ff8888">Загін ворога ${resolutionText}.</span>`;

            // Ті, хто програв (втекли/полон) - прибираються з карти
            loserDet.isBusy = false;
            recallDetachment(loserDet.id);

            // Переможець залишається і захоплює зону (якщо він атакував)
            winnerDet.isBusy = false;
            if (attackerWon) {
                advanceFrontline(winnerDet.lat, winnerDet.lng, winner.data.color === 'unit-blue');
            }

            setTimeout(() => {
                log.classList.add('hidden');
                saveGameState();
            }, 6000);
        }
    }, 1000);
}

function startZoneClearing(detObj, brigade) {
    const log = document.getElementById('combat-log');
    const txt = document.getElementById('combat-text');
    log.classList.remove('hidden');
    const timeRequired = brigade.data.type === 'SSO' ? 5 : 10;
    let hours = 0;

    const interval = setInterval(() => {
        hours++;
        txt.innerHTML = `<b>Зачистка</b> | ${hours}/${timeRequired} год.<br>${brigade.data.name} — ${detObj.size} ос.`;

        if (hours >= timeRequired) {
            clearInterval(interval);
            txt.innerHTML += `<br><span style="color:yellow">✅ Захоплено!</span>`;
            advanceFrontline(detObj.lat, detObj.lng, brigade.data.color === 'unit-blue');
            setTimeout(() => log.classList.add('hidden'), 4000);
        }
    }, 1000);
}

// === 14. УКРІПЛЕННЯ ===
let _fortIdCounter = 1;

function toggleFortMode() {
    fortPlacementMode = !fortPlacementMode;
    const panel = document.getElementById('fort-mode-panel');
    if (fortPlacementMode) {
        panel.classList.add('active');
        document.getElementById('btn-fort-mode').style.background = '#003366';
        document.getElementById('btn-fort-mode').style.color = '#00ff88';
    } else {
        exitFortMode();
    }
    toggleMainMenu();
}

function exitFortMode() {
    fortPlacementMode = false;
    fortPlacementType = null;
    map.getContainer().style.cursor = '';
    document.getElementById('fort-mode-panel').classList.remove('active');
    document.getElementById('btn-fort-mode').style.background = '';
    document.getElementById('btn-fort-mode').style.color = '';
    document.querySelectorAll('.fort-palette-btn').forEach(b => b.classList.remove('selected'));
}

function selectFortType(type) {
    fortPlacementType = type;
    map.getContainer().style.cursor = 'crosshair';
    document.querySelectorAll('.fort-palette-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector(`.fort-palette-btn[data-fort="${type}"]`).classList.add('selected');
}

map.on('click', function(e) {
    if (sendingDetachment) return; 
    if (!fortPlacementMode || !fortPlacementType) return;

    L.DomEvent.stopPropagation(e);
    createFortMarker(fortPlacementType, e.latlng.lat, e.latlng.lng);
    saveGameState();
});

function createFortMarker(type, lat, lng, garrisonIds = []) {
    const fDef = fortifications[type];
    if (!fDef) return;

    const id = `f_${_fortIdCounter++}`;
    
    const icon = L.divIcon({
        className: '',
        html: `
        <div class="fort-map-marker" style="position: absolute; transform: translate(-50%, -50%);">
            <span title="${fDef.name}">${fDef.icon}</span>
        </div>`,
        iconSize: [0, 0], 
        iconAnchor: [0, 0]
    });

    const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
    const fortObj = { id, type, marker, lat, lng, garrisonIds: [...garrisonIds] };

    marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        if (fortPlacementMode) return;
        openFortInfoPanel(fortObj);
    });

    marker.on('dragend', () => {
        const pos = marker.getLatLng();
        fortObj.lat = pos.lat;
        fortObj.lng = pos.lng;
        updateFortVisuals(fortObj);
        saveGameState();
    });

    marker.on('contextmenu', e => {
        L.DomEvent.stopPropagation(e);
        if (confirm(`Видалити ${fDef.name}?`)) {
            fortObj.garrisonIds.forEach(dId => {
                const det = activeDetachments.find(d => d.id === dId);
                if (det) det.fortId = null;
            });
            map.removeLayer(marker);
            activeForts = activeForts.filter(f => f.id !== id);
            closeFortInfoPanel();
            saveGameState();
        }
    });

    activeForts.push(fortObj);
    updateFortVisuals(fortObj);
    return fortObj;
}

function updateFortVisuals(fortObj) {
    const garrisoned = fortObj.garrisonIds && fortObj.garrisonIds.length > 0;
    const fDef = fortifications[fortObj.type];
    
    let garrisonColorClass = '';
    if (garrisoned) {
        const firstDetId = fortObj.garrisonIds[0];
        const det = activeDetachments.find(d => d.id === firstDetId);
        if (det) {
            const brig = activeBrigades.find(b => b.data.id === det.brigadeId);
            if (brig) garrisonColorClass = brig.data.color === 'unit-blue' ? 'fort-blue' : 'fort-red';
        }
    }

    const icon = L.divIcon({
        className: '',
        html: `
        <div class="fort-map-marker ${garrisoned ? 'garrisoned ' + garrisonColorClass : ''}" style="position: absolute; transform: translate(-50%, -50%);">
            <span title="${fDef.name}">${fDef.icon}${garrisoned ? '🛡️' : ''}</span>
        </div>`,
        iconSize: [0, 0], 
        iconAnchor: [0, 0]
    });
    fortObj.marker.setIcon(icon);
}

function updateFortVisuals(fortObj) {
    const garrisoned = fortObj.garrisonIds && fortObj.garrisonIds.length > 0;
    const fDef = fortifications[fortObj.type];
    
    let garrisonColorClass = '';
    if (garrisoned) {
        const firstDetId = fortObj.garrisonIds[0];
        const det = activeDetachments.find(d => d.id === firstDetId);
        if (det) {
            const brig = activeBrigades.find(b => b.data.id === det.brigadeId);
            if (brig) garrisonColorClass = brig.data.color === 'unit-blue' ? 'fort-blue' : 'fort-red';
        }
    }

    const icon = L.divIcon({
        className: `fort-map-marker ${garrisoned ? 'garrisoned ' + garrisonColorClass : ''}`,
        html: `<span title="${fDef.name}">${fDef.icon}${garrisoned ? '🛡️' : ''}</span>`,
        iconSize: [40, 40], iconAnchor: [20, 20]
    });
    fortObj.marker.setIcon(icon);
}

// === 15. ПАНЕЛЬ УКРІПЛЕННЯ ===
function openFortInfoPanel(fortObj) {
    selectedFort = fortObj;
    closeBrigadePanel();
    const fDef = fortifications[fortObj.type];
    document.getElementById('fi-name').innerText = `${fDef.icon} ${fDef.name}`;
    document.getElementById('fi-type').innerText  = fDef.desc;
    document.getElementById('fi-bonus').innerText = `×${fDef.defBonus} (${Math.round((fDef.defBonus-1)*100)}%)`;
    document.getElementById('fi-slots').innerText = `${(fortObj.garrisonIds||[]).length} / ${fDef.slots} зайнято`;

    const garrisonEl = document.getElementById('fort-garrison-list');
    const ids = fortObj.garrisonIds || [];
    if (ids.length === 0) {
        garrisonEl.innerHTML = '<div style="color:#556;font-size:11px;">Порожньо. Перетягніть загін поруч.</div>';
    } else {
        garrisonEl.innerHTML = ids.map(dId => {
            const det = activeDetachments.find(d => d.id === dId);
            if (!det) return '';
            const brig = activeBrigades.find(b => b.data.id === det.brigadeId);
            return `<div class="garrison-row">🛡 ${brig ? brig.data.name : '?'} — ${det.size} ос.</div>`;
        }).join('');
    }

    document.getElementById('fort-info-panel').classList.add('visible');
}

function closeFortInfoPanel() {
    selectedFort = null;
    document.getElementById('fort-info-panel').classList.remove('visible');
}

// === 16. UI HELPERS ТА РОТАЦІЯ ===
function toggleMainMenu()      { document.getElementById('game-menu').classList.toggle('hidden'); }
function toggleHistoricalMenu(){ document.getElementById('historical-submenu').classList.toggle('hidden'); }

function reinforceBrigade() {
    if (!selectedBrigade) return;
    const amountInput = document.getElementById('reinforce-amount');
    const amount = parseInt(amountInput.value);
    
    if (isNaN(amount) || amount <= 0) return;
    if (amount > globalManpowerPool) {
        alert(`Недостатньо резерву Ставки! Доступно: ${globalManpowerPool}`);
        return;
    }

    globalManpowerPool -= amount;
    selectedBrigade.data.currentMen += amount; 
    amountInput.value = '';

    updateManpowerUI();
    updateBrigadePanel(selectedBrigade);
    updateBrigadeVisuals(selectedBrigade);
    saveGameState();
}

function withdrawToReserve() {
    if (!selectedBrigade) return;
    const b = selectedBrigade;
    const tId = b.data.templateId;

    if (b.data.color !== 'unit-blue' || !tId) {
        alert("Ворога не можна відвести в резерв таким чином!");
        return;
    }

    const myDets = activeDetachments.filter(d => d.brigadeId === b.data.id);
    if (myDets.some(d => d.isBusy)) {
        alert("Неможливо відвести бригаду, поки її загони ведуть бій!");
        return;
    }

    myDets.forEach(d => recallDetachment(d.id));

    reserveBrigades[tId] = b.data;

    map.removeLayer(b.marker);
    activeBrigades = activeBrigades.filter(x => x.data.id !== b.data.id);

    closeBrigadePanel();
    updateBrigadeMenuButtons();
    saveGameState();
}

function updateBrigadeMenuButtons() {
    Object.keys(unitTemplates).forEach(key => {
        if (key === 'ENEMY') return;
        const btn = document.getElementById(`btn-spawn-${key}`);
        if (!btn) return;

        const isDeployed = activeBrigades.some(b => b.data.templateId === key);
        const inReserve = reserveBrigades[key];

        if (isDeployed) {
            btn.disabled = true;
            btn.classList.add('deployed-btn');
            btn.style.background = '';
            btn.innerText = `[На фронті] ${unitTemplates[key].name}`;
        } else if (inReserve) {
            btn.disabled = false;
            btn.classList.remove('deployed-btn');
            btn.style.background = '#0047AB'; 
            btn.innerText = `⛺ [В тилу] ${unitTemplates[key].name} (${inReserve.currentMen})`;
        } else {
            btn.disabled = false;
            btn.classList.remove('deployed-btn');
            btn.style.background = '';
            btn.innerText = unitTemplates[key].name;
        }
    });
}


// ============================================================
//  ШТУЧНИЙ ІНТЕЛЕКТ (МІНІ-ГЕНЕРАЛ ВОРОГА)
// ============================================================

function runEnemyAI() {
    const redBrigades = activeBrigades.filter(b => b.data.color === 'unit-red');
    
    // Шукаємо всі українські сили (для вибору цілей штурму)
    const blueUnits = activeDetachments.filter(d => {
        const b = activeBrigades.find(br => br.data.id === d.brigadeId);
        return b && b.data.color === 'unit-blue';
    });
    const blueBrigades = activeBrigades.filter(b => b.data.color === 'unit-blue');

    // 1. СТРАТЕГІЧНЕ РОЗГОРТАННЯ
    // Ворог створює нові бригади в міру проходження днів (максимум 8 бригад)
    const maxRedBrigades = Math.min(8, 2 + Math.floor(globalDays / 15)); 
    if (redBrigades.length < maxRedBrigades && aiManpowerPool >= 3000) {
        spawnEnemyAIBigade();
        aiManpowerPool -= 3000;
    }

    // 2. ТАКТИЧНІ ДІЇ БРИГАД
    redBrigades.forEach(brigade => {
        // Поповнення втрат: якщо в бригаді менше половини людей, ШІ доливає туди резерви
        if (brigade.data.currentMen < (brigade.data.totalMen * 0.5) && aiManpowerPool >= 1000) {
            brigade.data.currentMen += 1000;
            aiManpowerPool -= 1000;
            updateBrigadeVisuals(brigade);
        }

        const reserved = getReservedMen(brigade.data.id);
        const myDets = activeDetachments.filter(d => d.brigadeId === brigade.data.id);

        // Обмеження: ШІ керує максимум 4 загонами від однієї бригади, щоб не спамити
        if (reserved > 300 && myDets.length < 4) {
            // ШІ приймає рішення: Штурм (40% шанс) чи Оборона (60% шанс)
            const wantsToAttack = Math.random() > 0.6 && (blueUnits.length > 0 || blueBrigades.length > 0);
            
            // Випадковий розмір загону від 150 до 450 осіб
            const size = Math.floor(Math.random() * 300) + 150; 

            if (wantsToAttack) {
                // ШУКАЄМО ЦІЛЬ: Знаходимо найближчого українського юніта
                let target = null;
                let minDist = Infinity;
                [...blueUnits, ...blueBrigades].forEach(u => {
                    const dist = map.distance([brigade.lat, brigade.lng], [u.lat, u.lng]);
                    if (dist < minDist) { minDist = dist; target = u; }
                });

                if (target) {
                    // Зсуваємо ціль трохи вбік, щоб загони не йшли гуськом в одну піксельну точку
                    const tLat = target.lat + (Math.random() - 0.5) * 0.02;
                    const tLng = target.lng + (Math.random() - 0.5) * 0.02;
                    createDetachmentMarker(brigade, size, 'assault', tLat, tLng);
                }
            } else {
                // ОБОРОНА: Розставляємо захисні загони навколо своєї бригади
                const dLat = brigade.lat + (Math.random() - 0.5) * 0.1;
                const dLng = brigade.lng + (Math.random() - 0.5) * 0.1;
                createDetachmentMarker(brigade, size, 'defense', dLat, dLng);
            }
        }
    });
}

function spawnEnemyAIBigade() {
    let lat, lng;
    const redBrigades = activeBrigades.filter(b => b.data.color === 'unit-red');
    
    // Якщо вже є ворожі бригади — ШІ спавнить нові поруч з ними (формує фронт)
    if (redBrigades.length > 0) {
        const base = redBrigades[Math.floor(Math.random() * redBrigades.length)];
        lat = base.lat + (Math.random() - 0.5) * 0.3;
        lng = base.lng + (Math.random() - 0.5) * 0.3;
    } else {
        // Якщо це перша бригада, спавнить трохи на схід/північ від центру мапи
        const center = map.getCenter();
        lat = center.lat + 0.1;
        lng = center.lng + 0.2;
    }

    const templateKey = 'ENEMY';
    const eTemplate = unitTemplates[templateKey];
    const data = { ...eTemplate, templateId: templateKey, currentMen: eTemplate.totalMen, daysOnFront: 0 };
    createBrigadeMarker(data, lat, lng, templateKey);
}

// === 17. ІНІЦІАЛІЗАЦІЯ ===
if (!loadGameState()) {
    loadScenario('global');
}