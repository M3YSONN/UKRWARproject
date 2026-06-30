// ============================================================
//  ТАКТИЧНА ГРА — script.js 
// ============================================================

// === 1. ГЛОБАЛЬНІ ЗМІННІ ===
let globalManpowerPool = 0;   // Резерв ставки гравця
let aiManpowerPool     = 50000; // Резерв ставки ворога (ШІ)
let reserveBrigades    = {};
let activeBattalions   = [];   // Усі батальйони на мапі (обидва боки)
let selectedBattalion  = null;
let _battalionIdCounter = 1;

const googleHybrid = L.tileLayer(
    'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    { maxZoom: 19, attribution: '© Google' }
);
const map = L.map('map', {
    center: [48.5, 31.2], zoom: 6,
    layers: [googleHybrid], zoomControl: false
});
L.control.zoom({ position: 'topright' }).addTo(map);

// === 1.1 НАПРЯМКИ ЛБЗ (для зручного редагування за зведеннями Генштабу/DeepState) ===
// Порядок — з ПІВДНЯ на ПІВНІЧ, так само як в оригінальному суцільному масиві.
// Кожен напрямок — окремий шматок СИНЬОЇ (наша територія) і ЧЕРВОНОЇ (ворог) ліній.
//
// ⚠️ "label" — орієнтовні підписи за трьома відомими прив'язками з твоїх же сценаріїв
// (kherson/avdiivka/bakhmut center нижче співпадають з точками на лінії). Решта назв —
// приблизні за географією і ЇХ ТРЕБА ЗВІРИТИ й за потреби перейменувати під те, що
// бачиш на DeepState/у зведеннях Генштабу — ключі (key) можеш лишити як є, вони ніде
// в логіці гри не використовуються, це просто зручні "закладки" для пошуку в коді.
//
// ПРИ РЕДАГУВАННІ КООРДИНАТ: остання точка одного напрямку має ЗБІГАТИСЯ З
// першою точкою наступного — інакше на стику утвориться розрив лінії фронту.
// Дублювати її саму при редагуванні не потрібно — assembleFrontline() сама
// прибирає повтор стикової точки при склеюванні.
const frontDirections = [
    {
        key: "kherson",
        label: "Херсонський напрямок",
        blue: [[46.52,31.57],[46.63,32.61]],
        red:  [[46.49,31.60],[46.60,32.64]]
    },
    {
        key: "zaporizhzhia",
        label: "Запорізький / Оріхівський напрямок",
        blue: [[46.63,32.61],[47.20,34.00]],
        red:  [[46.60,32.64],[47.17,34.04]]
    },
    {
        key: "velyka_novosilka",
        label: "Гуляйпільський / В.Новосілка напрямок",
        blue: [[47.20,34.00],[47.45,35.30]],
        red:  [[47.17,34.04],[47.42,35.32]]
    },
    {
        key: "kurakhove",
        label: "Вугледарський / Курахівський напрямок",
        blue: [[47.45,35.30],[47.45,35.80]],
        red:  [[47.42,35.32],[47.42,35.82]]
    },
    {
        key: "pokrovsk",
        label: "Покровський / Мар'їнський напрямок",
        blue: [[47.45,35.80],[47.75,36.80]],
        red:  [[47.42,35.82],[47.72,36.82]]
    },
    {
        key: "avdiivka",
        label: "Авдіївський напрямок",
        blue: [[47.75,36.80],[47.85,37.45],[48.15,37.75]],
        red:  [[47.72,36.82],[47.82,37.48],[48.13,37.78]]
    },
    {
        key: "bakhmut",
        label: "Бахмутський / Часівоярський напрямок",
        blue: [[48.15,37.75],[48.60,37.95]],
        red:  [[48.13,37.78],[48.58,37.98]]
    },
    {
        key: "lyman",
        label: "Лиманський / Сіверський напрямок",
        blue: [[48.60,37.95],[48.95,38.25]],
        red:  [[48.58,37.98],[48.93,38.29]]
    },
    {
        key: "kupiansk",
        label: "Куп'янський напрямок",
        blue: [[48.95,38.25],[49.40,38.00]],
        red:  [[48.93,38.29],[49.38,38.04]]
    },
    {
        key: "kharkiv",
        label: "Харківський / Вовчанський напрямок",
        blue: [[49.40,38.00],[49.85,37.80],[50.35,36.90]],
        red:  [[49.38,38.04],[49.83,37.84],[50.36,36.94]]
    }
];

// Склеює напрямки в один безперервний масив координат — точно той формат,
// який вже їсть увесь решта коду (turfify(), loadScenario() тощо). Повторну
// стикову точку прибирає автоматично, тож у даних вище її дублювати не треба.
function assembleFrontline(directions, side) {
    let coords = [];
    directions.forEach(dir => {
        const seg = dir[side];
        const last = coords[coords.length - 1];
        const isDuplicate = last && last[0] === seg[0][0] && last[1] === seg[0][1];
        coords = coords.concat(isDuplicate ? seg.slice(1) : seg);
    });
    return coords;
}

// Дев-перевірка цілісності: якщо після редагування одного напрямку забув
// підправити сусідній і стик "розійшовся" — побачиш попередження в консолі
// браузера одразу при завантаженні сторінки, а не шукатимеш розрив на мапі.
function checkFrontDirectionsContinuity(directions) {
    ['blue', 'red'].forEach(side => {
        for (let i = 0; i < directions.length - 1; i++) {
            const a = directions[i][side], b = directions[i + 1][side];
            const aEnd = a[a.length - 1], bStart = b[0];
            if (aEnd[0] !== bStart[0] || aEnd[1] !== bStart[1]) {
                console.warn(`⚠️ Розрив ЛБЗ (${side}) між "${directions[i].label}" і "${directions[i + 1].label}": [${aEnd}] ≠ [${bStart}]`);
            }
        }
    });
}
checkFrontDirectionsContinuity(frontDirections);

