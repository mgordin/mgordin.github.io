//  ---------------- Function definitions ------------------

function saveData(name, data) {
    localStorage.setItem(name, JSON.stringify(data));
}

function checkStoredData(loadedData, defaultData) {
    var keysLoaded = Object.keys(loadedData),
        keysDefault = Object.keys(defaultData);
    return keysLoaded.length === keysDefault.length &&
        keysLoaded.every(k => defaultData.hasOwnProperty(k) && (
            loadedData[k] && loadedData[k].constructor == Object ||
                defaultData[k] && defaultData[k].constructor == Object
                ? checkStoredData(loadedData[k], defaultData[k])
                : true));
}

function loadData(name) {
    var loaded = JSON.parse(localStorage.getItem(name));
    return loaded
}

// Bag is a list of lists, each interior list is one token as 
// [value as number, redraw as boolean, name as string, autofail after as string]
function makeBag(tokens) {
    var bag = []
    for (const [token_name, token] of Object.entries(tokens)) {
        for (let i = 1; i <= token[0]; i++) {
            bag.push([token[1], token[2], token_name, token[3], token[4]])
        }
    };
    return bag
}

function prepareModifiers(abilitiesActive, abilityEffects, modifiers) {
    for (const [k, v] of Object.entries(modifiers)) {
        modifiers[k] = [];
    };
    if (abilitiesActive.length != 0) {
        abilitiesActive.forEach(function (ability, i) {
            var abilityEffect = abilityEffects[ability];
            for (const [k, v] of Object.entries(abilityEffect)) {
                if (modifiers[k].length == 0 || abilityEffect[k][0] == 's') {
                    modifiers[k] = v
                } else if (modifiers[k][0] == 'a') {
                    modifiers[k][1] += abilityEffect[k][1]
                }
            };
        })
    }
}

// Functions
function range(start, end) {
    if (start === end) return [start];
    return [start, ...range(start + 1, end)];
}

function calculateTotal(previousTotal, token, modifiers) {
    var total = previousTotal + token[0];
    if (modifiers[token[2]].length != 0) {
        if (modifiers[token[2]][0] == 'a') {
            total += modifiers[token[2]][1]
        } else {
            total = modifiers[token[2]][1]
        }
    }
    return total
}

function getTokenRange(tokens) {
    var max = 0;
    var maxSingle = -999;
    var min = 0;
    var minSingle = 999;
    tokens.forEach(function (v, i) {
        if (v[0] > 0 && v[1]) {
            max += v[0]
        } else if (v[0] < 0 && v[1]) {
            min += v[0]
        }
        if (v[0] > maxSingle && !(v[1])) {
            maxSingle = v[0]
        } else if (v[0] < minSingle && !(v[1]) && !(v[4])) {
            minSingle = v[0]
        }
    })

    return [min + minSingle, max + maxSingle];
}

function handleTooManyRedraws(total, tokens, handling, autofail_value) {
    var tokenRegex = /t(\+|-)\d/;
    if (handling == "autofail") {
        console.log("autofail", autofail_value)
        return autofail_value;
    } else if (handling == "median") {
        console.log("tokens", tokens)
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token[1])) {
                tokenValues.push(token[0])
            }
        });
        console.log("remaining values", tokenValues)
        var tokenMedian = math.median(tokenValues)
        console.log("median", tokenMedian)
        return total + tokenMedian;
    } else if (handling == "average") {
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token[1]) && token[0] != autofail_value && token) {
                tokenValues.push(token[0])
            }
        });
        var tokenAverage = math.mean(tokenValues)
        console.log("average", tokenAverage)
        return total + tokenAverage;
    } else if (tokenRegex.test(handling)) {
        var tokenValue = parseInt(handling.substring(1))
        console.log("token", tokenValue)
        return total + tokenValue;
    } else {
        console.log("Handling for too many redraws hit an unrecognized 'handling' parameter")
    }
}

