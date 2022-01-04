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
        for (let i = 1; i <= token["count"]; i++) {
            bag.push({
                "value": token["value"],
                "redraw": token["redraw"],
                "name": token_name,
                "autofailAfter": token["autofailAfter"],
                "autofail": token["autofail"]
            })
        }
    };
    return bag
}

function prepareModifiers(abilitiesActive, abilityEffects, modifiers) {
    for (const [k, v] of Object.entries(modifiers)) {
        modifiers[k] = {};
    };
    if (abilitiesActive.length != 0) {
        abilitiesActive.forEach(function (ability, i) {
            var abilityEffect = abilityEffects[ability];
            for (const [k, v] of Object.entries(abilityEffect)) {
                if (Object.keys(modifiers[k]).length == 0 || abilityEffect[k]["type"] == 's') {
                    modifiers[k] = v
                } else if (modifiers[k]["type"] == 'a') {
                    modifiers[k]["value"] += abilityEffect[k]["value"]
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
    var total = previousTotal + token["value"];
    if (Object.keys(modifiers[token["name"]]).length != 0) {
        if (modifiers[token["name"]]["type"] == 'a') {
            total += modifiers[token["name"]]["value"]
        } else {
            total = modifiers[token["name"]]["value"]
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
        if (v["value"] > 0 && v["redraw"]) {
            max += v["value"]
        } else if (v["value"] < 0 && v["redraw"]) {
            min += v["value"]
        }
        if (v["value"] > maxSingle && !(v["redraw"])) {
            maxSingle = v["value"]
        } else if (v["value"] < minSingle && !(v["redraw"]) && !(v["autofail"])) {
            minSingle = v["value"]
        }
    })

    return [min + minSingle, max + maxSingle];
}

function handleTooManyRedraws(total, tokens, handling, autofail_value) {
    var tokenRegex = /t(\+|-)\d/;
    if (handling == "autofail") {
        return autofail_value;
    } else if (handling == "median") {
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token["redraw"]) && token["value"] != autofail_value && !(token["autofail"])) {
                tokenValues.push(token["value"])
            }
        });
        var tokenMedian = Math.floor(math.median(tokenValues));
        return total + tokenMedian;
    } else if (handling == "average") {
        var tokenValues = []
        tokens.forEach(function (token, i) {
            if (!(token["redraw"]) && token["value"] != autofail_value && !(token["autofail"])) {
                tokenValues.push(token["value"])
            }
        });
        var tokenAverage = Math.floor(math.mean(tokenValues));
        return total + tokenAverage;
    } else if (tokenRegex.test(handling)) {
        var tokenValue = parseInt(handling.substring(1))
        return total + tokenValue;
    } else {
        console.log("Handling for too many redraws hit an unrecognized 'handling' parameter")
    }
}

function calculationStep(remainingOptions, previousTotal, probMod, lastDraw, drawCount, autofail_value, redrawMax, allResults, modifiers, redrawHandling) {
    remainingOptions.forEach(function (token, i) {
        // Calculate result, assuming now additional stuff happening
        if (token["value"] == autofail_value || token["autofail"]) { // Special case so autofail always has same value / to recognize autofail checkbox
            allResults.push([autofail_value, probMod]);
        } else if (lastDraw && lastDraw == token["autofailAfter"]) { // If the previous draw would make this an autofail, do that
            allResults.push([autofail_value, probMod]);
        } else if (token["redraw"] && modifiers[token["name"]]["param"] != 'noRedraw') { // If this is a token that prompts a redraw, do that
            var total = calculateTotal(previousTotal, token, modifiers)
            if (drawCount + 1 > redrawMax) { // If this draw is too many redraws - treat as an autofail to speed up calculation
                allResults.push([handleTooManyRedraws(total, remainingOptions, redrawHandling, autofail_value), probMod]);
            } else {
                calculationStep(
                    remainingOptions.slice(0, i).concat(remainingOptions.slice(i + 1)), total, probMod / (remainingOptions.length - 1), token["name"], drawCount + 1, autofail_value, redrawMax, allResults, modifiers, redrawHandling)
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

function redrawProb(allProbs, prob, allCount, redrawCount, currentN, maxN) {
    var newProb = prob * redrawCount / allCount
    allProbs.push(Math.round(newProb * 100))
    if ((currentN + 1) <= maxN) {
        redrawProb(allProbs, newProb, allCount - 1, redrawCount - 1, currentN + 1, maxN)
    }
}

function chanceOfNRedraws(tokens, maxN) {
    var redrawTokensCount = 0;
    var allTokensCount = 0;
    for (const [k, v] of Object.entries(tokens)) {
        allTokensCount += v["count"];
        if (v["redraw"]) {
            redrawTokensCount += v["count"];
        }
    }
    var redrawProbs = [];
    redrawProb(redrawProbs, 1, allTokensCount, redrawTokensCount, 1, maxN);

    return redrawProbs
}

function redrawsPlot(tokens, maxN) {
    xValue = range(1, maxN);
    yValue = chanceOfNRedraws(tokens, maxN);

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
                text: 'Nth redraw',
                font: {
                    size: 18
                }
            },
            tickfont: {
                size: 16
            },
            tickmode: "linear",
            tick0: 1,
            dtick: 1
        },
        yaxis: {
            title: {
                text: 'Probability of having<br>that many redraws (%)',
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

    return Plotly.newPlot('redrawsPlot', data, layout);

}

function run(tokens, abilitiesActive, abilityEffects, modifiers, redrawMax, redrawHandling) {
    var allResults = [];
    var bag = makeBag(tokens);
    prepareModifiers(abilitiesActive, abilityEffects, modifiers);
    calculationStep(bag, 0, 1 / bag.length, null, 1, tokens['autofail']["value"], redrawMax, allResults, modifiers, redrawHandling);
    var cumulative = aggregate(allResults, bag);
    saveData(saveName, data);

    return cumulative
}

function probabilityPlot(p) {
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
    // [count, value, redraw, autofail-if-after, is-autofail]
    tokens: {
        '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'cultist': { 'count': 2, 'value': -2, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofailAfter': null, 'autofail': false },
        'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofailAfter': null, 'autofail': true },
        'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofailAfter': null, 'autofail': false },
        'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofailAfter': null, 'autofail': false },
        'frost': { 'count': 4, 'value': -1, 'redraw': true, 'autofailAfter': 'frost', 'autofail': false }
    },
    modifiers: {
        '+1': {},
        '0': {},
        '-1': {},
        '-2': {},
        '-3': {},
        '-4': {},
        '-5': {},
        '-6': {},
        '-7': {},
        '-8': {},
        'skull': {},
        'cultist': {},
        'tablet': {},
        'elderThing': {},
        'star': {},
        'autofail': {},
        'bless': {},
        'curse': {},
        'frost': {}
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
        { text: "Apply token value: -7", value: "t-7" },
        { text: "Apply token value: -8", value: "t-8" },
    ],
    redrawRange: [],
    redrawProbs: [],
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
        { text: 'Defiance (Skull)', value: 'DefianceSkull' },
        { text: 'Defiance (Cultist)', value: 'DefianceCultist' },
        { text: 'Defiance (Tablet)', value: 'DefianceTablet' },
        { text: 'Defiance (Elder Thing)', value: 'DefianceElderThing' },
        { text: 'Defiance (2)', value: 'Defiance2XP' },
        { text: 'Jim Culver', value: 'JimCulver' },
        { text: 'Ritual Candles', value: 'RitualCandles1' },
        { text: 'Ritual Candles', value: 'RitualCandles2' }
    ],
    abilityEffects: {
        "DefianceSkull": {
            "skull": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceCultist": {
            "cultist": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceTablet": {
            "tablet": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "DefianceElderThing": {
            "elderThing": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "Defiance2XP": {
            "skull": { "type": "s", "value": 0, "param": "noRedraw" },
            "cultist": { "type": "s", "value": 0, "param": "noRedraw" },
            "tablet": { "type": "s", "value": 0, "param": "noRedraw" },
            "elderThing": { "type": "s", "value": 0, "param": "noRedraw" }
        },
        "JimCulver": {
            "skull": { "type": "s", "value": 0, "param": null }
        },
        "RitualCandles1": {
            "skull": { "type": "a", "value": 1, "param": null },
            "cultist": { "type": "a", "value": 1, "param": null },
            "tablet": { "type": "a", "value": 1, "param": null },
            "elderThing": { "type": "a", "value": 1, "param": null }
        },
        "RitualCandles2": {
            "skull": { "type": "a", "value": 1, "param": null },
            "cultist": { "type": "a", "value": 1, "param": null },
            "tablet": { "type": "a", "value": 1, "param": null },
            "elderThing": { "type": "a", "value": 1, "param": null }
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
        'notz_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'notz_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'notz_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'notz_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dl_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dl_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dl_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dl_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ptc_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 3, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ptc_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 3, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ptc_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 3, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ptc_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 1, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 3, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'fa_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'fa_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'fa_h': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'fa_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'cu_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'cu_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'cu_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'cu_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dea_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dea_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dea_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'dea_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 0, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'deb_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'deb_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'deb_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'deb_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ic_e': {
            '+1': { 'count': 2, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ic_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ic_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 3, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'ic_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 1, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 1, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 2, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'eote_e': {
            '+1': { 'count': 3, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 0, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 0, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'eote_s': {
            '+1': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 3, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 1, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 0, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 1, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'eote_h': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 2, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 2, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 0, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 2, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        },
        'eote_x': {
            '+1': { 'count': 0, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '0': { 'count': 1, 'value': 0, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-1': { 'count': 1, 'value': -1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-2': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-3': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-4': { 'count': 2, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-5': { 'count': 1, 'value': -5, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-6': { 'count': 0, 'value': -6, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-7': { 'count': 1, 'value': -7, 'redraw': false, 'autofail_after': null, 'autofail': false },
            '-8': { 'count': 0, 'value': -8, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'skull': { 'count': 2, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'cultist': { 'count': 1, 'value': -2, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'tablet': { 'count': 1, 'value': -3, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'elderThing': { 'count': 0, 'value': -4, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'star': { 'count': 1, 'value': 1, 'redraw': false, 'autofail_after': null, 'autofail': false },
            'autofail': { 'count': 1, 'value': -999, 'redraw': false, 'autofail_after': null, 'autofail': true },
            'bless': { 'count': 0, 'value': 2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'curse': { 'count': 0, 'value': -2, 'redraw': true, 'autofail_after': null, 'autofail': false },
            'frost': { 'count': 3, 'value': -1, 'redraw': true, 'autofail_after': 'frost', 'autofail': false }
        }
    }
}

let tryData = loadData(saveName)
if (tryData != null && checkStoredData(tryData, data)) {
    data = tryData
}
probabilityPlot(run(data.tokens, data.abilitiesActive, data.abilityEffects, data.modifiers, data.redrawMax, data.redrawHandling))

var app = new Vue({
    el: '#app',
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
        },
        updateRedrawsPlot: function () {
            redrawsPlot(this.tokens, 10)
        }
    }
})