// === 2. СЦЕНАРІЇ ===
const scenarios = {
    global: {
        center: [48.5, 31.2], zoom: 6,
        frontlineBlue: assembleFrontline(frontDirections, 'blue'),
        frontlineRed:  assembleFrontline(frontDirections, 'red'),
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
    zsu_1: { name: "1-ша ОВМБр", type: "ЗСУ", totalMen: 4000, attack: 50, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/1_%D0%9E%D0%A2%D0%91%D1%80.svg/960px-1_%D0%9E%D0%A2%D0%91%D1%80.svg.png" },
    zsu_3: { name: "3-тя ОВМБр", type: "ЗСУ", totalMen: 4000, attack: 50, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/3_%D0%9E%D0%A2%D0%91%D1%80_%D0%BA.svg/960px-3_%D0%9E%D0%A2%D0%91%D1%80_%D0%BA.svg.png" },
    zsu_4: { name: "4-та ОВМБр", type: "ЗСУ", totalMen: 4000, attack: 50, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/4th_Tank_Brigade.png/960px-4th_Tank_Brigade.png" },
    zsu_5: { name: "5-та ОВМБр", type: "ЗСУ", totalMen: 4000, attack: 50, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/2/23/5th_Tank_Brigade.png" },
    zsu_14: { name: "14-та ОВМБр", type: "ЗСУ", totalMen: 4500, attack: 60, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/14th_Mechanized_Brigade_%28Ukraine%29.svg/960px-14th_Mechanized_Brigade_%28Ukraine%29.svg.png" },

    
    
    
    zsu_3sh: { name: "3-тя ОШБр", type: "ЗСУ", totalMen: 5500, attack: 85, defense: 60, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/3%D0%BE%D1%88%D0%B1%D1%80_logo.svg/960px-3%D0%BE%D1%88%D0%B1%D1%80_logo.svg.png" },
    zsu_93:  { name: "93-тя ОМБр", type: "ЗСУ", totalMen: 5000, attack: 65, defense: 85, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/93_%D0%9E%D0%9C%D0%91%D1%80_%D0%BF.svg/960px-93_%D0%9E%D0%9C%D0%91%D1%80_%D0%BF.svg.png" },
    // ДШВ
    dshv_80: { name: "80-та ОДШБр", type: "ДШВ", totalMen: 3500, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/80_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg/960px-80_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg.png" },
    dshv_25: { name: "25-та ОПДБр", type: "ДШВ", totalMen: 3000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/25_%D0%9E%D0%9F%D0%94%D0%91%D1%80_%D0%BA.svg/960px-25_%D0%9E%D0%9F%D0%94%D0%91%D1%80_%D0%BA.svg.png" },
    dshv_78: { name: "78-та ОДШБр", type: "ДШВ", totalMen: 2500, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/78th_Air_Assault_Regiment_SSI.svg/960px-78th_Air_Assault_Regiment_SSI.svg.png" },
    dshv_79: { name: "79-та ОДШБр", type: "ДШВ", totalMen: 3000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/79_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg/960px-79_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg.png" },
    dshv_46: { name: "46-та ОАБр", type: "ДШВ", totalMen: 3000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/46th_Airmobile_Brigade.svg/960px-46th_Airmobile_Brigade.svg.png" },
    dshv_68: { name: "68-та ОАБр", type: "ДШВ", totalMen: 3500, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/%D0%A8%D0%B5%D0%B2%D1%80%D0%BE%D0%BD_68_%D0%BE%D0%B0%D0%B5%D0%BC%D0%B1%D1%80.png/960px-%D0%A8%D0%B5%D0%B2%D1%80%D0%BE%D0%BD_68_%D0%BE%D0%B0%D0%B5%D0%BC%D0%B1%D1%80.png" },
    dshv_71: { name: "71-та ОАБр", type: "ДШВ", totalMen: 3000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/71st_Jaeger_Brigade.svg/960px-71st_Jaeger_Brigade.svg.png" },
    dshv_82: { name: "82-та ОДШБр", type: "ДШВ", totalMen: 4000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/82nd_Air_Assault_Brigade.svg/960px-82nd_Air_Assault_Brigade.svg.png" },
    dshv_95: { name: "95-та ОДШБр", type: "ДШВ", totalMen: 4000, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/95_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg/960px-95_%D0%9E%D0%94%D0%A8%D0%91%D1%80_%D0%BA.svg.png" },
    dshv_132: { name: "132-ий ОРб", type: "ДШВ", totalMen: 700, attack: 85, defense: 20, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/132_%D0%9E%D0%A0%D0%91_%D0%BA.svg/960px-132_%D0%9E%D0%A0%D0%91_%D0%BA.svg.png" },

    
    


    dshv_77: { name: "77-та ОАБр", type: "ДШВ", totalMen: 2500, attack: 75, defense: 65, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/77th_Airmobile_Brigade.svg/960px-77th_Airmobile_Brigade.svg.png" },
    dshv_81: { name: "81-ша ОАеМБр", type: "ДШВ", totalMen: 3500, attack: 70, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/81_%D0%9E%D0%90%D0%B5%D0%9C%D0%91%D1%80_%D0%BA.svg/960px-81_%D0%9E%D0%90%D0%B5%D0%9C%D0%91%D1%80_%D0%BA.svg.png" },
    // НГУ
    
    ngu_azov:{ name: "12 БрСП «Азов»", type: "НГУ", totalMen: 5000, attack: 80, defense: 90, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/12th_Special_Purpose_Brigade_%27Azov%27_Insignia_-_First_Variant.png/960px-12th_Special_Purpose_Brigade_%27Azov%27_Insignia_-_First_Variant.png" },
    ngu_2:{ name: "2 окерма Галицька бригада ", type: "НГУ", totalMen: 2000, attack: 30, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/%D0%95%D0%BC%D0%B1%D0%BB%D0%B5%D0%BC%D0%B0_2-%D1%97_%D0%BE%D0%BA%D1%80%D0%B5%D0%BC%D0%BE%D1%97_%D0%93%D0%B0%D0%BB%D0%B8%D1%86%D1%8C%D0%BA%D0%BE%D1%97_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B8_%D0%9D%D0%93%D0%A3.png/960px-%D0%95%D0%BC%D0%B1%D0%BB%D0%B5%D0%BC%D0%B0_2-%D1%97_%D0%BE%D0%BA%D1%80%D0%B5%D0%BC%D0%BE%D1%97_%D0%93%D0%B0%D0%BB%D0%B8%D1%86%D1%8C%D0%BA%D0%BE%D1%97_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B8_%D0%9D%D0%93%D0%A3.png" },
    ngu_14:{ name: "14-та БроП", type: "НГУ", totalMen: 3500, attack: 80, defense: 50, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Chervona_kalyna_brigade_new.png/500px-Chervona_kalyna_brigade_new.png" },
    ngu_27:{ name: "27-ма бригада", type: "НГУ", totalMen: 2000, attack: 20, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/9/9c/27_%D0%9F%D0%91%D1%80_%D0%9D%D0%93%D0%A3.jpg" },
    ngu_3:{ name: "3-тя БроП", type: "НГУ", totalMen: 3000, attack: 70, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/%D0%9D%D0%B0%D1%80%D1%83%D0%BA%D0%B0%D0%B2%D0%BD%D0%B8%D0%B9_%D0%B7%D0%BD%D0%B0%D0%BA_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B8.jpg/960px-%D0%9D%D0%B0%D1%80%D1%83%D0%BA%D0%B0%D0%B2%D0%BD%D0%B8%D0%B9_%D0%B7%D0%BD%D0%B0%D0%BA_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B8.jpg" },
    ngu_5:{ name: "5-та бригада", type: "НГУ", totalMen: 3000, attack: 50, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/0/0d/5_%D0%A1%D0%BB%D0%BE%D0%B1%D0%BE%D0%B6%D0%B0%D0%BD%D1%81%D1%8C%D0%BA%D0%B0_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B0_%D0%A1%D0%BA%D1%96%D1%84_%D0%9D%D0%93%D0%A3.png" },
    ngu_18:{ name: "18-та бригада", type: "НГУ", totalMen: 2000, attack: 20, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/6/64/18-%D1%82%D0%B0_%D0%A1%D0%BB%D0%BE%D0%B2%27%D1%8F%D0%BD%D1%81%D1%8C%D0%BA%D0%B0_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B0_%D0%9D%D0%93%D0%A3.png" },
    ngu_17:{ name: "17-та бригада", type: "НГУ", totalMen: 2000, attack: 20, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/17-%D1%82%D0%B0_%D0%9F%D0%BE%D0%BB%D1%82%D0%B0%D0%B2%D1%81%D1%8C%D0%BA%D0%B0_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B0_%D0%9D%D0%93%D0%A3_3052.png/960px-17-%D1%82%D0%B0_%D0%9F%D0%BE%D0%BB%D1%82%D0%B0%D0%B2%D1%81%D1%8C%D0%BA%D0%B0_%D0%B1%D1%80%D0%B8%D0%B3%D0%B0%D0%B4%D0%B0_%D0%9D%D0%93%D0%A3_3052.png" },
    ngu_31:{ name: "31-та бригада", type: "НГУ", totalMen: 2000, attack: 20, defense: 70, color: "unit-blue", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/31POB.svg/960px-31POB.svg.png" },

    // Ворог
    ENEMY:   { name: "МСБр (РФ)", type: "ENEMY", totalMen: 3000, attack: 45, defense: 65, color: "unit-red", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Great_emblem_of_the_Russian_Ground_Forces.svg/960px-Great_emblem_of_the_Russian_Ground_Forces.svg.png" }
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

// --- "Органічна" форма захопленої зони ---
// Замість ідеального кола радіус "гуляє" по кількох синусоїдальних гармоніках
// різної частоти й фази (кожна наступна — слабша за попередню). В сумі це дає
// плавні, але нерівні виступи й вм'ятини — схоже на реальний клин просування,
// а не на циркуль. Випадковість генерується один раз на подію захоплення і
// "запікається" в фінальний полігон через turf.union, тому форма лишається
// стабільною після перемальовки (redrawPolygons просто рендерить збережений GeoJSON).
function organicRadiusProfile(irregularity = 0.4) {
    const harmonics = [
        { freq: 2 + Math.floor(Math.random() * 2), amp: irregularity,        phase: Math.random() * Math.PI * 2 },
        { freq: 4 + Math.floor(Math.random() * 3), amp: irregularity * 0.55, phase: Math.random() * Math.PI * 2 },
        { freq: 8 + Math.floor(Math.random() * 5), amp: irregularity * 0.25, phase: Math.random() * Math.PI * 2 },
    ];
    return angleRad => {
        let r = 1;
        harmonics.forEach(h => { r += h.amp * Math.sin(h.freq * angleRad + h.phase); });
        return Math.max(0.3, r); // не даємо радіусу "провалитись" у нуль чи в мінус
    };
}

function generateOrganicZone(lng, lat, baseRadiusKm, irregularity = 0.4) {
    const steps = 28; // достатньо вершин для плавності без зайвого навантаження на turf
    const profile = organicRadiusProfile(irregularity);
    const origin = turf.point([lng, lat]);

    const coords = [];
    for (let i = 0; i < steps; i++) {
        const angleRad = (i / steps) * Math.PI * 2;
        const r = baseRadiusKm * profile(angleRad);
        const dest = turf.destination(origin, r, angleRad * 180 / Math.PI, { units: 'kilometers' });
        coords.push(dest.geometry.coordinates);
    }
    coords.push(coords[0]);

    let poly = turf.polygon([coords]);
    // Легке згладжування, щоб вершини не виглядали "гранчасто"
    try { poly = turf.buffer(poly, Math.max(baseRadiusKm * 0.05, 0.02), { units: 'kilometers' }); } catch(e) {}
    return poly;
}

// Замість прямого "коридору" прориву — хвиляста лінія: кілька проміжних точок
// з випадковим бічним зсувом, що загасає до нуля на обох кінцях (sin(π·t)),
// тож коридор плавно "виростає" з ЛБЗ і так само плавно сходиться до вістря прориву.
function makeWavyCorridor(startCoord, endCoord, amplitudeKm) {
    const straight = turf.lineString([startCoord, endCoord]);
    const startPt = turf.point(startCoord), endPt = turf.point(endCoord);
    const distKm = turf.distance(startPt, endPt, { units: 'kilometers' });
    const bearing = turf.bearing(startPt, endPt);
    const segments = Math.min(6, Math.max(2, Math.round(distKm / 1.2)));

    const points = [startCoord];
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const base = turf.along(straight, distKm * t, { units: 'kilometers' });
        const lateral = (Math.random() - 0.5) * amplitudeKm * Math.sin(Math.PI * t);
        const offset = turf.destination(base, lateral, bearing + 90, { units: 'kilometers' });
        points.push(offset.geometry.coordinates);
    }
    points.push(endCoord);
    return turf.lineString(points);
}

function generateTacticalZone(lng, lat, baseRadiusKm, color) {
    return buildAdvanceWedge(lng, lat, baseRadiusKm, color);
}

// Знаходить найближчу точку на зовнішній границі полігону (нашої зони контролю).
// Використовується як "коренева точка" клину наступу — звідси він і "виростає".
function findNearestOnBorder(poly, targetPt) {
    try {
        const lines = turf.polygonToLine(poly);
        let nearest = null, minDist = Infinity;
        const tryLine = feat => {
            try {
                const pt = turf.nearestPointOnLine(feat, targetPt);
                if (pt.properties.dist < minDist) { minDist = pt.properties.dist; nearest = pt; }
            } catch(e) {}
        };
        if (lines.type === 'FeatureCollection') turf.featureEach(lines, tryLine);
        else tryLine(lines);
        return nearest;
    } catch(e) { return null; }
}

// ─── ГОЛОВНА ФУНКЦІЯ ФОРМИ ПРОРИВУ ────────────────────────────────────────────
// Підхід "коридор → відрізання своєї зони":
//   1. Будуємо злегка хвилястий коридор від точки на ЛБЗ до цілі (буфер навколо осі).
//   2. Вирізаємо з коридору частину, яка вже є у нашому полігоні.
//   3. Залишається тільки "виступ" ВЖЕ ВПЕРЕД, який природно виростає з поточної лінії
//      фронту — без штучної "основи клину" і без "прилепленого кружечка".
//   4. Додаємо невелику органічну "голову" в точці перемоги для м'якшого вістря.
// Результат виглядає як реальна вм'ятина у ворожу оборону — без зайвих ляпків.
function buildAdvanceWedge(targetLng, targetLat, depthKm, color) {
    const targetPt = turf.point([targetLng, targetLat]);
    const ownPoly  = color === 'unit-blue' ? activeBluePolyGeoJSON : activeRedPolyGeoJSON;

    if (!ownPoly) return generateOrganicZone(targetLng, targetLat, depthKm, 0.28);
    const nearest = findNearestOnBorder(ownPoly, targetPt);
    if (!nearest || nearest.properties.dist > 45)
        return generateOrganicZone(targetLng, targetLat, depthKm, 0.28);

    const baseCoord  = nearest.geometry.coordinates;
    const basePt     = turf.point(baseCoord);
    const advBearing = turf.bearing(basePt, targetPt);
    const totalDist  = turf.distance(basePt, targetPt, { units: 'kilometers' });

    // Ширина коридору: від 0.2 до 3.5 км, масштаб від глибини прориву
    const halfW = Math.max(0.20, Math.min(depthKm * 0.48, 3.5));

    // Злегка хвиляста вісь: одна проміжна точка зі зсувом вбік
    const midT       = totalDist * (0.38 + Math.random() * 0.22);
    const lateralKm  = (Math.random() - 0.5) * halfW * 0.40;
    const midBase    = turf.destination(basePt, midT, advBearing, { units: 'kilometers' });
    const midPt      = turf.destination(midBase, lateralKm, advBearing + 90, { units: 'kilometers' });
    // Вістря виступає трохи за ціль
    const tipPt = turf.destination(basePt, totalDist + depthKm * 0.14, advBearing, { units: 'kilometers' });

    const axisLine = turf.lineString([baseCoord, midPt.geometry.coordinates, tipPt.geometry.coordinates]);

    let corridor;
    try {
        corridor = turf.buffer(axisLine, halfW, { units: 'kilometers', steps: 8 });
    } catch(e) {
        return generateOrganicZone(targetLng, targetLat, depthKm, 0.28);
    }

    // КЛЮЧОВИЙ КРОК: прибираємо частину коридору, яка вже є у нашій зоні.
    // Залишається тільки виступ уперед — виростає органічно прямо з ЛБЗ.
    try {
        const forward = turf.difference(corridor, ownPoly);
        if (forward) {
            // Органічна "голова" в точці перемоги для плавного вістря замість гострого трикутника
            const headR = Math.max(depthKm * 0.22, 0.25);
            const head  = generateOrganicZone(targetLng, targetLat, headR, 0.22);
            return turf.union(forward, head);
        }
    } catch(e) {
        console.warn('buildAdvanceWedge clip failed, using corridor:', e);
    }

    return corridor;
}

// === 8. СТАБІЛЬНІСТЬ ЛБЗ — САНАЦІЯ ПОЛІГОНІВ ===
//
// Після багатьох turf.union / turf.difference операцій в полігонах накопичуються
// артефакти — крихітні ізольовані "острівці" (котли), невидимі нюанси вершин,
// мікрощілини між сусідніми зонами. Їх прибирає sanitizePoly:
//
//   keepLargest = true  (blue/red):
//       Синя і червона зони мають бути суцільними — берем НАЙБІЛЬШИЙ шматок
//       MultiPolygon і відкидаємо всі ізольовані "котли".
//
//   keepLargest = false (grey):
//       Сіра зона (нічийна земля) легально може бути в кількох місцях по фронту,
//       тому відкидаємо тільки "мікрокрапочки" менше порогового значення.

const FRAGMENT_MIN_KM2 = 1.5; // крапочки менше 1.5 км² — артефакт, видаляємо

function sanitizePoly(geo, keepLargest = false) {
    if (!geo) return null;
    try {
        const geom = geo.geometry || geo;
        if (geom.type === 'Polygon') return geo; // єдиний полігон — все ОК

        if (geom.type !== 'MultiPolygon') return geo;

        // Розпаковуємо MultiPolygon у окремі Feature<Polygon> + рахуємо площі
        const parts = geom.coordinates
            .map(ring => ({ poly: turf.polygon(ring), area: 0 }))
            .map(item => {
                try { item.area = turf.area(item.poly) / 1e6; } catch(e) {}
                return item;
            })
            .sort((a, b) => b.area - a.area); // найбільші — першими

        if (parts.length === 0) return geo;

        if (keepLargest) {
            // Для blue/red: лише суцільна головна зона, решта — сміття
            return parts[0].poly;
        }

        // Для grey та інших: відкидаємо тільки мікрофрагменти
        const significant = parts.filter(({ area }) => area >= FRAGMENT_MIN_KM2);
        if (significant.length === 0) return parts[0].poly; // фолбек до найбільшого
        if (significant.length === 1) return significant[0].poly;

        // З'єднуємо значущі частини назад в один (можливо MultiPolygon) об'єкт
        return significant.reduce((acc, { poly }) => {
            try { return turf.union(acc, poly) || acc; }
            catch(e) { return acc; }
        }, significant[0].poly);

    } catch(e) {
        console.warn('sanitizePoly error:', e);
        return geo;
    }
}

// Примусово "лікує" всі три полігони в поточному стані гри.
// Можна викликати після завантаження старого збереження або якщо фронт
// накопичив видимі артефакти. Також підвішена на Ctrl+Shift+F в браузері.
function cleanFrontlineGeometry() {
    let changed = false;
    if (activeBluePolyGeoJSON) {
        const clean = sanitizePoly(activeBluePolyGeoJSON, true);
        if (clean) { activeBluePolyGeoJSON = clean; changed = true; }
    }
    if (activeRedPolyGeoJSON) {
        const clean = sanitizePoly(activeRedPolyGeoJSON, true);
        if (clean) { activeRedPolyGeoJSON = clean; changed = true; }
    }
    if (activeGreyPolyGeoJSON) {
        const clean = sanitizePoly(activeGreyPolyGeoJSON, false);
        if (clean) { activeGreyPolyGeoJSON = clean; changed = true; }
    }
    if (changed) { redrawPolygons(); saveGameState(); }
    return changed;
}

// Хоткей Ctrl+Shift+F → ручне лікування фронту
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        const fixed = cleanFrontlineGeometry();
        const log = document.getElementById('combat-log');
        const txt = document.getElementById('combat-text');
        if (log && txt) {
            log.classList.remove('hidden');
            txt.innerHTML = fixed
                ? '<span style="color:#00ff88">🗺️ ЛБЗ відкалібрована — артефакти прибрані.</span>'
                : '<span style="color:#aaa">ЛБЗ вже чиста.</span>';
            setTimeout(() => log.classList.add('hidden'), 3000);
        }
    }
});

// === 9. ЗБЕРЕЖЕННЯ / ЗАВАНТАЖЕННЯ ===
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

    // Прибираємо накопичені артефакти зі збереженого стану
    cleanFrontlineGeometry();
    
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

function advanceFrontline(winnerLat, winnerLng, color, radiusKm = 2.0) {
    if (!activeBluePolyGeoJSON || !activeRedPolyGeoJSON) return;

    // 1. Будуємо зону захоплення
    let captureZone = buildAdvanceWedge(winnerLng, winnerLat, radiusKm, color);
    if (!captureZone) return;

    // 2. "ЗАХИСТ СУСІДНІХ ПОЗИЦІЙ"
    //    Кожен ворожий підрозділ у зоні впливу "закриває" невеликий шматок навколо себе —
    //    тобто прорив не може проковтнути позиції сусідніх оборонців і залишити їх
    //    у синій/червоній зоні. Радіус exclusion масштабується зі складністю прориву.
    const enemyColor = color === 'unit-blue' ? 'unit-red' : 'unit-blue';
    const winnerPt   = turf.point([winnerLng, winnerLat]);
    const influence  = radiusKm * 2.8;  // зона "чутливості" до сусідів

    activeDetachments.forEach(det => {
        const detBrigade = activeBrigades.find(b => b.data.id === det.brigadeId);
        if (!detBrigade || detBrigade.data.color !== enemyColor) return;
        const distKm = turf.distance(winnerPt, turf.point([det.lng, det.lat]), { units: 'kilometers' });
        if (distKm > influence) return;

        // Чим ближчий підрозділ до точки прориву — тим більший "якір" (захищена зона)
        const anchorR = Math.max(0.25, radiusKm * 0.18 + (1 - distKm / influence) * radiusKm * 0.20);
        try {
            const exclusion = turf.buffer(turf.point([det.lng, det.lat]), anchorR, { units: 'kilometers', steps: 8 });
            const clipped   = turf.difference(captureZone, exclusion);
            if (clipped) captureZone = clipped;
        } catch(e) {}
    });

    // 3. Застосовуємо зміну:
    //    captureZone додається до нашого полігону і РІВНО настільки ж вирізається у ворога.
    //    Немає додаткового clearanceRadius — прорив рівно такий, яким є зона захоплення.
    try {
        if (color === 'unit-blue') {
            const nb = turf.union(activeBluePolyGeoJSON, captureZone);
            if (nb) activeBluePolyGeoJSON = sanitizePoly(nb, true);
            const cut = turf.difference(activeRedPolyGeoJSON, captureZone);
            if (cut) activeRedPolyGeoJSON = sanitizePoly(cut, true);
        } else {
            const nr = turf.union(activeRedPolyGeoJSON, captureZone);
            if (nr) activeRedPolyGeoJSON = sanitizePoly(nr, true);
            const cut = turf.difference(activeBluePolyGeoJSON, captureZone);
            if (cut) activeBluePolyGeoJSON = sanitizePoly(cut, true);
        }
    } catch(e) { console.warn('advanceFrontline union/difference failed:', e); return; }

    // 4. Оновлюємо сіру зону (no-man's-land): розширюємо на captureZone,
    //    потім прибираємо все що тепер входить в один з двох полігонів.
    if (activeGreyPolyGeoJSON) {
        try {
            let g = turf.union(activeGreyPolyGeoJSON, captureZone);
            if (g) { const c1 = turf.difference(g, activeBluePolyGeoJSON); if (c1) g = c1; }
            if (g) { const c2 = turf.difference(g, activeRedPolyGeoJSON);  if (c2) g = c2; }
            if (g) activeGreyPolyGeoJSON = sanitizePoly(g, false);
        } catch(e) {}
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
    updateTotalTroopsUI();
    return brigadeObj;
}

function updateBrigadeVisuals(brigadeObj) {
    if (brigadeObj && brigadeObj.marker) {
        brigadeObj.marker.setIcon(makeBrigadeIcon(brigadeObj.data));
    }
    updateTotalTroopsUI();
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
        className: 'leaflet-interactive', // Пустий клас, щоб Leaflet не додавав зміщення
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

// Сума currentMen лише по бригадах, що ЗАРАЗ стоять на мапі (activeBrigades).
// Бригади в резерві (reserveBrigades) свідомо НЕ враховуються — щойно бригаду
// відводять у тил (withdrawToReserve) або ще не виставляють на фронт, вона
// випадає з цього підрахунку.
function getDeployedTroopsTotal(color = 'unit-blue') {
    return activeBrigades
        .filter(b => !color || b.data.color === color)
        .reduce((sum, b) => sum + (b.data.currentMen || 0), 0);
}

function updateTotalTroopsUI() {
    // ВАЖЛИВО: id 'total-troops-val' — підстав сюди реальний id свого елемента
    // з текстом "Загальна кількість військ", якщо в HTML він називається інакше.
    const el = document.getElementById('total-troops-val');
    if (el) el.innerText = getDeployedTroopsTotal('unit-blue').toLocaleString('uk-UA');
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
    if (movingDetachment) {
        const { detObj, brigade } = movingDetachment; movingDetachment = null; map.getContainer().style.cursor = '';
        document.querySelectorAll('.det-marker').forEach(el => el.classList.remove('selected-det'));
        
        const txt = document.getElementById('combat-text');
        txt.innerHTML = `<span style="color:#00ff88">Загін переміщується на нову позицію...</span>`;
        
        if (detObj.fortId) {
            const fort = getFortById(detObj.fortId);
            if (fort) { fort.garrisonIds = (fort.garrisonIds || []).filter(id => id !== detObj.id); updateFortVisuals(fort); }
            detObj.fortId = null;
        }
        animateDetachmentMove(detObj, brigade, e.latlng.lat, e.latlng.lng);
        return;
    }
    if (sendingDetachment) {
        const { brigade, size, role } = sendingDetachment; sendingDetachment = null; map.getContainer().style.cursor = '';
        document.getElementById('send-det-form').style.opacity = '1'; 
        
        // НЕ ХОВАЄМО ЛОГ! Просто оновлюємо текст:
        const txt = document.getElementById('combat-text');
        txt.innerHTML = `<span style="color:#00ff88">Загін висунувся на позицію...</span>`;
        
        createDetachmentMarker(brigade, size, role, e.latlng.lat, e.latlng.lng, undefined, undefined, true);
        updateBrigadePanel(brigade); updateBrigadeVisuals(brigade); saveGameState();
        return;
    }
    if (fortPlacementMode && fortPlacementType) {
        L.DomEvent.stopPropagation(e); createFortMarker(fortPlacementType, e.latlng.lat, e.latlng.lng); saveGameState();
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

// Додано isNew parameter для виклику анімації
// === 1. СТВОРЕННЯ МАРКЕРА (ОНОВЛЕНО) ===
function createDetachmentMarker(brigade, size, role, lat, lng, existingId, fortId, isNew = false) {
    const id = existingId || `d_${_detIdCounter++}`;
    const color = brigade.data.color;
    const cssClass = color === 'unit-blue'
        ? (role === 'defense' ? 'det-blue-def' : 'det-blue-att')
        : (role === 'defense' ? 'det-red-def'  : 'det-red-att');

    const roleIcon = role === 'defense' ? '🛡' : '⚔';
    
    const icon = L.divIcon({
        className: 'leaflet-interactive', 
        html: `<div class="det-marker ${cssClass}" style="width: 40px; height: 40px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; margin: 0; padding: 0; pointer-events: auto;"><span style="font-size:12px; margin-bottom:2px;">${roleIcon}</span><span style="font-size:11px; font-weight:bold;">${size}</span></div>`,
        iconSize: [40, 40], 
        iconAnchor: [20, 20]
    });

    // Жорстко фіксуємо старт: якщо щойно створений - біля бригади. Якщо завантажений - на своєму місці.
    const startLat = isNew ? brigade.lat : lat;
    const startLng = isNew ? brigade.lng : lng;

    const marker = L.marker([startLat, startLng], { icon }).addTo(map);
    marker.dragging.enable();

    const detObj = {
        id, brigadeId: brigade.data.id,
        marker, lat: startLat, lng: startLng, size, role,
        fortId: fortId || null,
        isBusy: false, currentOrg: size
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
            return;
        }

        if (brigade.data.color === 'unit-blue') {
            if (detObj.isBusy) {
                alert('Загін веде бій! Накази ігноруються.');
                return;
            }
            movingDetachment = { detObj, brigade };
            map.getContainer().style.cursor = 'crosshair';
            
            const log = document.getElementById('combat-log');
            const txt = document.getElementById('combat-text');
            log.classList.remove('hidden');
            txt.innerHTML = `<span style="color:#00ff88">Оберіть нову позицію для загону (${detObj.size} ос.).<br>ПКМ — скасувати.</span>`;
            
            document.querySelectorAll('.det-marker').forEach(el => el.classList.remove('selected-det'));
            const iconEl = marker.getElement();
            if (iconEl && iconEl.firstElementChild) iconEl.firstElementChild.classList.add('selected-det');
        }
    });

    activeDetachments.push(detObj);

    // Відправляємо у рух
    if (isNew && (role === 'defense' || role === 'assault')) {
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

function checkDetachmentInFort(detObj){}

function getFortById(id) {
    return activeForts.find(f => f.id === id);
}

function recallDetachment(detId) {
    const det = activeDetachments.find(d => d.id === detId);
    if (!det) return;

    if (det.animTimer) { clearInterval(det.animTimer); det.animTimer = null; }
    removeMoveArrow(det);

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

// === 2a. ТАКТИЧНА СТРІЛКА (держак + вістря, як на оперативних картах) ===
// Будує контур "стрілки-удару": пряму від start до end з трикутною головою на кінці.
// Розміри держака/голови масштабуються від довжини маршруту, тож стрілка виглядає
// пропорційно і на короткому, і на довгому плечі.
function buildArrowOutline(startLat, startLng, endLat, endLng) {
    const start = turf.point([startLng, startLat]);
    const end   = turf.point([endLng, endLat]);
    const distKm = Math.max(turf.distance(start, end, { units: 'kilometers' }), 0.01);
    const bearing = turf.bearing(start, end);

    const shaftHalfWidth = Math.max(0.04, Math.min(distKm * 0.10, 0.40));
    const headLength     = Math.max(0.12, Math.min(distKm * 0.35, 1.10));
    const headHalfWidth  = shaftHalfWidth * 2.3;
    const shaftLenKm     = Math.max(0.001, distKm - headLength);

    const shaftEnd = turf.destination(start, shaftLenKm, bearing, { units: 'kilometers' });
    const off = (pt, dist, angleOffset) =>
        turf.destination(pt, dist, bearing + angleOffset, { units: 'kilometers' }).geometry.coordinates;

    const ring = [
        off(start, shaftHalfWidth, 90),
        off(shaftEnd, shaftHalfWidth, 90),
        off(shaftEnd, headHalfWidth, 90),
        end.geometry.coordinates,
        off(shaftEnd, headHalfWidth, -90),
        off(shaftEnd, shaftHalfWidth, -90),
        off(start, shaftHalfWidth, -90)
    ];

    // GeoJSON віддає [lng,lat] — Leaflet хоче [lat,lng]
    return ring.map(c => [c[1], c[0]]);
}

function createTacticalArrow(startLat, startLng, endLat, endLng, color) {
    try {
        const latlngs = buildArrowOutline(startLat, startLng, endLat, endLng);
        return L.polygon(latlngs, {
            color: '#111', weight: 1.5, opacity: 0.9,
            fillColor: color, fillOpacity: 0.85,
            lineJoin: 'round'
        }).addTo(map);
    } catch (e) {
        // Фолбек на випадок виродженої геометрії (старт=ціль і т.п.)
        return L.polyline([[startLat, startLng], [endLat, endLng]], {
            color, weight: 4, opacity: 0.85
        }).addTo(map);
    }
}

function removeMoveArrow(detObj) {
    if (detObj && detObj.moveLine) {
        map.removeLayer(detObj.moveLine);
        detObj.moveLine = null;
    }
}

// === 2b. БРОНЕБІЙНА ФУНКЦІЯ АНІМАЦІЇ ЧЕРЕЗ SETINTERVAL ===
function animateDetachmentMove(detObj, brigade, targetLat, targetLng) {
    // Очищуємо попередні таймери та стрілки, якщо загін вже рухався
    if (detObj.animTimer) clearInterval(detObj.animTimer);
    removeMoveArrow(detObj);

    const startPos = detObj.marker.getLatLng();
    detObj.lat = startPos.lat;
    detObj.lng = startPos.lng;

    // Малюємо тактичну стрілку маршруту/удару. Вона статична і лишається на мапі,
    // поки не завершиться сам бій або зачистка (прибирається з runCombat/startZoneClearing/арешту маршу).
    const arrowColor = brigade.data.color === 'unit-blue' ? '#00ff88' : '#ff6644';
    detObj.moveLine = createTacticalArrow(startPos.lat, startPos.lng, targetLat, targetLng, arrowColor);

    const speed = 0.005; // Фіксована швидкість (близько 500м за крок)
    
    // Запускаємо чіткий інтервал оновлення позиції (кожні 30 мілісекунд)
    detObj.animTimer = setInterval(() => {
        const cur = detObj.marker.getLatLng();
        const dLat = targetLat - cur.lat;
        const dLng = targetLng - cur.lng;
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);

        // 1. ПЕРЕВІРКА ПЕРЕХОПЛЕННЯ ВОРОГОМ
        let interceptedBy = null;
        for (let enemy of activeDetachments) {
            if (enemy.isBusy || enemy.role !== 'defense') continue; // Ворог має бути вільний і на обороні
            
            const b = activeBrigades.find(br => br.data.id === enemy.brigadeId);
            if (!b || b.data.color === brigade.data.color) continue; // Ігноруємо своїх
            
            const ePos = enemy.marker.getLatLng();
            // Якщо ворог знаходиться ближче ніж 1.5 км
            if (map.distance(cur, ePos) < 1500) {
                interceptedBy = enemy; 
                break;
            }
        }

        if (interceptedBy) {
            clearInterval(detObj.animTimer);
            detObj.animTimer = null;
            // Стрілку НЕ прибираємо — вона лишається на мапі на час бою (приберe runCombat)
            
            detObj.lat = cur.lat; 
            detObj.lng = cur.lng;
            detObj.isBusy = true; 
            interceptedBy.isBusy = true;
            
            runCombat(detObj, interceptedBy); // ЗАПУСК БОЮ ЗІ ЗВЕДЕННЯМ
            return;
        }

        // 2. ПРИБУТТЯ НА ЦІЛЬОВУ ТОЧКУ
        if (dist <= speed) {
            clearInterval(detObj.animTimer);
            detObj.animTimer = null;
            
            detObj.marker.setLatLng([targetLat, targetLng]);
            detObj.lat = targetLat; 
            detObj.lng = targetLng;
            
            checkDetachmentInFort(detObj);
            
            // Запускаємо зачистку/штурм
            if (detObj.role === 'assault') {
                // Стрілка лишається — її приберуть runCombat() або startZoneClearing() по завершенню
                startDetachmentAssault(detObj, brigade);
            } else {
                // Оборонний загін прибув на позицію без бою — бою не буде, стрілка більше не потрібна
                removeMoveArrow(detObj);
                setTimeout(() => {
                    if (!activeDetachments.some(d => d.isBusy)) {
                        document.getElementById('combat-log').classList.add('hidden');
                    }
                }, 2000);
            }
            saveGameState();
            return;
        }

        // 3. РУХ (рухається лише маркер; стрілка лишається незмінною до кінця бою)
        const ratio = speed / dist;
        const newLat = cur.lat + dLat * ratio;
        const newLng = cur.lng + dLng * ratio;
        
        detObj.marker.setLatLng([newLat, newLng]);
        
    }, 30);
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
    // Шукаємо ворога поруч (радіус 2 км)
    const enemy = activeDetachments.find(d => {
        const b = activeBrigades.find(br => br.data.id === d.brigadeId);
        if (!b) return false;
        if (b.data.color === brigade.data.color) return false;
        if (d.isBusy) return false;
        const dist = map.distance([detObj.lat, detObj.lng], [d.lat, d.lng]);
        return dist < 2000;
    });

    if (enemy) {
        // Якщо знайшли ворога — ініціюємо бій
        detObj.isBusy = true;
        enemy.isBusy = true;
        runCombat(detObj, enemy);
    } else {
        // Якщо ворога немає — починаємо захоплення території
        detObj.isBusy = true; // Блокуємо, щоб гравець не переривав процес
        startZoneClearing(detObj, brigade);
    }
}

function runCombat(attackerDet, defenderDet) {
    const attBrigade = activeBrigades.find(b => b.data.id === attackerDet.brigadeId);
    const defBrigade = activeBrigades.find(b => b.data.id === defenderDet.brigadeId);
    if (!attBrigade || !defBrigade) return;

    let attOrg = attackerDet.size; let defOrg = defenderDet.size;
    let fortBonus = 1.0;
    if (defenderDet.fortId) { const fort = getFortById(defenderDet.fortId); if (fort) fortBonus = fortifications[fort.type]?.defBonus || 1.0; }

    const attData = attBrigade.data; const defData = defBrigade.data;
    const log = document.getElementById('combat-log'); const txt = document.getElementById('combat-text');
    log.classList.remove('hidden');
    let hoursElapsed = 0;

    const interval = setInterval(() => {
        const attStillExists = activeDetachments.some(d => d.id === attackerDet.id);
        const defStillExists = activeDetachments.some(d => d.id === defenderDet.id);

        if (!attStillExists || !defStillExists) {
            clearInterval(interval);
            if (attStillExists) { attackerDet.isBusy = false; removeMoveArrow(attackerDet); }
            if (defStillExists) { defenderDet.isBusy = false; removeMoveArrow(defenderDet); }
            if (!activeDetachments.some(d => d.isBusy)) log.classList.add('hidden');
            return;
        }

        hoursElapsed++; log.classList.remove('hidden');

        let attPow = attData.attack; let defPow = defData.defense * fortBonus; 
        if (attData.daysOnFront > 60) attPow *= 0.6; if (defData.daysOnFront > 60) defPow *= 0.6;
        
        let sizeRatio = attackerDet.size / Math.max(1, defenderDet.size);
        let attAdvantage = Math.min(2.0, Math.max(0.5, sizeRatio)); 

        const rngAtt = 0.8 + Math.random() * 0.4; const rngDef = 0.8 + Math.random() * 0.4;
        const attackerCasualties = (defPow * rngDef * fortBonus) / (12 * attAdvantage);
        const defenderCasualties = (attPow * rngAtt * attAdvantage) / (12 * fortBonus);

        const attLoss = Math.round(attackerCasualties); const defLoss = Math.round(defenderCasualties);
        defOrg -= defLoss; attOrg -= attLoss;
        
        attBrigade.data.currentMen = Math.max(0, attBrigade.data.currentMen - attLoss);
        defBrigade.data.currentMen = Math.max(0, defBrigade.data.currentMen - defLoss);
        
        attackerDet.size = Math.max(0, Math.floor(attOrg)); defenderDet.size = Math.max(0, Math.floor(defOrg));

        updateBrigadeVisuals(attBrigade); updateBrigadeVisuals(defBrigade);
        updateDetachmentVisuals(attackerDet, attBrigade); updateDetachmentVisuals(defenderDet, defBrigade);
        if (selectedBrigade) updateBrigadePanel(selectedBrigade); if (selectedFort) openFortInfoPanel(selectedFort);

        const attPct = Math.max(0, attOrg / attackerDet.currentOrg * 100).toFixed(0);
        const defPct = Math.max(0, defOrg / defenderDet.currentOrg * 100).toFixed(0);

        txt.innerHTML = `<b>БІЙ | </b>${Math.floor(hoursElapsed/24)} дн. ${hoursElapsed%24} год.<br>
        ⚔ ${attBrigade.data.name} — ${attackerDet.size} ос. [${attPct}%]<br>
        🛡 ${defBrigade.data.name} — ${defenderDet.size} ос. [${defPct}%]<br>
        ${defenderDet.fortId ? `Укриття: ${fortifications[getFortById(defenderDet.fortId).type].name} ×${fortBonus}` : 'Бій у полі'}`;

        let attRetreatThreshold = 0.60; let defRetreatThreshold = 0.25; 
        if (defenderDet.fortId) defRetreatThreshold = 0.15; 
        if (attData.type === 'SSO' || attData.type === 'НГУ') attRetreatThreshold = 0.40; 

        let attPctVal = attOrg / attackerDet.currentOrg; let defPctVal = defOrg / defenderDet.currentOrg;
        let attDefeated = attPctVal <= attRetreatThreshold || attOrg <= 0;
        let defDefeated = defPctVal <= defRetreatThreshold || defOrg <= 0;

        if (attDefeated || defDefeated) {
            clearInterval(interval);
            let attackerWon = !attDefeated;
            const winner = attackerWon ? attBrigade : defBrigade;
            const loser = attackerWon ? defBrigade : attBrigade;
            const loserDet = attackerWon ? defenderDet : attackerDet;
            const winnerDet = attackerWon ? attackerDet : defenderDet;

            let resolutionText = "";
            if (attDefeated && !defDefeated) { resolutionText = "наступ захлинувся, загін відступив 🏃"; } 
            else if (defDefeated && !attDefeated) {
                if (loserDet.size > 0 && Math.random() > 0.6) { resolutionText = "було розбито або здалося в полон 🏳️"; loser.data.currentMen = Math.max(0, loser.data.currentMen - loserDet.size); loserDet.size = 0; updateBrigadeVisuals(loser); } 
                else { resolutionText = "не витримав натиску і відступив із позицій 🏃"; }
            } else { resolutionText = "обидві сторони понесли величезні втрати і відступили 🚑"; attackerWon = false; }

            txt.innerHTML += `<br><br><span style="color:yellow">🏆 ${winner.data.name} втримала позиції/перемогла!</span><br><span style="color:#ff8888">Загін противника: ${resolutionText}.</span>`;

            loserDet.isBusy = false; recallDetachment(loserDet.id);
            winnerDet.isBusy = false; 
            removeMoveArrow(winnerDet); // Бій завершено — стрілка більше не потрібна
            
            if (attackerWon && winnerDet.role === 'assault') {
                // Радіус прориву: √(людей/200)×2 км, макс 5 км.
                // 200 ос → 2.0 км | 400 ос → 2.8 км | 800 ос → 4.0 км | 1200 ос → 4.9 км
                let captureRadius = Math.sqrt(winnerDet.size / 200) * 2.0;
                captureRadius = Math.max(0.4, Math.min(captureRadius, 5.0));
                advanceFrontline(winnerDet.lat, winnerDet.lng, winner.data.color, captureRadius);
            }

            setTimeout(() => { if (!activeDetachments.some(d => d.isBusy)) log.classList.add('hidden'); saveGameState(); }, 6000);
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
        // === ВИПРАВЛЕННЯ БАГУ: Перевірка на відкликання ===
        const detStillExists = activeDetachments.some(d => d.id === detObj.id);
        if (!detStillExists) {
            clearInterval(interval);
            log.classList.add('hidden');
            return;
        }

        hours++;
        txt.innerHTML = `<b>Зачистка</b> | ${hours}/${timeRequired} год.<br>${brigade.data.name} — ${detObj.size} ос.`;

        if (hours >= timeRequired) {
            clearInterval(interval);
            
            // === ВИПРАВЛЕННЯ БАГУ: Знімаємо блокування команд ===
            detObj.isBusy = false; 
            removeMoveArrow(detObj); // Зачистку завершено — стрілка більше не потрібна

            txt.innerHTML += `<br><span style="color:yellow">✅ Захоплено!</span>`;
            
            let captureRadius = Math.sqrt(detObj.size) / 28;
            captureRadius = Math.max(0.08, Math.min(captureRadius, 2.5));
            
            advanceFrontline(detObj.lat, detObj.lng, brigade.data.color, captureRadius);
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
    updateTotalTroopsUI();

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
                    createDetachmentMarker(brigade, size, 'assault', tLat, tLng, undefined, undefined, true);
                }
            } else {
                // ОБОРОНА: Розставляємо захисні загони навколо своєї бригади
                const dLat = brigade.lat + (Math.random() - 0.5) * 0.1;
                const dLng = brigade.lng + (Math.random() - 0.5) * 0.1;
                createDetachmentMarker(brigade, size, 'defense', dLat, dLng, undefined, undefined, true);
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