function calculationStep(remainingOptions, previousTotal, probMod, lastDraw, drawCount, autofail_value, redrawMax, allResults, modifiers, redrawHandling) {
    console.log("handling: ", redrawHandling)
    remainingOptions.forEach(function (token, i) {
        // Calculate result, assuming now additional stuff happening
        if (token[0] == autofail_value || token[4]) { // Special case so autofail always has same value / to recognize autofail checkbox
            allResults.push([autofail_value, probMod]);
        } else if (lastDraw && lastDraw == token[3]) { // If the previous draw would make this an autofail, do that
            allResults.push([autofail_value, probMod]);
        } else if (token[1] && modifiers[token[2]][2] != 'noRedraw') { // If this is a token that prompts a redraw, do that
            console.log("Redraw", "Next draw is ", drawCount + 1, "Max: ", redrawMax)
            var total = calculateTotal(previousTotal, token, modifiers)
            if (drawCount + 1 > redrawMax) { // If this draw is too many redraws - treat as an autofail to speed up calculation
                console.log("Resolve!")
                allResults.push([handleTooManyRedraws(total, remainingOptions, redrawHandling, autofail_value), probMod]);
            } else {
                console.log("Draw!")
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token[2], drawCount + 1, autofail_value, redrawMax, allResults, modifiers, redrawHandling)
            }
        } else { // No redraw - just spit out the current total and probability
            var total = calculateTotal(previousTotal, token, modifiers)
            allResults.push([total, probMod]);
        }
    });
}

function aggregate(results, bag) {
    var prob = new Object();
    var tokenRange = getTokenRange(bag)
    r = range(tokenRange[0], tokenRange[1]).concat([-999])
    r.forEach(function (value, i) {
        const filteredResults = results.filter(function (array) {
            return array.includes(value)
        })
        if (filteredResults.length != 0) {
            const probSumFunction = (sum, curr) => sum + curr[1];
            prob[value] = filteredResults.reduce(probSumFunction, 0) * 100;
        }
    })

    var probCumul = new Object();
    probCumul[-2] = sumStuffUp(prob, 1);
    probCumul[-1] = sumStuffUp(prob, 0);
    probCumul[0] = sumStuffUp(prob, -1);
    probCumul[1] = sumStuffUp(prob, -2);
    probCumul[2] = sumStuffUp(prob, -3);
    probCumul[3] = sumStuffUp(prob, -4);
    probCumul[4] = sumStuffUp(prob, -5);
    probCumul[5] = sumStuffUp(prob, -6);
    probCumul[6] = sumStuffDown(prob, -6);

    return probCumul
}

function sumStuffUp(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k > target) {
            temp += v;
        }
    }
    return temp;
}

function sumStuffDown(prob, target) {
    var temp = 0;
    for (const [k, v] of Object.entries(prob)) {
        if (k <= target) {
            temp += v;
        }
    }
    return temp;
}

// Test it out

function run(tokens, abilitiesActive, abilityEffects, modifiers, redrawMax, redrawHandling) {
    var allResults = [];
    var bag = makeBag(tokens);
    prepareModifiers(abilitiesActive, abilityEffects, modifiers);
    calculationStep(bag, 0, 1 / bag.length, null, 1, tokens['autofail'][1], redrawMax, allResults, modifiers, redrawHandling);
    var cumulative = aggregate(allResults, bag);
    saveData(saveName, data);

    return cumulative
}

async function probabilityPlot(p) {
    var xValue = range(-2, 5);
    var yValue = [
        Math.round(p[-2]),
        Math.round(p[-1]),
        Math.round(p[0]),
        Math.round(p[1]),
        Math.round(p[2]),
        Math.round(p[3]),
        Math.round(p[4]),
        Math.round(p[5])
    ];
    var textValueRaw = yValue.map(String)
    var textValue = []
    textValueRaw.forEach(function (val, i) {
        textValue.push(val + "%")
    })
    var data = [{
        x: xValue,
        y: yValue,
        type: 'bar',
        text: textValue,
        textposition: 'auto',
        textfont: {
            size: 18
        }
    }];
    var layout = {
        xaxis: {
            title: {
                text: 'Skill value minus test difficulty',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            }
        },
        yaxis: {
            title: {
                text: 'Probability of success (%)',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            range: [0, 101]
        }
    }

    return Plotly.newPlot('probPlot', data, layout);
}


//  ---------------- Set up the page and params ------------------

// Params
var saveName = "mgArkhamChaosBagData"
var data = {
    tokens: { // [count, value, redraw, autofail-if-after, is-autofail]
        '+1': [1, 1, false, null, false],
        '0': [2, 0, false, null, false],
        '-1': [3, -1, false, null, false],
        '-2': [2, -2, false, null, false],
        '-3': [1, -3, false, null, false],
        '-4': [1, -4, false, null, false],
        '-5': [0, -5, false, null, false],
        '-6': [0, -6, false, null, false],
        '-7': [0, -7, false, null, false],
        '-8': [0, -8, false, null, false],
        'skull': [2, -2, false, null, false],
        'cultist': [2, -2, false, null, false],
        'tablet': [1, -3, false, null, false],
        'elderThing': [2, -4, false, null, false],
        'star': [1, 1, false, null, false],
        'autofail': [1, -999, false, null, true],
        'bless': [0, 2, true, null, false],
        'curse': [0, -2, true, null, false],
        'frost': [4, -1, true, 'frost', false]
    },
    modifiers: {
        '+1': [],
        '0': [],
        '-1': [],
        '-2': [],
        '-3': [],
        '-4': [],
        '-5': [],
        '-6': [],
        '-7': [],
        '-8': [],
        'skull': [],
        'cultist': [],
        'tablet': [],
        'elderThing': [],
        'star': [],
        'autofail': [],
        'bless': [],
        'curse': [],
        'frost': []
    },
    redrawMax: 4,
    redrawHandling: "autofail",
    redrawOptions: [
        { text: "Treat as autofail", value: "autofail", param: -999 },
        { text: "Apply median value of (remaining, non-redraw, non-autofail) tokens, rounded down", value: "median" },
        { text: "Apply average value of (remaining, non-redraw, non-autofail) tokens, rounded down", value: "average" },
        { text: "Apply token value: +1", value: "t1" },
        { text: "Apply token value: 0", value: "t0" },
        { text: "Apply token value: -1", value: "t-1" },
        { text: "Apply token value: -2", value: "t-2" },
        { text: "Apply token value: -3", value: "t-3" },
        { text: "Apply token value: -4", value: "t-4" },
        { text: "Apply token value: -5", value: "t-5" },
        { text: "Apply token value: -6", value: "t-6" },
        { text: "Apply token value: +7", value: "t-7" },
        { text: "Apply token value: +8", value: "t-8" },
    ],
    whichBlock: "tokens", // "tokens", "settings", or "abilities"
    tokenOptions: [
        { text: "", value: null },
        { text: "Bless", value: "bless" },
        { text: "Curse", value: "curse" },
        { text: "Cultist", value: "cultist" },
        { text: "Elder Thing", value: "elderThing" },
        { text: "Frost", value: "frost" },
        { text: "Tablet", value: "tablet" },
        { text: "Skull", value: "skull" }

    ],
    abilitiesActive: [],
    abilityOptions: [
        { text: 'Defiance (2)', value: 'Defiance2XP' },
        { text: 'Jim Culver', value: 'JimCulver' },
        { text: 'Ritual Candles', value: 'RitualCandles1' },
        { text: 'Ritual Candles', value: 'RitualCandles2' }
    ],
    abilityEffects: {
        'Defiance2XP': {
            'skull': ['s', 0, 'noRedraw'],
            'cultist': ['s', 0, 'noRedraw'],
            'tablet': ['s', 0, 'noRedraw'],
            'elderThing': ['s', 0, 'noRedraw']
        },
        'JimCulver': {
            'skull': ['s', 0]
        },
        'RitualCandles1': {
            'skull': ['a', 1],
            'cultist': ['a', 1],
            'tablet': ['a', 1],
            'elderThing': ['a', 1]
        },
        'RitualCandles2': {
            'skull': ['a', 2],
            'cultist': ['a', 2],
            'tablet': ['a', 2],
            'elderThing': ['a', 2]
        }
    },
    campaignOptions: [
        { text: "Custom", value: "custom" },
        { text: "Night of the Zealot (Easy)", value: "notz_e" },
        { text: "Night of the Zealot (Standard)", value: "notz_s" },
        { text: "Night of the Zealot (Hard)", value: "notz_h" },
        { text: "Night of the Zealot (Expert)", value: "notz_x" },
        { text: "The Dunwich Legacy (Easy)", value: "dl_e" },
        { text: "The Dunwich Legacy (Standard)", value: "dl_s" },
        { text: "The Dunwich Legacy (Hard)", value: "dl_h" },
        { text: "The Dunwich Legacy (Expert)", value: "dl_x" },
        { text: "The Path to Carcosa (Easy)", value: "ptc_e" },
        { text: "The Path to Carcosa (Standard)", value: "ptc_s" },
        { text: "The Path to Carcosa (Hard)", value: "ptc_h" },
        { text: "The Path to Carcosa (Expert)", value: "ptc_x" },
        { text: "The Forgotten Age (Easy)", value: "fa_e" },
        { text: "The Forgotten Age (Standard)", value: "fa_s" },
        { text: "The Forgotten Age (Hard)", value: "fa_h" },
        { text: "The Forgotten Age (Expert)", value: "fa_x" },
        { text: "The Circle Undone (Easy)", value: "cu_e" },
        { text: "The Circle Undone (Standard)", value: "cu_s" },
        { text: "The Circle Undone (Hard)", value: "cu_h" },
        { text: "The Circle Undone (Expert)", value: "cu_x" },
        { text: "The Dream-Eaters (A) (Easy)", value: "dea_e" },
        { text: "The Dream-Eaters (A) (Standard)", value: "dea_s" },
        { text: "The Dream-Eaters (A) (Hard)", value: "dea_h" },
        { text: "The Dream-Eaters (A) (Expert)", value: "dea_x" },
        { text: "The Dream-Eaters (B) (Easy)", value: "deb_e" },
        { text: "The Dream-Eaters (B) (Standard)", value: "deb_s" },
        { text: "The Dream-Eaters (B) (Hard)", value: "deb_h" },
        { text: "The Dream-Eaters (B) (Expert)", value: "deb_x" },
        { text: "The Innsmouth Conspiracy (Easy)", value: "ic_e" },
        { text: "The Innsmouth Conspiracy (Standard)", value: "ic_s" },
        { text: "The Innsmouth Conspiracy (Hard)", value: "ic_h" },
        { text: "The Innsmouth Conspiracy (Expert)", value: "ic_x" },
        { text: "Edge of the Earth (Easy)", value: "eote_e" },
        { text: "Edge of the Earth (Standard)", value: "eote_s" },
        { text: "Edge of the Earth (Hard)", value: "eote_h" },
        { text: "Edge of the Earth (Expert)", value: "eote_x" }
    ],
    campaignTokenSets: {
        "notz_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "notz_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "notz_h": {
            '+1': [0, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "notz_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dl_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dl_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dl_h": {
            '+1': [0, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dl_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ptc_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [3, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ptc_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [3, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ptc_h": {
            '+1': [0, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [3, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ptc_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [1, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [3, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "fa_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [1, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [1, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "fa_s": {
            '+1': [1, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [1, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [1, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "fa_h": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [1, -1, false, null, false],
            '-2': [1, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [1, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "fa_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [1, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [1, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "cu_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [1, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "cu_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "cu_h": {
            '+1': [0, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "cu_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [0, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dea_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [0, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dea_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [0, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dea_h": {
            '+1': [0, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [0, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "dea_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [0, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "deb_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "deb_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "deb_h": {
            '+1': [0, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "deb_x": {
            '+1': [0, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [0, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ic_e": {
            '+1': [2, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [2, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ic_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [2, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ic_h": {
            '+1': [0, 1, false, null, false],
            '0': [3, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [2, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "ic_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [2, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [1, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [1, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [2, -2, false, null, false],
            'tablet': [2, -3, false, null, false],
            'elderThing': [2, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "eote_e": {
            '+1': [3, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [0, -3, false, null, false],
            '-4': [0, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [0, -1, true, 'frost', false]
        },
        "eote_s": {
            '+1': [1, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [3, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [1, -4, false, null, false],
            '-5': [0, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [1, -1, true, 'frost', false]
        },
        "eote_h": {
            '+1': [0, 1, false, null, false],
            '0': [2, 0, false, null, false],
            '-1': [2, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [0, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [2, -1, true, 'frost', false]
        },
        "eote_x": {
            '+1': [0, 1, false, null, false],
            '0': [1, 0, false, null, false],
            '-1': [1, -1, false, null, false],
            '-2': [2, -2, false, null, false],
            '-3': [1, -3, false, null, false],
            '-4': [2, -4, false, null, false],
            '-5': [1, -5, false, null, false],
            '-6': [0, -6, false, null, false],
            '-7': [1, -7, false, null, false],
            '-8': [0, -8, false, null, false],
            'skull': [2, -2, false, null, false],
            'cultist': [1, -2, false, null, false],
            'tablet': [1, -3, false, null, false],
            'elderThing': [0, -4, false, null, false],
            'star': [1, 1, false, null, false],
            'autofail': [1, -999, false, null, true],
            'bless': [0, 2, true, null, false],
            'curse': [0, -2, true, null, false],
            'frost': [3, -1, true, 'frost', false]
        }
    }
}

let tryData = loadData(saveName)
if (tryData != null && checkStoredData(tryData, data)) {
    data = tryData
}
probabilityPlot(run(data.tokens, data.abilitiesActive, data.abilityEffects, data.modifiers, data.redrawMax, data.redrawHandling))

var app10 = new Vue({
    el: '#app-10',
    data: data,
    methods: {
        getProbabilitiesMessage: function () {
            probabilityPlot(run(this.tokens, this.abilitiesActive, this.abilityEffects, this.modifiers, this.redrawMax, this.redrawHandling));
        },
        setCampaignTokens: function (event) {
            if (event.target.value != "custom") {
                this.tokens = data.campaignTokenSets[event.target.value]
            }
        },
        changeTabs: function (tab) {
            this.whichBlock = tab;
        }
    }
})